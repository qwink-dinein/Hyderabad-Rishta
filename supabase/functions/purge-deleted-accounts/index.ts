// Supabase Edge Function: purge-deleted-accounts (Deno). Called daily by pg_cron (migration
// 20261128000000_deleted_accounts.sql) with a job secret kept in Supabase Vault; verify_jwt = false
// because the caller is the database, and the secret is checked below. It only ever erases copies the
// database reports as past their 30 days. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
import { purgeExpired, type PurgeDeps } from './purge.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };
const url = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

const rpc = async (fn: string, args: Record<string, unknown>) => {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: admin, body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const deps: PurgeDeps = {
  due: async (limit) => (await rpc('due_deleted_account_purges', { p_limit: limit })) ?? [],
  removePhotos: async (paths) => {
    const res = await fetch(`${url}/storage/v1/object/profile-photos`, { method: 'DELETE', headers: admin, body: JSON.stringify({ prefixes: paths }) });
    return res.ok;
  },
  finish: async (ids) => Number((await rpc('finish_deleted_account_purge', { p_ids: ids })) ?? 0),
  log: (m) => console.log(m),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = req.headers.get('x-job-secret') ?? '';
  const ok = secret.length >= 32 && (await rpc('check_job_secret', { p_name: 'purge_deleted_accounts', p_secret: secret }).catch(() => false)) === true;
  if (!ok) return new Response('forbidden', { status: 403 });
  try {
    return Response.json(await purgeExpired(deps));
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});
