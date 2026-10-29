import { photoUrls, type UrlDeps } from '../supabase/functions/photo-urls/urls';

/** The photo-urls Edge Function core: signs only what the database approved for this caller. */
function fake(allowedPaths: string[], extraSigned: Record<string, string> = {}) {
  const signed: string[][] = [];
  const deps: UrlDeps = {
    allowed: async (jwt, paths) => (jwt === 'good' ? paths.filter((p) => allowedPaths.includes(p)) : []),
    sign: async (paths) => {
      signed.push(paths);
      return { ...Object.fromEntries(paths.map((p) => [p, `https://x/${p}?token=t`])), ...extraSigned };
    },
  };
  return { deps, signed };
}
const A = '00000000-0000-0000-0000-0000000000a1/p1.jpg';
const B = '00000000-0000-0000-0000-0000000000b1/p1.jpg';

it('signs only the approved paths (deduplicated)', async () => {
  const f = fake([A]);
  const r = await photoUrls(f.deps, 'good', { paths: [A, B, A] });
  expect(r.status).toBe(200);
  expect(Object.keys(r.body.urls as object)).toEqual([A]);
  expect(f.signed).toEqual([[A]]);
});

it('never returns a link the database did not approve, even if the signer does', async () => {
  const f = fake([A], { [B]: 'https://x/leak' });
  const r = await photoUrls(f.deps, 'good', { paths: [A, B] });
  expect(Object.keys(r.body.urls as object)).toEqual([A]);
});

it('refuses signed-out callers and bad input; nothing approved means nothing signed', async () => {
  expect((await photoUrls(fake([A]).deps, null, { paths: [A] })).status).toBe(401);
  for (const bad of [null, {}, { paths: 'x' }, { paths: [1] }, { paths: Array(201).fill(A) }, { paths: ['x'.repeat(201)] }])
    expect((await photoUrls(fake([A]).deps, 'good', bad)).status).toBe(400);
  const f = fake([]);
  const r = await photoUrls(f.deps, 'good', { paths: [B] });
  expect(r.body.urls).toEqual({});
  expect(f.signed).toHaveLength(0);
});
