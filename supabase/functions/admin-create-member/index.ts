// Supabase Edge Function: admin-create-member (Deno). Called by the admin app with the admin's JWT
// (verify_jwt = true). Creates the Auth user for a phone without OTP, then the account + draft biodata.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
// Later edits/publishing use the admin_save_member_biodata / admin_publish_member RPCs directly.
import { createMember, type CreateDeps } from './create.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

async function rpc(fn: string, args: Record<string, unknown>, headers: Record<string, string> = admin) {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String((body as { message?: string }).message ?? `${fn} failed: ${res.status}`));
  return body;
}

const deps: CreateDeps = {
  caller: async (jwt) => {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` } });
    if (!res.ok) return null;
    const user = (await res.json()) as { id: string };
    // is_admin() evaluated as the caller (their JWT), so suspended/deleted admins are refused.
    const isAdmin = await rpc('is_admin', {}, { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' });
    return { id: user.id, isAdmin: isAdmin === true };
  },
  ensureAuthUser: async (phoneE164) => {
    // phone_confirm stays false: the owner proves the number with their own OTP on first sign-in.
    const res = await fetch(`${url}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ phone: phoneE164 }) });
    if (res.ok) return { id: ((await res.json()) as { id: string }).id, created: true };
    // Already registered with Auth (e.g. started a sign-in once): reuse that user; the database
    // still refuses if an app account exists for the number.
    const list = await fetch(`${url}/auth/v1/admin/users?filter=${encodeURIComponent(phoneE164.replace('+', ''))}`, { headers: admin });
    const users = ((await list.json()) as { users?: { id: string; phone?: string }[] }).users ?? [];
    const found = users.find((u) => `+${u.phone}` === phoneE164 || u.phone === phoneE164);
    if (!found) throw new Error(`auth user create failed: ${res.status}`);
    return { id: found.id, created: false };
  },
  deleteAuthUser: async (id) => {
    await fetch(`${url}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: admin });
  },
  rpc: (fn, args) => rpc(fn, args),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  try {
    const r = await createMember(deps, jwt, await req.json().catch(() => null));
    return Response.json(r.body, { status: r.status });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});
