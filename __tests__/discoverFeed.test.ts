import { buildSeed, DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { buildFeedOrder, DEFAULT_FEED_CONFIG, filtersKey, type FeedContext } from '@/domain/feed';
import { EMPTY_FILTERS } from '@/domain/search';
import type { Biodata, PublicProfile } from '@/domain/types';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV, type KV } from '@/services/storage';

/** Owner Mini PRD 2026-10-31: persistent profile rotation in Discover. */
const DAY = 86400000;
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);

describe('feed engine (domain/feed.ts)', () => {
  const at = (daysAgo: number) => new Date(clock - daysAgo * DAY).toISOString();
  const prof = (id: string, o: Partial<PublicProfile> = {}): PublicProfile =>
    ({ id, profileType: 'bride', displayName: id, age: 26, heightCm: 160, maritalStatus: 'never_married', motherTongue: 'urdu', createdFor: 'self', acceptsRequests: true,
      photos: [], photosHidden: false, location: { country: 'India', state: 'Telangana', city: 'Hyderabad' }, career: { education: 'bachelors', profession: 'it' },
      religion: {}, familyHidden: false, preferences: { maritalStatus: [], education: [], profession: [], countries: [], states: [], cities: [], motherTongues: [] },
      boosted: false, publishedAt: at(60), granted: { photos: false, phone: false, fullBiodata: false }, code: id, ...o }) as PublicProfile;
  const ctx = (o: Partial<FeedContext> = {}): FeedContext => ({
    viewerId: 'me', seen: new Map(), shortlisted: new Set(), activeRequests: new Set(), cfg: DEFAULT_FEED_CONFIG, now: now(),
    prefs: { maritalStatus: [], education: [], profession: [], countries: [], states: [], cities: ['Secunderabad'], motherTongues: [] }, ...o,
  });

  it('blends ~40% new, 30% preference, 20% other, 10% boosted when there is enough of each', () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) => prof(`new${i}`, { publishedAt: at(1 + i / 10) })),
      ...Array.from({ length: 6 }, (_, i) => prof(`pref${i}`, { location: { country: 'India', state: 'Telangana', city: 'Secunderabad' } })),
      ...Array.from({ length: 4 }, (_, i) => prof(`other${i}`)),
      ...Array.from({ length: 2 }, (_, i) => prof(`boost${i}`, { boosted: true })),
    ];
    const { ids } = buildFeedOrder(list, EMPTY_FILTERS, ctx());
    const first10 = ids.slice(0, 10);
    const count = (k: string) => first10.filter((x) => x.startsWith(k)).length;
    expect([count('new'), count('pref'), count('other'), count('boost')]).toEqual([4, 3, 2, 1]);
    expect(new Set(ids).size).toBe(list.length); // nothing twice
  });

  it('adjusts gracefully when a group runs out, and boost only gets its share', () => {
    const list = [prof('boost1', { boosted: true }), prof('boost2', { boosted: true }), prof('boost3', { boosted: true }), prof('o1'), prof('o2'), prof('o3')];
    const { ids } = buildFeedOrder(list, EMPTY_FILTERS, ctx());
    expect(ids.slice(0, 3).every((x) => x.startsWith('o'))).toBe(true); // other profiles fill the empty new/pref slots first
    expect(ids).toHaveLength(6);
  });

  it('excludes seen (cooldown), shortlisted and actively requested profiles; seen ones return after cooldown, last', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((x) => prof(x));
    const seen = new Map([
      ['a', { profileId: 'a', impressedAt: at(1) }], // 1 day ago → still cooling down (3 days)
      ['b', { profileId: 'b', impressedAt: at(4) }], // 4 days ago → back, but after unseen ones
      ['c', { profileId: 'c', viewedAt: at(5), impressedAt: at(5) }], // opened 5 days ago → 7-day cooldown
    ]);
    const { ids } = buildFeedOrder(list, EMPTY_FILTERS, ctx({ seen, shortlisted: new Set(['d']), activeRequests: new Set() }));
    expect(ids).toEqual(['e', 'b']);
    // Explicit searches and "shortlisted only" show every match.
    expect(buildFeedOrder(list, { ...EMPTY_FILTERS, keyword: 'x' }, ctx({ seen })).ids.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('gives each filter configuration its own key', () => {
    expect(filtersKey(EMPTY_FILTERS)).toBe(filtersKey({ ...EMPTY_FILTERS, cities: [] }));
    expect(filtersKey(EMPTY_FILTERS)).not.toBe(filtersKey({ ...EMPTY_FILTERS, cities: ['Hyderabad'] }));
    expect(filtersKey({ ...EMPTY_FILTERS, cities: ['A', 'B'] })).toBe(filtersKey({ ...EMPTY_FILTERS, cities: ['B', 'A'] }));
    expect(filtersKey(EMPTY_FILTERS, 'new')).not.toBe(filtersKey(EMPTY_FILTERS, 'all'));
  });
});

describe('Discover rotation in the demo backend (acceptance criteria)', () => {
  let storage: KV;
  const phone = () => new DemoBackend({ storage, secure: memoryKV(), now });
  async function login(b: DemoBackend, num = DEMO_USER_PHONE) {
    clock += RESEND_COOLDOWN_MS + 1;
    await b.requestOtp('+91', num);
    await b.verifyOtp('+91', num, DEMO_OTP);
    return b;
  }
  const all = async (b: DemoBackend, req: { refresh?: boolean; view?: 'all' | 'new' } = {}) => {
    const out: string[] = [];
    let page = await b.getDiscoverFeed(EMPTY_FILTERS, { ...req, pageSize: 5 });
    out.push(...page.items.map((p) => p.id));
    while (page.nextCursor) {
      page = await b.getDiscoverFeed(EMPTY_FILTERS, { cursor: page.nextCursor, pageSize: 5 });
      out.push(...page.items.map((p) => p.id));
    }
    return out;
  };
  beforeEach(() => {
    storage = memoryKV();
    clock = new Date('2026-10-01T09:00:00Z').getTime();
  });

  it('1–3: five seen profiles are not at the top after closing the app or logging in again; the next ones are', async () => {
    const b = await login(phone());
    const first = await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 });
    const seen5 = first.items.map((p) => p.id);
    expect(seen5).toHaveLength(5);
    const second = await b.getDiscoverFeed(EMPTY_FILTERS, { cursor: first.nextCursor, pageSize: 5 }); // fetched, NOT seen
    await b.recordImpressions(seen5);
    // App restarts (new instance on the same device storage) a few hours later.
    clock += 3 * 3600_000;
    const reopened = await login(phone());
    const top = (await reopened.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 })).items.map((p) => p.id);
    expect(top.some((id) => seen5.includes(id))).toBe(false);
    expect(top[0]).toBe(second.items[0].id); // continues with the next unseen profile (fetched-only cards still count as unseen)
    // Logging out and back in keeps the progress too.
    await reopened.logout();
    const again = await login(reopened);
    expect((await again.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 })).items.map((p) => p.id)).toEqual(top);
  });

  it('pages never repeat a profile and keep their order', async () => {
    const b = await login(phone());
    const ids = await all(b);
    expect(new Set(ids).size).toBe(ids.length);
    expect(await all(b)).toEqual(ids); // same snapshot → same order
  });

  it('5: shortlisted and actively requested profiles leave Discover but stay in Shortlist / Requests', async () => {
    const b = await login(phone());
    const [a, c] = (await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 })).items;
    await b.toggleShortlist(a.id);
    await b.sendRequest(c.id, { offerPhone: false, consent: false, idempotencyKey: 'k1' });
    const ids = await all(b, { refresh: true });
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(c.id);
    expect((await b.getShortlist()).map((p) => p.id)).toContain(a.id);
  });

  it('6: seen profiles come back after the cooldown (3 days for a card, 7 for an opened profile), after unseen ones', async () => {
    const b = await login(phone());
    const [card, opened] = (await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 })).items;
    await b.recordImpressions([card.id, opened.id]);
    await b.getProfile(opened.id);
    clock += 4 * DAY;
    await login(b);
    let ids = await all(b, { refresh: true });
    expect(ids).toContain(card.id);
    expect(ids).not.toContain(opened.id);
    expect(ids[ids.length - 1]).toBe(card.id); // returns last, after everything unseen
    clock += 4 * DAY;
    await login(b);
    ids = await all(b, { refresh: true });
    expect(ids).toContain(opened.id);
  });

  it('cooldowns are configurable by the admin', async () => {
    const admin = await login(phone(), DEMO_ADMIN_PHONE);
    const cfg = await admin.getPricing();
    await admin.adminUpdatePricing({ ...cfg, feedImpressionCooldownDays: 1 });
    const b = await login(phone());
    const [x] = (await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 1 })).items;
    await b.recordImpressions([x.id]);
    clock += 1.5 * DAY;
    await login(b);
    expect(await all(b, { refresh: true })).toContain(x.id);
  });

  it('7 + caught up: Refresh brings different profiles; when everything is seen the feed says so', async () => {
    const b = await login(phone());
    const first = (await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 })).items.map((p) => p.id);
    await b.recordImpressions(first);
    const refreshed = (await b.getDiscoverFeed(EMPTY_FILTERS, { refresh: true, pageSize: 5 })).items.map((p) => p.id);
    expect(refreshed.some((id) => first.includes(id))).toBe(false);
    await b.recordImpressions(await all(b, { refresh: true }));
    const done = await b.getDiscoverFeed(EMPTY_FILTERS, { refresh: true, pageSize: 5 });
    expect(done.items).toHaveLength(0);
    expect(done.caughtUp).toBe(true);
    // A keyword search still finds seen profiles (rotation is for normal browsing only).
    const seenOne = first[0];
    const viaSearch = await b.searchProfiles({ ...EMPTY_FILTERS }, 0, 50);
    expect(viaSearch.items.map((p) => p.id)).toContain(seenOne);
  });

  it('4: a newly published profile shows up as "new since your last visit" without resetting progress', async () => {
    const first = await login(phone());
    const firstPage = await first.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 });
    await first.recordImpressions(firstPage.items.map((p) => p.id).slice(0, 2));
    // A new bride joins and publishes an hour later.
    clock += 3600_000;
    const newbie = await login(phone(), '9811112222');
    const src = buildSeed().profiles.find((p) => p.status === 'published' && p.biodata.basic.lookingFor === 'groom')!.biodata;
    const bd: Biodata = JSON.parse(JSON.stringify(src));
    bd.basic.fullName = 'Brand New Bride';
    await newbie.saveDraft(bd, 7);
    const pub = await newbie.submitForPublication();
    expect(pub.profile.status).toBe('published');
    // The member comes back later on ANOTHER phone (history is shared): the chip counts the newcomer and
    // the main feed keeps its place.
    clock += 2 * 3600_000;
    const b = await login(phone());
    const back = await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 });
    expect(back.newSinceLastVisit).toBe(1);
    expect(back.items.map((p) => p.id)).toEqual(firstPage.items.map((p) => p.id).slice(2).concat(back.items.map((p) => p.id).slice(3)));
    const fresh = await b.getDiscoverFeed(EMPTY_FILTERS, { view: 'new', pageSize: 5 });
    expect(fresh.items.map((p) => p.id)).toEqual([pub.profile.id]);
    // Viewing the new list did not move the main browsing position.
    expect((await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 5 })).items.map((p) => p.id)).toEqual(back.items.map((p) => p.id));
  });

  it('9: impressions are not inflated by repeats; opening a profile is recorded separately', async () => {
    const b = await login(phone());
    const [x] = (await b.getDiscoverFeed(EMPTY_FILTERS, { pageSize: 1 })).items;
    await b.recordImpressions([x.id, x.id]);
    await b.recordImpressions([x.id]);
    await expect(b.recordImpressions(Array(101).fill(x.id))).rejects.toMatchObject({ code: 'validation' });
    const db = JSON.parse((await storage.getItem('hr.demo.db'))!);
    const row = db.seen.find((s: { profileId: string }) => s.profileId === x.id);
    expect(row.impressions).toBe(1);
    expect(row.viewedAt).toBeUndefined();
    await b.getProfile(x.id);
    const after = JSON.parse((await storage.getItem('hr.demo.db'))!).seen.find((s: { profileId: string }) => s.profileId === x.id);
    expect(after.viewedAt).toBeDefined();
  });
});
