// Supabase Edge Function: photo-urls (Deno). Called by the app with the member's JWT (verify_jwt = true):
// { paths: string[] } → { urls: { [path]: signedUrl }, expiresIn }. Secrets: SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
import { photoUrls, type UrlDeps } from './urls.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const deps: UrlDeps = {
  allowed: async (jwt, paths) => {
    const res = await fetch(`${url}/rest/v1/rpc/photo_paths_for`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_paths: paths }),
    });
    if (!res.ok) return [];
    return (await res.json()) as string[];
  },
  sign: async (paths, expiresIn) => {
    const res = await fetch(`${url}/storage/v1/object/sign/profile-photos`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn, paths }),
    });
    if (!res.ok) throw new Error(`sign failed: ${res.status}`);
    const out: Record<string, string> = {};
    for (const r of (await res.json()) as { path?: string; signedURL?: string; error?: string | null }[]) {
      if (r.path && r.signedURL && !r.error) out[r.path] = `${url}/storage/v1${r.signedURL}`;
    }
    return out;
  },
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  try {
    const r = await photoUrls(deps, jwt, await req.json().catch(() => null));
    return Response.json(r.body, { status: r.status });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
});
