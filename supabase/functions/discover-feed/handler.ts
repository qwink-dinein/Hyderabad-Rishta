// Core of the discover-feed Edge Function (unit-tested in __tests__/discoverFeedEdge.test.ts).
// Runs the shared rotation engine (src/domain/feed.ts, synced to _shared) on the member's own Discover
// candidates — fetched with THEIR JWT through search_profiles, so privacy projection, blocks and eligibility
// are exactly Discover's — and stores the snapshot server-side (shared by all their devices).
import { buildSections, DEFAULT_FEED_CONFIG, filtersKey, lastVisitOf, rotationApplies, serveFeed, type FeedContext, type FeedSnapshot, type SeenRecord } from '../_shared/feed.ts';
import { EMPTY_FILTERS, matchesFilters, type SearchFilters } from '../_shared/search.ts';
import type { PartnerPreferences, PublicProfile } from '../_shared/types.ts';

export interface FeedEdgeDeps {
  /** Calls a database function as the signed-in member. */
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  now(): Date;
  newId(): string;
}
export interface FeedEdgeResult {
  status: number;
  body: Record<string, unknown>;
}

const ARRAY_KEYS = ['maritalStatus', 'countries', 'states', 'districts', 'cities', 'motherTongues', 'education', 'profession', 'employmentType',
  'maslak', 'subMaslak', 'familyType', 'familyValues', 'relocation'] as const;
const NUM_KEYS = ['ageMin', 'ageMax', 'heightMin', 'heightMax', 'recentDays'] as const;
const STR_KEYS = ['keyword', 'locality', 'incomeMin'] as const;

/** Only known filter fields, bounded sizes — anything else from the client is ignored. */
export function cleanFilters(raw: unknown): SearchFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const f: SearchFilters = { ...EMPTY_FILTERS };
  for (const k of ARRAY_KEYS) {
    const v = r[k];
    if (Array.isArray(v)) (f as unknown as Record<string, string[]>)[k] = v.filter((x) => typeof x === 'string' && x.length <= 80).slice(0, 50);
  }
  for (const k of NUM_KEYS) {
    const v = Number(r[k]);
    if (r[k] != null && Number.isFinite(v)) (f as unknown as Record<string, number>)[k] = v;
  }
  for (const k of STR_KEYS) {
    const v = r[k];
    if (typeof v === 'string' && v.trim() && v.length <= 100) (f as unknown as Record<string, string>)[k] = v;
  }
  if (r.show === 'bride' || r.show === 'groom') f.show = r.show;
  f.boostedOnly = r.boostedOnly === true;
  f.shortlistedOnly = r.shortlistedOnly === true;
  f.strictOptional = r.strictOptional === true;
  f.sort = r.sort === 'recent' ? 'recent' : 'recommended';
  return f;
}

interface Ctx {
  viewerId: string;
  lookingFor?: 'bride' | 'groom';
  prefs?: PartnerPreferences;
  cfg?: { impressionCooldownDays?: number; viewCooldownDays?: number };
  seen?: SeenRecord[];
  shortlisted?: string[];
  activeRequests?: string[];
  snapshots?: Record<string, FeedSnapshot>;
}

export async function discoverFeed(deps: FeedEdgeDeps, input: unknown): Promise<FeedEdgeResult> {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const sections = b.mode === 'sections';
  const view = b.view === 'new' ? 'new' : 'all';
  const base = cleanFilters(b.filters);
  // The member's own looking-for decides the side and no filter can override it (keys must match the demo's).
  const first = (await deps.rpc('get_feed_context', { p_keys: [] })) as Ctx;
  const f: SearchFilters = { ...base, show: first.lookingFor ?? base.show };
  const keys = [...new Set([filtersKey(f, 'all'), filtersKey(f, view)])];
  const ctx = (await deps.rpc('get_feed_context', { p_keys: keys })) as Ctx;
  const shortlisted = new Set((ctx.shortlisted ?? []).map(String));
  const candidates = async () => {
    const out: PublicProfile[] = [];
    for (let offset = 0; offset < 1000; offset += 50) {
      const rows = ((await deps.rpc('search_profiles', { p_show: f.show ?? null, p_limit: 50, p_offset: offset })) as PublicProfile[]) ?? [];
      out.push(...rows);
      if (rows.length < 50) break;
    }
    const now = deps.now();
    return out.filter((p) => matchesFilters(p, f, { shortlisted, now }));
  };
  const context = (): Omit<FeedContext, 'lastVisitAt' | 'now'> => ({
    viewerId: ctx.viewerId,
    seen: new Map((ctx.seen ?? []).map((s) => [String(s.profileId), s])),
    shortlisted,
    activeRequests: new Set((ctx.activeRequests ?? []).map(String)),
    prefs: ctx.prefs ?? undefined,
    cfg: {
      ...DEFAULT_FEED_CONFIG,
      impressionCooldownDays: ctx.cfg?.impressionCooldownDays ?? DEFAULT_FEED_CONFIG.impressionCooldownDays,
      viewCooldownDays: ctx.cfg?.viewCooldownDays ?? DEFAULT_FEED_CONFIG.viewCooldownDays,
    },
  });
  const loadSnapshot = (key: string): FeedSnapshot | undefined => {
    const s = ctx.snapshots?.[key];
    return s ? { ...s, ids: (s.ids ?? []).map(String) } : undefined;
  };

  if (sections) {
    // Home / Discover sections: read-only for the feed (the browsing position is untouched).
    if (!rotationApplies(f)) return { status: 200, body: { featured: [], recommended: [], recent: [], newSince: [] } };
    const list = await candidates();
    // Featured: the database applies eligibility, the frequency cap and rotation, limited to boosted
    // profiles that match these filters, and records the Featured impressions.
    const boostedIds = list.filter((p) => p.boosted).map((p) => p.id);
    const featured = boostedIds.length ? (((await deps.rpc('get_featured', { p_limit: 30, p_only: boostedIds })) as PublicProfile[]) ?? []) : [];
    const now = deps.now();
    const ids = buildSections(list, f, { ...context(), now, lastVisitAt: lastVisitOf(loadSnapshot(filtersKey(f, 'all')), now) }, featured.map((p) => String(p.id)));
    const byId = new Map(list.map((p) => [p.id, p]));
    const pick = (xs: string[]) => xs.map((id) => byId.get(id)).filter((p): p is PublicProfile => !!p);
    return { status: 200, body: { featured, recommended: pick(ids.recommended), recent: pick(ids.recent), newSince: pick(ids.newSince) } };
  }

  const page = await serveFeed(f, { cursor: typeof b.cursor === 'string' ? b.cursor : undefined, refresh: b.refresh === true, view, pageSize: Number(b.pageSize) || 10 }, {
    candidates,
    context: async () => context(),
    loadSnapshot: async (key) => loadSnapshot(key),
    saveSnapshot: async (s) => {
      await deps.rpc('save_feed_state', { p_key: s.key, p_session: s.sessionId, p_ids: s.ids, p_created: s.createdAt, p_opened: s.openedAt, p_last_visit: s.lastVisitAt ?? null });
    },
    newSessionId: () => deps.newId(),
    now: () => deps.now(),
  });
  return { status: 200, body: page as unknown as Record<string, unknown> };
}
