import { buildSeed, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { EMPTY_FILTERS } from '@/domain/search';
import { DemoBackend, freshDb, RESEND_COOLDOWN_MS, type DemoDb } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/**
 * Scale guard (expert-team pass 2026-10-29): with 2,000 members, every screen a member opens stays
 * fast. Discover, Featured and the per-request session check used to rescan whole tables for every
 * profile (quadratic); this keeps them linear. Bounds are generous so slow CI machines don't flake.
 */
const N = 2000;

async function bigCommunity() {
  const seed = buildSeed();
  const db = freshDb(new Date('2026-10-01T09:00:00Z'));
  const t = (lf: 'bride' | 'groom') => seed.profiles.find((p) => p.status === 'published' && p.biodata.basic.lookingFor === lf)!;
  for (let i = 0; i < N; i++) {
    const uid = `u_bulk${i}`;
    const tpl = t(i % 2 ? 'bride' : 'groom');
    db.users.push({ id: uid, countryCode: '+91', phone: `95${String(i).padStart(8, '0')}`, role: 'user', language: 'en', createdAt: '2026-09-01T00:00:00.000Z' });
    db.profiles.push({ ...JSON.parse(JSON.stringify(tpl)), id: `p_bulk${i}`, code: `HR-${50000 + i}`, userId: uid, createdAt: '2026-09-01T00:00:00.000Z' });
  }
  const me = seed.profiles.find((p) => p.userId === seed.users.find((u) => u.phone === DEMO_USER_PHONE)!.id)!;
  // A busy history: thousands of requests between others, some with the demo member, plus blocks.
  for (let i = 0; i < 4000; i++) {
    const a = `p_bulk${i % N}`;
    const b = `p_bulk${(i * 7 + 1) % N}`;
    db.requests.push({ id: `r_bulk${i}`, fromUserId: `u_bulk${i % N}`, fromProfileId: a, toUserId: `u_bulk${(i * 7 + 1) % N}`, toProfileId: b, pokes: [], status: i % 3 ? 'pending' : 'accepted', createdAt: '2026-09-20T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' } as DemoDb['requests'][number]);
  }
  for (let i = 0; i < 200; i++) {
    db.requests.push({ id: `r_me${i}`, fromUserId: `u_bulk${i * 2}`, fromProfileId: `p_bulk${i * 2}`, toUserId: me.userId, toProfileId: me.id, pokes: [], status: 'pending', createdAt: '2026-09-21T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' } as DemoDb['requests'][number]);
    db.blocks.push({ userId: `u_bulk${i * 2 + 1}`, blockedProfileId: me.id, createdAt: '2026-09-21T00:00:00.000Z' });
  }
  const storage = memoryKV({ 'hr.demo.db': JSON.stringify(db) });
  let clock = new Date('2026-10-01T09:00:00Z').getTime();
  const b = new DemoBackend({ storage, now: () => new Date(clock) });
  clock += RESEND_COOLDOWN_MS;
  await b.requestOtp('+91', DEMO_USER_PHONE);
  await b.verifyOtp('+91', DEMO_USER_PHONE, DEMO_OTP);
  return { b, me };
}

async function time<T>(fn: () => Promise<T>) {
  const t0 = performance.now();
  const out = await fn();
  return { out, ms: performance.now() - t0 };
}

describe('scale: 2,000 members', () => {
  it('Discover, Featured, Requests and Home stay fast and correct', async () => {
    const { b } = await bigCommunity();
    await b.getSession(); // warm the in-memory copy (first load parses storage)
    const search = await time(() => b.searchProfiles({ ...EMPTY_FILTERS }, 0, 10));
    const featured = await time(() => b.getFeatured());
    const requests = await time(() => b.getRequests());
    const dash = await time(() => b.getDashboard());
    const orders = await time(() => b.getMyOrders());
    if (process.env.SIM_REPORT) console.log({ search: search.ms, featured: featured.ms, requests: requests.ms, dashboard: dash.ms, orders: orders.ms });
    // Members who blocked me never appear; the ones who sent me interest show it on their card.
    const all = await b.searchProfiles({ ...EMPTY_FILTERS }, 0, 50);
    expect(all.total).toBeGreaterThan(800);
    const seen = new Map<string, (typeof all.items)[number]>();
    for (let page = 0; page * 50 < all.total; page++) for (const p of (await b.searchProfiles({ ...EMPTY_FILTERS }, page, 50)).items) seen.set(p.id, p);
    for (let i = 0; i < 200; i++) expect(seen.has(`p_bulk${i * 2 + 1}`)).toBe(false);
    expect(seen.get('p_bulk0')?.relation).toMatchObject({ status: 'pending', direction: 'received' });
    expect(requests.out.filter((v) => v.direction === 'received' && v.request.status === 'pending').length).toBeGreaterThanOrEqual(100);
    expect(search.ms).toBeLessThan(1500);
    expect(featured.ms).toBeLessThan(1500);
    expect(requests.ms).toBeLessThan(1500);
    expect(dash.ms).toBeLessThan(1500);
  }, 120_000);
});
