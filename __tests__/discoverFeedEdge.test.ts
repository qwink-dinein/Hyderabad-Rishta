import { buildFeedOrder, DEFAULT_FEED_CONFIG } from '../supabase/functions/_shared/feed';
import { EMPTY_FILTERS } from '../supabase/functions/_shared/search';
import { cleanFilters, discoverFeed, type FeedEdgeDeps } from '../supabase/functions/discover-feed/handler';

/** discover-feed Edge Function core: same engine as the demo, snapshots stored via RPC, cursor pages. */
const now = new Date('2026-10-31T09:00:00Z');
const prof = (id: string, daysAgo: number, boosted = false) => ({
  id, profileType: 'bride', displayName: id, age: 26, heightCm: 160, maritalStatus: 'never_married', motherTongue: 'urdu', createdFor: 'self',
  acceptsRequests: true, photos: [], photosHidden: false, location: { country: 'India', state: 'Telangana', city: 'Hyderabad' },
  career: { education: 'bachelors', profession: 'it' }, religion: {}, familyHidden: false,
  preferences: { maritalStatus: [], education: [], profession: [], countries: [], states: [], cities: [], motherTongues: [] },
  boosted, publishedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(), granted: { photos: false, phone: false, fullBiodata: false }, code: id,
});
const CANDIDATES = Array.from({ length: 23 }, (_, i) => prof(`p${String(i).padStart(2, '0')}`, i * 2, i % 9 === 0));

function fakeDb(seen: { profileId: string; impressedAt?: string }[] = []) {
  const snapshots: Record<string, unknown> = {};
  const calls: string[] = [];
  const featuredArgs: Record<string, unknown>[] = [];
  let n = 0;
  const deps: FeedEdgeDeps = {
    now: () => now,
    newId: () => `sess${++n}`,
    rpc: async (fn, args) => {
      calls.push(fn);
      if (fn === 'get_feed_context')
        return { viewerId: 'me', lookingFor: 'bride', prefs: null, cfg: { impressionCooldownDays: 3, viewCooldownDays: 7 }, seen, shortlisted: ['p01'], activeRequests: ['p02'],
          snapshots: Object.fromEntries(((args.p_keys as string[]) ?? []).filter((k) => snapshots[k]).map((k) => [k, snapshots[k]])) };
      if (fn === 'search_profiles') return CANDIDATES.slice(args.p_offset as number, (args.p_offset as number) + (args.p_limit as number));
      if (fn === 'save_feed_state') {
        snapshots[args.p_key as string] = { key: args.p_key, sessionId: args.p_session, ids: args.p_ids, createdAt: args.p_created, openedAt: args.p_opened, lastVisitAt: args.p_last_visit ?? undefined };
        return null;
      }
      if (fn === 'get_featured') {
        featuredArgs.push(args);
        return CANDIDATES.filter((c) => (args.p_only as string[]).includes(c.id)).slice(0, 2);
      }
      throw new Error(`unexpected ${fn}`);
    },
  };
  return { deps, snapshots, calls, featuredArgs };
}

it('orders with the shared engine, excludes shortlisted/requested, and pages by cursor without repeats', async () => {
  const db = fakeDb([{ profileId: 'p03', impressedAt: new Date(now.getTime() - 86400000).toISOString() }]);
  const first = await discoverFeed(db.deps, { filters: { ...EMPTY_FILTERS }, pageSize: 10 });
  expect(first.status).toBe(200);
  const page1 = (first.body.items as { id: string }[]).map((p) => p.id);
  const expected = buildFeedOrder(CANDIDATES as never, { ...EMPTY_FILTERS, show: 'bride' }, {
    viewerId: 'me', seen: new Map([['p03', { profileId: 'p03', impressedAt: new Date(now.getTime() - 86400000).toISOString() }]]),
    shortlisted: new Set(['p01']), activeRequests: new Set(['p02']), cfg: DEFAULT_FEED_CONFIG, now,
  }).ids;
  expect(page1).toEqual(expected.slice(0, 10));
  expect(page1).not.toContain('p01');
  expect(page1).not.toContain('p02');
  expect(page1).not.toContain('p03');
  const second = await discoverFeed(db.deps, { filters: { ...EMPTY_FILTERS }, cursor: first.body.nextCursor, pageSize: 10 });
  const page2 = (second.body.items as { id: string }[]).map((p) => p.id);
  expect(page2).toEqual(expected.slice(10, 20));
  expect(new Set([...page1, ...page2]).size).toBe(20);
  expect(db.calls.filter((c) => c === 'save_feed_state')).toHaveLength(1); // later pages reuse the stored snapshot
});

it('ignores unknown or oversized filter fields from the client', () => {
  const f = cleanFilters({ cities: ['Hyderabad', 7, 'x'.repeat(200)], ageMin: '25', evil: 'drop table', keyword: 'y'.repeat(300), sort: 'weird', show: 'admin' });
  expect(f.cities).toEqual(['Hyderabad']);
  expect(f.ageMin).toBe(25);
  expect(f.keyword).toBeUndefined();
  expect(f.sort).toBe('recommended');
  expect(f.show).toBeUndefined();
  expect((f as unknown as Record<string, unknown>).evil).toBeUndefined();
});

it('sections mode: Featured limited to boosted filter matches (cap applied by the database), no repeats, feed untouched', async () => {
  const db = fakeDb();
  const r = await discoverFeed(db.deps, { mode: 'sections', filters: { ...EMPTY_FILTERS, recentDays: 30 } });
  expect(r.status).toBe(200);
  const ids = (k: string) => (r.body[k] as { id: string }[]).map((p) => p.id);
  // Only boosted profiles that match the filters (published within 30 days) are offered to get_featured.
  expect(db.featuredArgs[0].p_only).toEqual(CANDIDATES.filter((c) => c.boosted && 2 * Number(c.id.slice(1)) <= 30).map((c) => c.id));
  const all = [...ids('featured'), ...ids('recommended'), ...ids('recent'), ...ids('newSince')];
  expect(new Set(all).size).toBe(all.length);
  expect(ids('recent')).not.toContain('p01'); // shortlisted
  expect(ids('recent')).not.toContain('p02'); // active interest
  expect(db.calls).not.toContain('save_feed_state'); // the browsing position is not touched
  // Explicit search: plain results only.
  const kw = await discoverFeed(db.deps, { mode: 'sections', filters: { ...EMPTY_FILTERS, keyword: 'p1' } });
  expect(kw.body).toEqual({ featured: [], recommended: [], recent: [], newSince: [] });
});
