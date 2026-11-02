// Supabase Edge Function: send-whatsapp-otp (Deno). Wired as Auth → Hooks → "Send SMS hook" (HTTPS),
// so every login code Supabase generates is delivered on WhatsApp through Waplify instead of SMS.
// verify_jwt = false: Supabase Auth calls it with a Standard Webhooks signature, checked below.
// Secrets: SEND_SMS_HOOK_SECRET ("v1,whsec_..." shown when the hook is created), WAPLIFY_API_KEY,
// WAPLIFY_TEMPLATE_NAME (the approved Authentication template), WAPLIFY_CODE_KEYS (body_data keys that
// receive the code, comma-separated; default "1"), optional WAPLIFY_BASE_URL.
// SMS backup (optional, 2026-11-02): SMS_PROVIDER = "msg91" (MSG91_AUTH_KEY, MSG91_TEMPLATE_ID — a DLT
// template containing ##OTP##) or "twilio" (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM). Without
// them, codes go by WhatsApp only, exactly as before. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set by
// Supabase) read a member's "Send by SMS instead" request (take_otp_channel).
import { sendOtp, toWaplifyPhone, verifyHook, type SmsConfig } from './send.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const env = (k: string) => Deno.env.get(k) ?? '';

function smsConfig(): SmsConfig | null {
  const p = env('SMS_PROVIDER').toLowerCase();
  if (p === 'msg91') return { provider: 'msg91', authKey: env('MSG91_AUTH_KEY'), templateId: env('MSG91_TEMPLATE_ID') };
  if (p === 'twilio') return { provider: 'twilio', accountSid: env('TWILIO_ACCOUNT_SID'), authToken: env('TWILIO_AUTH_TOKEN'), from: env('TWILIO_FROM') };
  return null;
}

/** Did this number ask for SMS in the last few minutes? (One-time: reading it clears it.) */
async function prefersSms(phone: string | null): Promise<boolean> {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!phone || !url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/take_otp_channel`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_phone: phone }),
    });
    return res.ok && (await res.json()) === 'sms';
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const body = await req.text();
  if (!(await verifyHook(env('SEND_SMS_HOOK_SECRET'), req.headers, body, Math.floor(Date.now() / 1000)))) {
    return Response.json({ error: { http_code: 401, message: 'Invalid signature' } }, { status: 401 });
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(body);
  } catch {
    payload = null;
  }
  const sms = smsConfig();
  const phone = toWaplifyPhone((payload as { user?: { phone?: unknown } } | null)?.user?.phone);
  const r = await sendOtp(
    {
      apiKey: env('WAPLIFY_API_KEY'),
      templateName: env('WAPLIFY_TEMPLATE_NAME'),
      codeKeys: (env('WAPLIFY_CODE_KEYS') || '1').split(',').map((s) => s.trim()).filter(Boolean),
      baseUrl: env('WAPLIFY_BASE_URL') || undefined,
    },
    { fetch: (url, init) => fetch(url, init), log: (m) => console.log(m) },
    payload,
    { sms, preferSms: sms ? await prefersSms(phone) : false },
  );
  return Response.json(r.body, { status: r.status });
});
