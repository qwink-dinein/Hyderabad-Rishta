/**
 * @jest-environment ./__tests__/live/nodeFetchEnv.js
 */
import { createClient } from '@supabase/supabase-js';
import { buildSeed } from '@/data/seed';
import { EMPTY_FILTERS } from '@/domain/search';
import type { Biodata } from '@/domain/types';
import { memoryKV } from '@/services/storage';
import { SupabaseBackend } from '@/services/supabase/supabaseBackend';

/**
 * LIVE end-to-end check of the Supabase adapter against the real project — skipped unless LIVE_SUPABASE=1.
 * Needs (Supabase dashboard): Phone provider on, and test phone numbers with fixed code 123456:
 *   919000000001 (bride), 919000000002 (groom), 919000000004 (test admin — given an invite by the runner).
 * Run: LIVE_SUPABASE=1 NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt npx jest live/supabaseLive
 * Test accounts are deleted at the end (members via delete-account; the admin by the runner's SQL cleanup).
 */
const URL = 'https://hlthzrznuztapfsloxkm.supabase.co';
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const run = process.env.LIVE_SUPABASE === '1' && KEY ? describe : describe.skip;
const CODE = '123456';
const PIN = '4719';
const BRIDE = '9000000001';
const GROOM = '9000000002';
const ADMIN = '9000000004';

// Node's real fetch (see nodeFetchEnv.js); the preset's polyfill cannot reach the network in Node.
const nodeFetch: typeof fetch = (...a) => ((globalThis as unknown as { __nodeFetch?: typeof fetch }).__nodeFetch ?? fetch)(...a);
function phone() {
  const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: nodeFetch } });
  return new SupabaseBackend(client, { secure: memoryKV(), platform: 'android' });
}
function biodata(lookingFor: 'bride' | 'groom', name: string): Biodata {
  const src = buildSeed().profiles.find((p) => p.status === 'published' && p.biodata.basic.lookingFor === lookingFor)!.biodata;
  const b: Biodata = JSON.parse(JSON.stringify(src));
  b.basic.fullName = name;
  b.photos = [];
  b.privacy.photoVisibility = 'public';
  return b;
}
// 1×1 JPEG
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

run('live Supabase adapter', () => {
  jest.setTimeout(120_000);
  let bride: SupabaseBackend, groom: SupabaseBackend, admin: SupabaseBackend;
  const ids: Record<string, string> = {};
  beforeAll(() => {
    bride = phone();
    groom = phone();
    admin = phone();
  });

  it('members sign in with the test code, set a PIN and submit biodatas', async () => {
    for (const [b, num, lf, name] of [[bride, BRIDE, 'groom', 'Live Test Bride'], [groom, GROOM, 'bride', 'Live Test Groom']] as const) {
      await b.requestOtp('+91', num);
      const r = await b.verifyOtp('+91', num, CODE);
      expect(r.user.role).toBe('user');
      if (r.needsPin) await b.setPin(PIN);
      const bd = biodata(lf, name);
      if (b === bride) bd.photos = [{ id: 'livephoto1', uri: JPEG }];
      const saved = await b.saveDraft(bd, 7);
      if (b === bride) expect(saved.biodata.photos[0].uri).toMatch(/^https:\/\/.+token=/); // uploaded, shown via a signed link
      const sub = await b.submitForPublication();
      expect(['pending', 'published']).toContain(sub.profile.status);
      ids[num] = sub.profile.id;
    }
  });

  it('an admin approves both and sees masked data', async () => {
    await admin.requestOtp('+91', ADMIN);
    const r = await admin.verifyOtp('+91', ADMIN, CODE);
    expect(['admin', 'master']).toContain(r.user.role);
    for (const id of [ids[BRIDE], ids[GROOM]]) {
      const p = await admin.adminSetProfileStatus(id, 'published');
      expect(p.status).toBe('published');
    }
    const stats = await admin.adminStats();
    expect(stats.profiles.published).toBeGreaterThanOrEqual(2);
    const users = await admin.adminListUsers();
    expect(JSON.stringify(users)).not.toContain(BRIDE);
  });

  it('discovery, profile view with photo, interest, acceptance and number sharing work end to end', async () => {
    const found = await groom.searchProfiles({ ...EMPTY_FILTERS }, 0, 50);
    const her = found.items.find((p) => p.id === ids[BRIDE]);
    expect(her).toBeDefined();
    const prof = await groom.getProfile(ids[BRIDE]);
    expect(prof.photos[0]?.uri).toMatch(/^https:\/\//);
    expect((await nodeFetch(prof.photos[0].uri)).status).toBe(200);
    const req = await groom.sendRequest(ids[BRIDE], { message: 'Assalamu alaikum', offerPhone: false, consent: false, idempotencyKey: `live-${Date.now()}` });
    expect(req.status).toBe('pending');
    const status = await groom.getRequestStatusWith(ids[BRIDE]);
    expect(status?.request.id).toBe(req.id);
    const inbox = await bride.getRequests();
    const mine = inbox.find((v) => v.request.id === req.id)!;
    expect(mine.direction).toBe('received');
    expect(mine.other.contact).toBeUndefined();
    await bride.respondToRequest(req.id, 'accepted');
    const offer = await bride.offerPhone(req.id, true, `offer-${Date.now()}`);
    await groom.respondToPhoneOffer(offer.id, 'accepted');
    const after = await groom.getRequestStatusWith(ids[BRIDE]);
    expect(after?.other.contact?.phone).toBe(BRIDE); // shared only after both agreed
    const dash = await bride.getDashboard();
    expect(dash.views).toBeGreaterThanOrEqual(1);
    expect((await bride.getNotifications()).length).toBeGreaterThan(0);
  });

  it('boost, featured, shortlist, block and PIN login work', async () => {
    const boost = await bride.startBoost();
    expect(['free', 'pending']).toContain(boost.order.status);
    if (boost.order.status === 'free') expect((await groom.getFeatured()).some((p) => p.id === ids[BRIDE])).toBe(true);
    // A member only ever sees the opposite side, even when the filter asks for their own (owner report 2026-11-01).
    for (const [who, own, other] of [[groom, 'groom', 'bride'], [bride, 'bride', 'groom']] as const) {
      const f = { ...EMPTY_FILTERS, show: own };
      const s = await who.getDiscoverSections(f);
      const feed = await who.getDiscoverFeed(f, { refresh: true });
      const all = [...(await who.searchProfiles(f, 0, 50)).items, ...feed.items, ...s.featured, ...s.recommended, ...s.recent, ...s.newSince];
      expect(all.length).toBeGreaterThan(0);
      expect(all.filter((p) => p.profileType !== other)).toEqual([]);
    }
    expect(await groom.toggleShortlist(ids[BRIDE])).toBe(true);
    expect((await groom.getShortlist()).some((p) => p.id === ids[BRIDE])).toBe(true);
    await groom.blockProfile(ids[BRIDE]);
    expect((await groom.getBlockedIds())).toContain(ids[BRIDE]);
    await groom.unblockProfile(ids[BRIDE]);
    await bride.logout();
    const back = await bride.pinLogin('+91', BRIDE, PIN);
    expect(back.user.phone).toBe(BRIDE);
  });

  it('members delete their own accounts (clean-up)', async () => {
    await bride.deleteAccount();
    await groom.deleteAccount();
    expect(await bride.getSession()).toBeNull();
  });
});
