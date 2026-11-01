// Supabase Edge Function: master-backup-phone (Deno). Called by the app with the master's JWT (verify_jwt = true).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, WAPLIFY_API_KEY, WAPLIFY_TEMPLATE_NAME,
// WAPLIFY_CODE_KEYS (the same WhatsApp template as login codes). Optional BACKUP_CODE_SECRET (HMAC key;
// defaults to the service role key, which never leaves the server).
import { backupPhone, type BackupDeps } from './backup.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const secret = Deno.env.get('BACKUP_CODE_SECRET') || serviceKey;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
const enc = new TextEncoder();
let key: Promise<CryptoKey> | undefined;

const deps: BackupDeps = {
  caller: async (jwt) => {
    if (!jwt) return null;
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` } });
    if (!res.ok) return null;
    return ((await res.json()) as { id?: string }).id ?? null;
  },
  rpc: async (fn, args) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: admin, body: JSON.stringify(args) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const b = body as { message?: string; hint?: string };
      throw Object.assign(new Error(String(b.message ?? res.status)), { hint: b.hint ?? undefined });
    }
    return body;
  },
  hmac: async (message) => {
    key ??= crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', await key, enc.encode(message));
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
  },
  newCode: () => {
    // Uniform 6 digits: reject values that would bias the modulo.
    const buf = new Uint32Array(1);
    do crypto.getRandomValues(buf);
    while (buf[0] >= 4294000000);
    return String(buf[0] % 1000000).padStart(6, '0');
  },
  waplify: {
    apiKey: Deno.env.get('WAPLIFY_API_KEY') ?? '',
    templateName: Deno.env.get('WAPLIFY_TEMPLATE_NAME') ?? '',
    codeKeys: (Deno.env.get('WAPLIFY_CODE_KEYS') ?? '1').split(',').map((k) => k.trim()).filter(Boolean),
    contactName: 'Hyderabad Rishta admin',
  },
  send: { fetch: (u, init) => fetch(u, init), log: (m) => console.log(m) },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  try {
    const r = await backupPhone(deps, jwt, await req.json().catch(() => ({})));
    return Response.json(r.body, { status: r.status });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});
