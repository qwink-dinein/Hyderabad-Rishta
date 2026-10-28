// Supabase Edge Function: push-dispatch (Deno). Invoked every minute by pg_cron (see migration
// 20261101000000_boost_and_push.sql). Requires secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// PUSH_CRON_SECRET; optional EXPO_ACCESS_TOKEN. Never exposed to clients.
import { checkReceipts, dispatchOnce, type Deps } from './dispatch.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cronSecret = Deno.env.get('PUSH_CRON_SECRET');

const deps: Deps = {
  accessToken: Deno.env.get('EXPO_ACCESS_TOKEN') ?? undefined,
  fetch: (u, init) => fetch(u, init),
  rpc: async (fn, args) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },
};

Deno.serve(async (req) => {
  if (!cronSecret || req.headers.get('Authorization') !== `Bearer ${cronSecret}`) return new Response('forbidden', { status: 403 });
  const sent = await dispatchOnce(deps);
  const receipts = await checkReceipts(deps);
  return Response.json({ ...sent, ...receipts });
});
