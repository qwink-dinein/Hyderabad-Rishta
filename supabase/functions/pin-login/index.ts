// Supabase Edge Function: pin-login (Deno). Public endpoint (verify_jwt = false) for returning
// members; protected by the device key + PIN + server-side lockout in pin_login_check.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
//
// Issuing the session: Supabase Auth has no "create a session for user X" API, so after the
// database approves the login we set a random single-use password on the user (admin API), sign in
// with it (normal Auth session with refresh token), and immediately replace it with another random
// value. The member never has or knows a password; phone + password sign-in must be enabled.
import { pinLogin, type LoginDeps, type Session } from './login.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

function randomSecret() {
  const b = new Uint8Array(48);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
async function setPassword(userId: string, password: string) {
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'PUT', headers: admin, body: JSON.stringify({ password }) });
  if (!res.ok) throw new Error(`password rotate failed: ${res.status}`);
}

const deps: LoginDeps = {
  rpc: async (fn, args) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: admin, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
    return res.json();
  },
  mintSession: async (userId, phoneE164) => {
    const once = randomSecret();
    await setPassword(userId, once);
    try {
      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneE164, password: once }),
      });
      if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
      return (await res.json()) as Session;
    } finally {
      await setPassword(userId, randomSecret()); // the one-time password is dead immediately
    }
  },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  try {
    const r = await pinLogin(deps, await req.json().catch(() => null));
    return Response.json(r.body, { status: r.status });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});
