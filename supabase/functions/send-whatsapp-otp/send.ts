// Core of the send-whatsapp-otp Edge Function (pure, testable in Jest). Supabase Auth's "Send SMS hook"
// calls the function with the one-time code it generated; we deliver it on WhatsApp through Waplify
// using a Meta-approved Authentication template. Supabase still creates, expires, rate-limits and
// verifies the code — this function only delivers it. The code is never logged.
//
// Hook request (Standard Webhooks, signed with SEND_SMS_HOOK_SECRET "v1,whsec_<base64>"):
//   { "user": { "id": "...", "phone": "919876543210", ... }, "sms": { "otp": "123456" } }
// Hook reply: 200 {} on success, or { "error": { "http_code": <n>, "message": "..." } }.
// Waplify: POST https://server.waplify.io/api/v1/messages/send, Authorization: Bearer wapl_...,
//   { template_name, contact_phone: "91XXXXXXXXXX" (no +), contact_name, body_data }.

export interface WaplifyConfig {
  apiKey: string;
  templateName: string;
  /** Keys of `body_data` that receive the code (Authentication templates usually have one, "1"). */
  codeKeys: string[];
  baseUrl?: string;
  contactName?: string;
}

export interface SendDeps {
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; headers: { get(k: string): string | null }; json(): Promise<unknown> }>;
  log?: (msg: string) => void;
}

export interface HookResult {
  status: number;
  body: Record<string, unknown>;
}

const SIGNATURE_TOLERANCE_S = 5 * 60;

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Standard Webhooks verification (what Supabase Auth hooks use): HMAC-SHA256 over
 * `${webhook-id}.${webhook-timestamp}.${body}` with the base64 secret after "whsec_", compared against
 * every "v1,<sig>" in `webhook-signature`, and a timestamp within 5 minutes (no replays).
 */
export async function verifyHook(secret: string, headers: { get(k: string): string | null }, body: string, nowS: number): Promise<boolean> {
  const id = headers.get('webhook-id');
  const ts = headers.get('webhook-timestamp');
  const sigs = headers.get('webhook-signature');
  if (!id || !ts || !sigs || !secret) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false;
  const raw = secret.replace(/^v1,/, '').replace(/^whsec_/, '');
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = b64ToBytes(raw);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  return sigs.split(' ').some((s) => {
    const [v, sig] = s.split(',');
    return v === 'v1' && !!sig && safeEqual(sig, expected);
  });
}

/** Supabase keeps phones as digits with the country code ("919876543210", sometimes "+91…"). Waplify wants the same, no "+". */
export function toWaplifyPhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const digits = phone.replace(/[\s()+-]/g, '');
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

const hookError = (http_code: number, message: string): HookResult => ({ status: http_code, body: { error: { http_code, message } } });

/** Handles one verified hook call: validate, send through Waplify, map the outcome for Supabase Auth. */
export async function sendOtp(cfg: WaplifyConfig, deps: SendDeps, payload: unknown): Promise<HookResult> {
  const p = payload as { user?: { phone?: unknown }; sms?: { otp?: unknown } } | null;
  const phone = toWaplifyPhone(p?.user?.phone);
  const otp = p?.sms?.otp;
  if (!phone || typeof otp !== 'string' || !/^\d{4,10}$/.test(otp)) return hookError(400, 'Invalid phone number or code');
  if (!cfg.apiKey || !cfg.templateName || !cfg.codeKeys.length) return hookError(500, 'WhatsApp sending is not configured');
  const body_data: Record<string, string> = {};
  for (const k of cfg.codeKeys) body_data[k] = otp;
  let res: Awaited<ReturnType<SendDeps['fetch']>>;
  try {
    res = await deps.fetch(`${cfg.baseUrl ?? 'https://server.waplify.io'}/api/v1/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_name: cfg.templateName, contact_phone: phone, contact_name: cfg.contactName ?? 'Hyderabad Rishta member', body_data }),
    });
  } catch {
    deps.log?.('waplify unreachable');
    return hookError(503, 'Could not send the code on WhatsApp. Please try again.');
  }
  const reqId = res.headers.get('X-Request-ID') ?? '-';
  const out = (await res.json().catch(() => ({}))) as { status?: string; error?: string; message?: string };
  if (res.status >= 200 && res.status < 300 && out.status === 'success') return { status: 200, body: {} };
  // Log what support needs (status, Waplify error code, request id) — never the code or full number.
  deps.log?.(`waplify ${res.status} ${out.error ?? ''} req=${reqId} to=…${phone.slice(-4)}`);
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After')) || 60;
    return hookError(429, `Too many codes are being sent right now. Please try again in ${wait} seconds.`);
  }
  if (res.status === 400) return hookError(400, 'Could not send the code to this number on WhatsApp.');
  // 401/403/404 (key, template) and 5xx are our setup or Waplify's side, not the member's.
  return hookError(503, 'Could not send the code on WhatsApp. Please try again.');
}
