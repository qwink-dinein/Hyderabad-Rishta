import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { buyBoost, paidBoostMode } from './support/boost';
import { dayKey, pickFeatured, rotateFeatured } from '@/domain/featured';
import { buildSections, DEFAULT_FEED_CONFIG, type FeedContext } from '@/domain/feed';
import { boostPlansFor, DEFAULT_PRICING, validatePricing, withPricingDefaults } from '@/domain/pricing';
import { EMPTY_FILTERS } from '@/domain/search';
import type { PricingConfig, PublicProfile } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV, type KV } from '@/services/storage';

/** Owner Mini PRD 2026-10-31: Boost visibility, Featured profiles & Discover rotation. */
const DAY = 86400000;
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);

describe('Featured fair exposure (domain/featured.ts#pickFeatured)', () => {
  const rules = { enabled: true, maxCards: 12, capDaysPer7: 3 };
  const boosts = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}` }));
  const day = (n: number) => dayKey(new Date(clock - n * DAY));

  it('caps how often one boosted profile is featured to the same viewer (N days in any 7)', () => {
    const history = [day(1), day(2), day(4)].map((d) => ({ profileId: 'b0', day: d })).concat([{ profileId: 'b1', day: day(1) }]);
    const ids = pickFeatured(boosts, 'v1', history, rules, now()).map((p) => p.id);
    expect(ids).not.toContain('b0'); // featured on 3 of the last 7 days already
    expect(ids).toContain('b1');
    expect(ids).toHaveLength(5);
    // Older than 7 days no longer counts.
    const old = [day(7), day(8), day(9)].map((d) => ({ profileId: 'b0', day: d }));
    expect(pickFeatured(boosts, 'v1', old, rules, now()).map((p) => p.id)).toContain('b0');
  });

  it('keeps a card featured for the rest of the day once shown today (stable within a day)', () => {
    const history = [day(0), day(1), day(2)].map((d) => ({ profileId: 'b0', day: d }));
    expect(pickFeatured(boosts, 'v1', history, rules, now()).map((p) => p.id)).toContain('b0');
  });

  it('respects the admin switch and the number of cards', () => {
    expect(pickFeatured(boosts, 'v1', [], { ...rules, enabled: false }, now())).toEqual([]);
    expect(pickFeatured(boosts, 'v1', [], { ...rules, maxCards: 2 }, now())).toHaveLength(2);
  });

  it('rotates fairly: across many viewers every boost takes the first slot, nobody is buried', () => {
    const first = new Map<string, number>();
    for (let v = 0; v < 600; v++) {
      const id = rotateFeatured(boosts, `viewer${v}`, now())[0].id;
      first.set(id, (first.get(id) ?? 0) + 1);
    }
    expect(first.size).toBe(6);
    for (const n of first.values()) expect(n).toBeGreaterThan(50); // ~100 each; none dominates
  });
});

describe('Home / Discover sections (domain/feed.ts#buildSections)', () => {
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
  const sec = { country: 'India', state: 'Telangana', city: 'Secunderabad' };

  it('never repeats a card across Featured and the sections when alternatives exist', () => {
    const list = [
      prof('boost1', { boosted: true, publishedAt: at(1), location: sec }),
      ...Array.from({ length: 8 }, (_, i) => prof(`recent${i}`, { publishedAt: at(1 + i) })),
      ...Array.from({ length: 8 }, (_, i) => prof(`pref${i}`, { location: sec, publishedAt: at(2 + i) })),
      prof('justNow', { publishedAt: at(0.01) }),
    ];
    const s = buildSections(list, EMPTY_FILTERS, ctx({ lastVisitAt: at(0.5) }), ['boost1']);
    const all = ['boost1', ...s.newSince, ...s.recommended, ...s.recent];
    expect(new Set(all).size).toBe(all.length);
    expect(s.newSince).toEqual(['justNow']);
    expect(s.recommended.every((id) => id.startsWith('pref'))).toBe(true); // stated preferences only
    expect(s.recent.length).toBe(6);
  });

  it('repeats a card only when a section would otherwise be empty', () => {
    const list = [prof('only', { publishedAt: at(1), location: sec })];
    const s = buildSections(list, EMPTY_FILTERS, ctx(), ['only']);
    expect(s.recommended).toEqual(['only']);
  });

  it('puts unseen profiles first in Recently Published; leaves out interests and shortlist', () => {
    const list = [prof('seen', { publishedAt: at(0.2) }), prof('fresh', { publishedAt: at(3) }), prof('asked', { publishedAt: at(1) }), prof('saved', { publishedAt: at(1) })];
    const s = buildSections(list, EMPTY_FILTERS, ctx({ prefs: undefined, seen: new Map([['seen', { profileId: 'seen', impressedAt: at(0.1) }]]), activeRequests: new Set(['asked']), shortlisted: new Set(['saved']) }), []);
    expect(s.recent).toEqual(['fresh', 'seen']);
    expect(s.recommended).toEqual([]); // no preferences set → no Recommended section
  });
});

describe('Boost pricing rules (admin)', () => {
  const cfg = (o: Partial<PricingConfig>) => ({ ...DEFAULT_PRICING, ...o });
  it('validates the new settings and promotional labels', () => {
    expect(validatePricing(DEFAULT_PRICING)).toEqual([]);
    expect(validatePricing(cfg({ featuredMaxCards: 0 })).join()).toMatch(/Featured cards/);
    expect(validatePricing(cfg({ featuredCapDaysPer7: 8 })).join()).toMatch(/Featured days/);
    const plans = DEFAULT_PRICING.boostPlans.map((p, i) => (i === 0 ? { ...p, promoLabel: '<b>x</b>' } : p));
    expect(validatePricing(cfg({ boostPlans: plans })).join()).toMatch(/label/);
    const ok = DEFAULT_PRICING.boostPlans.map((p, i) => (i === 1 ? { ...p, promoLabel: 'Best value' } : p));
    expect(validatePricing(cfg({ boostPlans: ok }))).toEqual([]);
    expect(boostPlansFor(cfg({ boostPlans: ok }), 'groom')[1].promoLabel).toBe('Best value');
  });
  it('Boost switched off: no option can be bought; older configs get the defaults', () => {
    expect(boostPlansFor(cfg({ boostEnabled: false }), 'groom')).toEqual([]);
    const legacy = { ...DEFAULT_PRICING } as Partial<PricingConfig>;
    delete legacy.featuredMaxCards;
    delete legacy.boostEnabled;
    expect(withPricingDefaults(legacy as PricingConfig)).toMatchObject({ featuredMaxCards: 12, boostEnabled: true });
  });
});

describe('journey: several boosted profiles, several viewers (demo backend)', () => {
  let storage: KV;
  const GROOMS = [DEMO_USER_PHONE, '9000000103', '9000000105'];
  const BRIDES = ['9000000102', '9000000104', '9000000106'];
  const device = () => new DemoBackend({ storage, secure: memoryKV(), now });
  async function as(phone: string) {
    const b = device();
    clock += RESEND_COOLDOWN_MS + 1;
    await b.requestOtp('+91', phone);
    await b.verifyOtp('+91', phone, DEMO_OTP);
    return b;
  }
  async function admin(patch: (c: PricingConfig) => PricingConfig) {
    const a = await as(DEMO_ADMIN_PHONE);
    await paidBoostMode(a); // Boosts are bought (never free outside referrals); Referral mode allows no plan
    await a.adminUpdatePricing(patch(await a.getPricing()));
  }
  const paid = (c: PricingConfig): PricingConfig => ({
    ...c,
    boostPlans: c.boostPlans.map((p) => ({ ...p, fee: { bride: { mode: 'paid', amount: 100 }, groom: { mode: 'paid', amount: 100 } } })),
  });
  const code = async (p: Promise<unknown>, c: string) => {
    await expect(p).rejects.toBeInstanceOf(AppError);
    await p.catch((e: AppError) => expect(e.code).toBe(c));
  };
  let boosted: string[] = [];
  let allBoosted: string[] = [];

  beforeEach(async () => {
    storage = memoryKV();
    clock = new Date('2026-10-01T09:00:00Z').getTime();
    await admin(paid);
    boosted = [];
    for (const phone of BRIDES) {
      const b = await as(phone);
      // Some seed profiles are already boosted; either way this bride is boosted now.
      await buyBoost(b, 'd7').catch((e: AppError) => expect(e.code).toBe('boost_active'));
      boosted.push((await b.getMyProfile())!.id);
    }
    // Every active bride boost a groom may see (ours plus any in the seed).
    const g = await as(GROOMS[0]);
    allBoosted = (await g.searchProfiles({ ...EMPTY_FILTERS, boostedOnly: true }, 0, 100)).items.map((p) => p.id);
    expect(allBoosted).toEqual(expect.arrayContaining(boosted));
  });

  it('every viewer sees the boosted profiles in Featured, each in their own rotation, without repeats in the sections', async () => {
    const orders: string[][] = [];
    for (const phone of GROOMS) {
      const s = await (await as(phone)).getDiscoverSections(EMPTY_FILTERS);
      const ids = s.featured.map((p) => p.id);
      expect([...ids].sort()).toEqual([...allBoosted].sort());
      expect(s.featured.every((p) => p.boosted && !p.contact)).toBe(true);
      const rest = [...s.newSince, ...s.recommended, ...s.recent].map((p) => p.id);
      expect(new Set([...ids, ...rest]).size).toBe(ids.length + rest.length); // no repeats while alternatives exist
      orders.push(ids);
    }
    expect(new Set(orders.map((o) => o.join())).size).toBeGreaterThan(1); // different viewers, different order
  });

  it('Featured on Discover only shows boosted profiles that match the viewer\'s filters', async () => {
    const g = await as(GROOMS[0]);
    const [first] = (await g.getDiscoverSections(EMPTY_FILTERS)).featured;
    const city = first.location.city;
    const s = await g.getDiscoverSections({ ...EMPTY_FILTERS, cities: [city] });
    expect(s.featured.length).toBeGreaterThan(0);
    expect(s.featured.every((p) => p.location.city === city)).toBe(true);
    expect((await g.getDiscoverSections({ ...EMPTY_FILTERS, ageMin: 60 })).featured).toEqual([]);
    // An explicit keyword search shows plain results, no sections.
    expect((await g.getDiscoverSections({ ...EMPTY_FILTERS, keyword: city })).featured).toEqual([]);
  });

  it('frequency cap: the same viewer is not shown the same boost every day', async () => {
    await admin((c) => ({ ...c, featuredCapDaysPer7: 2 }));
    const days: number[] = [];
    for (let d = 0; d < 7; d++) {
      const g = await as(GROOMS[1]);
      days.push((await g.getDiscoverSections(EMPTY_FILTERS)).featured.length);
      clock += DAY;
    }
    expect(days.slice(0, 2)).toEqual([allBoosted.length, allBoosted.length]);
    expect(days.slice(2, 7).every((n) => n < allBoosted.length)).toBe(true); // capped for the rest of the 7-day window
    expect(days.slice(2, 6).filter((n) => n === 0).length).toBeGreaterThan(0);
    // Another viewer is unaffected by the first one's history.
    clock = new Date('2026-10-02T09:00:00Z').getTime();
    expect((await (await as(GROOMS[2])).getDiscoverSections(EMPTY_FILTERS)).featured).toHaveLength(allBoosted.length);
  });

  it('expired boosts stop all priority: not featured, not marked boosted', async () => {
    clock += 8 * DAY;
    const g = await as(GROOMS[0]);
    expect((await g.getDiscoverSections(EMPTY_FILTERS)).featured.map((p) => p.id).filter((id) => boosted.includes(id))).toEqual([]);
    const page = await g.searchProfiles(EMPTY_FILTERS, 0, 100);
    expect(page.items.filter((p) => boosted.includes(p.id)).every((p) => !p.boosted)).toBe(true);
  });

  it('admin controls take effect immediately; boosts already bought keep their terms', async () => {
    await admin((c) => ({ ...c, featuredEnabled: false }));
    expect((await (await as(GROOMS[0])).getDiscoverSections(EMPTY_FILTERS)).featured).toEqual([]);
    await admin((c) => ({ ...c, featuredEnabled: true, featuredMaxCards: 1, boostEnabled: false }));
    expect((await (await as(GROOMS[0])).getDiscoverSections(EMPTY_FILTERS)).featured).toHaveLength(1); // running boosts still featured
    const groom = await as(GROOMS[2]);
    await code(groom.startBoost('d7'), 'fee_disabled'); // no new boosts
    await admin((c) => ({ ...c, boostEnabled: true, boostRequirePhoto: true }));
    const again = await as(GROOMS[2]); // a fresh session reads the new settings
    const me = await again.getMyProfile();
    expect(me?.biodata.photos.length ?? 0).toBe(0); // seed profiles have no photos
    await code(again.startBoost('d7'), 'photo_required');
  });
});
