// Core of the photo-urls Edge Function (pure, unit-tested in __tests__/photoUrlsEdge.test.ts).
// Profile photos are private files (profile-photos/<owner-uid>/<id>.jpg). The app asks for short-lived
// links in batches; the database (photo_paths_for, run as the caller) decides which paths the caller may
// see under the owner's photo visibility and consent, and ONLY those are signed.

export interface UrlDeps {
  /** photo_paths_for(paths) evaluated with the caller's JWT. */
  allowed(jwt: string, paths: string[]): Promise<string[]>;
  /** Signs paths in the private bucket (service role). Returns path → absolute URL. */
  sign(paths: string[], expiresIn: number): Promise<Record<string, string>>;
}
export interface UrlResult {
  status: number;
  body: Record<string, unknown>;
}

export const URL_TTL_SECONDS = 60 * 60;
const MAX_PATHS = 200;

export async function photoUrls(deps: UrlDeps, jwt: string | null, input: unknown): Promise<UrlResult> {
  if (!jwt) return { status: 401, body: { error: 'unauthenticated' } };
  const raw = (input as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(raw) || raw.length > MAX_PATHS || raw.some((p) => typeof p !== 'string' || p.length > 200)) {
    return { status: 400, body: { error: 'validation' } };
  }
  const paths = [...new Set(raw as string[])];
  if (!paths.length) return { status: 200, body: { urls: {}, expiresIn: URL_TTL_SECONDS } };
  const ok = new Set(await deps.allowed(jwt, paths));
  const allowed = paths.filter((p) => ok.has(p));
  const urls = allowed.length ? await deps.sign(allowed, URL_TTL_SECONDS) : {};
  // Never sign anything the database did not approve, whatever the signer returned.
  for (const k of Object.keys(urls)) if (!ok.has(k)) delete urls[k];
  return { status: 200, body: { urls, expiresIn: URL_TTL_SECONDS } };
}
