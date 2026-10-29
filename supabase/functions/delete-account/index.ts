// Supabase Edge Function: delete-account (Deno). Called by the app with the member's JWT (verify_jwt = true).
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
import { deleteAccount, type RemoveDeps } from './remove.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

const deps: RemoveDeps = {
  caller: async (jwt) => {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` } });
    if (!res.ok) return null;
    const { id } = (await res.json()) as { id: string };
    const rows = await fetch(`${url}/rest/v1/app_users?id=eq.${id}&select=role,profiles(code)`, { headers: admin }).then((r) => r.json());
    const row = (rows as { role?: string; profiles?: { code?: string }[] | { code?: string } }[])[0];
    const prof = Array.isArray(row?.profiles) ? row?.profiles[0] : row?.profiles;
    return { id, role: row?.role ?? 'user', code: prof?.code };
  },
  listPhotos: async (userId) => {
    const res = await fetch(`${url}/storage/v1/object/list/profile-photos`, { method: 'POST', headers: admin, body: JSON.stringify({ prefix: `${userId}/`, limit: 100 }) });
    if (!res.ok) return [];
    return ((await res.json()) as { name: string }[]).map((o) => `${userId}/${o.name}`);
  },
  removePhotos: async (paths) => {
    await fetch(`${url}/storage/v1/object/profile-photos`, { method: 'DELETE', headers: admin, body: JSON.stringify({ prefixes: paths }) });
  },
  audit: async (userId, code) => {
    await fetch(`${url}/rest/v1/audit_events`, { method: 'POST', headers: { ...admin, Prefer: 'return=minimal' }, body: JSON.stringify({ actor_id: userId, action: 'account.deleted', target: userId, meta: { code: code ?? null } }) });
  },
  deleteAuthUser: async (userId) => {
    const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: admin });
    if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  try {
    const r = await deleteAccount(deps, jwt);
    return Response.json(r.body, { status: r.status });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});
