// Supabase Edge Function: discover-feed (Deno). Called by the app with the member's JWT (verify_jwt = true):
// { filters, cursor?, refresh?, view?, pageSize? } → { items, nextCursor?, remaining, newSinceLastVisit, caughtUp }.
// { mode: 'sections', filters } → { featured, recommended, recent, newSince } (Home / Discover sections).
// Every database call runs AS THE MEMBER (anon key + their JWT), so RLS and the privacy projection apply.
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY.
import { discoverFeed } from './handler.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!jwt) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(String((body as { message?: string }).message ?? res.status)), { status: res.status });
    return body;
  };
  try {
    const r = await discoverFeed({ rpc, now: () => new Date(), newId: () => crypto.randomUUID() }, await req.json().catch(() => ({})));
    return Response.json(r.body, { status: r.status });
  } catch (e) {
    const msg = (e as Error).message ?? '';
    const status = (e as { status?: number }).status;
    // A public-key call (no member) is refused by the database with "permission denied".
    if (status === 401 || /unauthenticated|JWT|permission denied/i.test(msg)) return Response.json({ error: 'unauthenticated' }, { status: 401 });
    if (/forbidden/i.test(msg)) return Response.json({ error: 'forbidden' }, { status: 403 });
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});
