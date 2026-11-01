import { filtersFromPreferences, matchesFilters, type SearchFilters } from './search';
import type { PartnerPreferences, PublicProfile } from './types';

/**
 * Persistent profile rotation for Discover (owner Mini PRD 2026-10-31). Pure: the demo backend and the
 * discover-feed Edge Function run this same code, so ordering is identical everywhere and generated on
 * the server side of each backend.
 *
 *  - A card counts as seen only after a real impression (≥ 50 % visible for ≥ 1 s, recorded by the app).
 *  - Seen cards leave normal rotation for `impressionCooldownDays`; opened profiles for `viewCooldownDays`.
 *  - Shortlisted profiles and profiles with an active interest (pending / accepted) leave rotation.
 *  - The rest is blended ~40 % new · 30 % matching your preferences · 20 % other unseen · 10 % boosted,
 *    adjusting gracefully when a group runs out. Boost never bypasses filters, privacy or eligibility —
 *    candidates arrive already filtered.
 *  - Profiles return after their cooldown, after every unseen one.
 *  - Rotation applies to normal browsing; an explicit keyword search or "shortlisted only" shows every match.
 */

export interface FeedConfig {
  impressionCooldownDays: number;
  viewCooldownDays: number;
  /** "New" = published within this many days (or since the last visit, whichever is wider). */
  newDays: number;
  /** A feed snapshot is reused (stable order, resumable) for this long; Refresh always rebuilds. */
  snapshotHours: number;
}
export const DEFAULT_FEED_CONFIG: FeedConfig = { impressionCooldownDays: 3, viewCooldownDays: 7, newDays: 14, snapshotHours: 24 };

/** One viewer's history with one profile (server-side; shared across devices). */
export interface SeenRecord {
  profileId: string;
  impressedAt?: string;
  viewedAt?: string;
  interaction?: 'shortlist' | 'interest';
  interactedAt?: string;
}

export type FeedView = 'all' | 'new';

/** A stored, stable feed: the order computed once, served page by page and resumed on reopen. */
export interface FeedSnapshot {
  key: string;
  sessionId: string;
  ids: string[];
  createdAt: string;
  /** When the member last opened Discover with these filters (for "new since your last visit"). */
  openedAt: string;
  lastVisitAt?: string;
}

const DAY = 86400000;
/** Gaps longer than this between openings count as a new visit. */
export const VISIT_GAP_MS = 30 * 60 * 1000;

/** Stable key for a filter configuration (each keeps its own browsing position). */
export function filtersKey(f: SearchFilters, view: FeedView = 'all'): string {
  const norm: Record<string, unknown> = {};
  for (const k of Object.keys(f).sort()) {
    const v = (f as unknown as Record<string, unknown>)[k];
    if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue;
    norm[k] = Array.isArray(v) ? [...v].map(String).sort() : v;
  }
  const s = JSON.stringify(norm) + `|${view}`;
  return `f${hash(s)}`;
}

/** Normal rotation applies unless the member is explicitly searching or looking at their shortlist. */
export const rotationApplies = (f: SearchFilters) => !f.keyword && !f.shortlistedOnly;

export function inCooldown(s: SeenRecord | undefined, cfg: FeedConfig, now: Date): boolean {
  if (!s) return false;
  const t = now.getTime();
  if (s.viewedAt && t - new Date(s.viewedAt).getTime() < cfg.viewCooldownDays * DAY) return true;
  if (s.impressedAt && t - new Date(s.impressedAt).getTime() < cfg.impressionCooldownDays * DAY) return true;
  return false;
}

/** Small, fast, deterministic string hash (FNV-1a) — stable per-viewer order without randomness. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface FeedContext {
  viewerId: string;
  seen: Map<string, SeenRecord>;
  shortlisted: Set<string>;
  /** Profiles the viewer has a pending or accepted interest with (either direction). */
  activeRequests: Set<string>;
  prefs?: PartnerPreferences;
  lastVisitAt?: string;
  cfg: FeedConfig;
  now: Date;
}

/** ~40 / 30 / 20 / 10 per ten cards. */
const PATTERN = ['new', 'pref', 'new', 'other', 'new', 'pref', 'boost', 'new', 'pref', 'other'] as const;
type Bucket = (typeof PATTERN)[number];
const FALLBACK: Bucket[] = ['new', 'pref', 'other', 'boost'];

/**
 * The feed order for these (already filtered, already eligible) candidates. Returns profile ids; nothing
 * appears twice. `exhausted` = nothing unseen is left (only cooled-down returns, or nothing at all).
 */
export function buildFeedOrder(candidates: PublicProfile[], filters: SearchFilters, ctx: FeedContext): { ids: string[]; unseen: number } {
  const rotation = rotationApplies(filters);
  const seenIds = new Set<string>();
  const pool: PublicProfile[] = [];
  // People you are already in touch with (an interest either way) stay in the feed — after everyone new, with
  // their "Interest sent / received" label — so nobody wonders where they went (owner request 2026-11-01).
  const contacted: PublicProfile[] = [];
  for (const p of candidates) {
    if (seenIds.has(p.id)) continue;
    seenIds.add(p.id);
    if (rotation) {
      if (ctx.activeRequests.has(p.id)) {
        contacted.push(p);
        continue;
      }
      if (ctx.shortlisted.has(p.id)) continue;
      if (inCooldown(ctx.seen.get(p.id), ctx.cfg, ctx.now)) continue;
    }
    pool.push(p);
  }
  // Seen before (cooldown over) → they come back, but only after everything unseen.
  const unseen = pool.filter((p) => !rotation || !ctx.seen.get(p.id)?.impressedAt && !ctx.seen.get(p.id)?.viewedAt);
  const returning = pool
    .filter((p) => rotation && !unseen.includes(p))
    .sort((a, b) => lastSeen(ctx.seen.get(a.id)).localeCompare(lastSeen(ctx.seen.get(b.id))));
  const byRecent = (a: PublicProfile, b: PublicProfile) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.id.localeCompare(b.id);
  const tail = contacted.sort(byRecent).map((p) => p.id);

  if (filters.sort === 'recent') return { ids: [...unseen.sort(byRecent), ...returning].map((p) => p.id).concat(tail), unseen: unseen.length };

  const newSince = Math.min(ctx.now.getTime() - ctx.cfg.newDays * DAY, ctx.lastVisitAt ? new Date(ctx.lastVisitAt).getTime() : Infinity);
  const prefFilters = ctx.prefs ? filtersFromPreferences(ctx.prefs, filters.show) : null;
  const seeded = (p: PublicProfile) => hash(`${ctx.viewerId}:${p.id}`);
  const buckets: Record<Bucket, PublicProfile[]> = { new: [], pref: [], other: [], boost: [] };
  for (const p of unseen) {
    if (p.boosted) buckets.boost.push(p);
    else if (p.publishedAt && new Date(p.publishedAt).getTime() >= newSince) buckets.new.push(p);
    else if (prefFilters && matchesFilters(p, prefFilters, { now: ctx.now })) buckets.pref.push(p);
    else buckets.other.push(p);
  }
  buckets.new.sort(byRecent);
  buckets.pref.sort(byRecent);
  buckets.other.sort((a, b) => seeded(a).localeCompare(seeded(b)) || a.id.localeCompare(b.id));
  buckets.boost.sort((a, b) => seeded(a).localeCompare(seeded(b)) || a.id.localeCompare(b.id));

  const out: string[] = [];
  for (let slot = 0; out.length < unseen.length; slot++) {
    const want = PATTERN[slot % PATTERN.length];
    const from = buckets[want].length ? want : FALLBACK.find((b) => buckets[b].length);
    if (!from) break;
    out.push(buckets[from].shift()!.id);
  }
  return { ids: [...out, ...returning.map((p) => p.id), ...tail], unseen: unseen.length };
}

const lastSeen = (s?: SeenRecord) => [s?.impressedAt ?? '', s?.viewedAt ?? ''].sort().pop() ?? '';

/** Members published since the viewer's last visit that they haven't seen (for the "N new" chip). */
export function newSinceLastVisit(candidates: PublicProfile[], ctx: FeedContext): string[] {
  if (!ctx.lastVisitAt) return [];
  const since = new Date(ctx.lastVisitAt).getTime();
  return candidates
    .filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() > since)
    .filter((p) => !ctx.seen.get(p.id)?.impressedAt && !ctx.seen.get(p.id)?.viewedAt && !ctx.shortlisted.has(p.id) && !ctx.activeRequests.has(p.id))
    .map((p) => p.id);
}

/** Whether a stored snapshot can be resumed (same filters, not too old, not a Refresh). */
export function snapshotUsable(s: FeedSnapshot | undefined, key: string, cfg: FeedConfig, now: Date, refresh: boolean): s is FeedSnapshot {
  return !!s && !refresh && s.key === key && now.getTime() - new Date(s.createdAt).getTime() < cfg.snapshotHours * 3600000;
}

/** Cursor = "<sessionId>.<offset>" — opaque to the app. */
export const encodeCursor = (sessionId: string, offset: number) => `${sessionId}.${offset}`;
export function decodeCursor(c?: string | null): { sessionId: string; offset: number } | null {
  if (!c || typeof c !== 'string' || c.length > 100) return null;
  const i = c.lastIndexOf('.');
  const offset = Number(c.slice(i + 1));
  if (i <= 0 || !Number.isInteger(offset) || offset < 0) return null;
  return { sessionId: c.slice(0, i), offset };
}

export interface FeedPage<T = PublicProfile> {
  items: T[];
  nextCursor?: string;
  /** Unseen profiles still waiting in this feed (for the count line). */
  remaining: number;
  /** New members published since the last visit and not yet seen (the "N new" chip). */
  newSinceLastVisit: number;
  /** Nothing unseen left: "You've caught up…". */
  caughtUp: boolean;
  /** Profiles matching these filters at all (seen or not) — tells "no matches" apart from "caught up". */
  total?: number;
}

/**
 * Serves one page from a snapshot: skips ids no longer eligible (deleted, blocked, paused, now cooling
 * down) without reordering the rest, and never repeats an id within the session.
 */
export function pageFromSnapshot(
  snap: FeedSnapshot,
  eligible: Map<string, PublicProfile>,
  offset: number,
  pageSize: number,
  stillInRotation: (id: string) => boolean,
): { items: PublicProfile[]; nextOffset?: number } {
  const items: PublicProfile[] = [];
  let i = offset;
  for (; i < snap.ids.length && items.length < pageSize; i++) {
    const p = eligible.get(snap.ids[i]);
    if (p && stillInRotation(p.id)) items.push(p);
  }
  return { items, nextOffset: i < snap.ids.length ? i : undefined };
}

export interface FeedRequest {
  cursor?: string;
  /** "Refresh Discover": rebuild the snapshot (new eligible profiles in, seen ones out). */
  refresh?: boolean;
  /** "N new profiles since your last visit" — its own list; the main browsing position is untouched. */
  view?: FeedView;
  pageSize?: number;
}

/** What a backend provides to serve the feed; everything rule-related stays in this file. */
export interface FeedDeps {
  /** Candidates already filtered by the member's filters, privacy-projected and eligible (no blocks, live only). */
  candidates(): Promise<PublicProfile[]>;
  context(): Promise<Omit<FeedContext, 'lastVisitAt' | 'now'>>;
  loadSnapshot(key: string): Promise<FeedSnapshot | undefined>;
  saveSnapshot(s: FeedSnapshot): Promise<void>;
  newSessionId(): string;
  now(): Date;
}

export async function serveFeed(filters: SearchFilters, req: FeedRequest, deps: FeedDeps): Promise<FeedPage> {
  const view: FeedView = req.view === 'new' ? 'new' : 'all';
  const pageSize = Math.max(1, Math.min(50, Math.floor(Number(req.pageSize) || 10)));
  const now = deps.now();
  const [base, candidates] = await Promise.all([deps.context(), deps.candidates()]);
  const mainKey = filtersKey(filters, 'all');
  const key = filtersKey(filters, view);
  const main = await deps.loadSnapshot(mainKey);
  const ctx: FeedContext = { ...base, now, lastVisitAt: main?.lastVisitAt };
  const rotation = rotationApplies(filters);
  // In touch already (an interest either way): always shown in the All feed, never cooled down or hidden.
  const inRotation = (id: string) => !rotation || ctx.activeRequests.has(id) || (!ctx.shortlisted.has(id) && !inCooldown(ctx.seen.get(id), ctx.cfg, now));
  const eligible = new Map(candidates.map((p) => [p.id, p]));
  const fresh = (ids: string[], from: number) =>
    ids.slice(from).filter((id) => eligible.has(id) && inRotation(id) && !ctx.activeRequests.has(id) && !ctx.seen.get(id)?.impressedAt && !ctx.seen.get(id)?.viewedAt).length;

  // Later pages: same snapshot, same order — cards already on screen never move.
  const cur = decodeCursor(req.cursor);
  if (cur && !req.refresh) {
    const snap = await deps.loadSnapshot(key);
    if (snap && snap.sessionId === cur.sessionId) {
      const { items, nextOffset } = pageFromSnapshot(snap, eligible, cur.offset, pageSize, inRotation);
      return {
        items,
        nextCursor: nextOffset != null ? encodeCursor(snap.sessionId, nextOffset) : undefined,
        remaining: fresh(snap.ids, nextOffset ?? snap.ids.length),
        newSinceLastVisit: newSinceLastVisit(candidates, ctx).length,
        caughtUp: nextOffset == null,
        total: eligible.size,
      };
    }
  }

  // First page (opening Discover, a filter change, or Refresh).
  let lastVisitAt = main?.lastVisitAt;
  if (view === 'all' && main && now.getTime() - new Date(main.openedAt).getTime() > VISIT_GAP_MS) lastVisitAt = main.openedAt;
  ctx.lastVisitAt = lastVisitAt;
  const existing = view === 'all' ? main : await deps.loadSnapshot(key);
  let snap: FeedSnapshot;
  if (snapshotUsable(existing, key, ctx.cfg, now, !!req.refresh)) {
    snap = { ...existing, openedAt: view === 'all' ? now.toISOString() : existing.openedAt, lastVisitAt: view === 'all' ? lastVisitAt : existing.lastVisitAt };
    // People contacted since this list was made (or missing from it) join at the end, so they never vanish.
    if (view === 'all' && rotation) {
      const inList = new Set(snap.ids);
      const extra = candidates.filter((p) => ctx.activeRequests.has(p.id) && !inList.has(p.id)).map((p) => p.id);
      if (extra.length) snap = { ...snap, ids: [...snap.ids, ...extra] };
    }
  } else {
    const ids =
      view === 'new'
        ? newSinceLastVisit(candidates, ctx).sort((a, b) => (eligible.get(b)!.publishedAt ?? '').localeCompare(eligible.get(a)!.publishedAt ?? ''))
        : buildFeedOrder(candidates, filters, ctx).ids;
    snap = { key, sessionId: deps.newSessionId(), ids, createdAt: now.toISOString(), openedAt: now.toISOString(), lastVisitAt: view === 'all' ? lastVisitAt : main?.lastVisitAt };
  }
  await deps.saveSnapshot(snap);
  const { items, nextOffset } = pageFromSnapshot(snap, eligible, 0, pageSize, inRotation);
  return {
    items,
    nextCursor: nextOffset != null ? encodeCursor(snap.sessionId, nextOffset) : undefined,
    remaining: fresh(snap.ids, nextOffset ?? snap.ids.length),
    newSinceLastVisit: view === 'all' ? newSinceLastVisit(candidates, ctx).length : 0,
    caughtUp: nextOffset == null,
    total: eligible.size,
  };
}

/** Home and Discover sections (owner Mini PRD 2026-10-31, "Boost Visibility, Featured Profiles"). */
export interface DiscoverSections<T = PublicProfile> {
  /** Active boosts matching the viewer's filters, rotated fairly with a per-viewer frequency cap. */
  featured: T[];
  /** Matches the viewer's partner preferences (a match on stated preferences — not a compatibility score). */
  recommended: T[];
  /** Recently published, unseen first. */
  recent: T[];
  /** Published since the viewer's last visit and not seen yet. */
  newSince: T[];
}

export const SECTION_SIZE = 6;

/** The viewer's last visit as Discover's main feed records it (an opening longer ago than the visit gap). */
export function lastVisitOf(main: FeedSnapshot | undefined, now: Date): string | undefined {
  if (!main) return undefined;
  return now.getTime() - new Date(main.openedAt).getTime() > VISIT_GAP_MS ? main.openedAt : main.lastVisitAt;
}

/**
 * Builds the Recommended / Recently Published / New-since-last-visit lists from the same filtered,
 * eligible candidates as Discover (so no section can bypass filters, privacy or eligibility).
 * Cards in Featured or an earlier section are not repeated while other profiles are available; a section
 * repeats cards only when it would otherwise be empty. Profiles with an active interest stay out (they
 * live in Requests), shortlisted ones too (they live in Shortlist).
 */
export function buildSections(
  candidates: PublicProfile[],
  filters: SearchFilters,
  ctx: FeedContext,
  featuredIds: string[],
  size = SECTION_SIZE,
): Omit<DiscoverSections<string>, 'featured'> {
  const pool = candidates.filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i && !ctx.shortlisted.has(p.id) && !ctx.activeRequests.has(p.id));
  const used = new Set(featuredIds);
  const unseen = (p: PublicProfile) => !ctx.seen.get(p.id)?.impressedAt && !ctx.seen.get(p.id)?.viewedAt;
  const byRecent = (a: PublicProfile, b: PublicProfile) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.id.localeCompare(b.id);
  const take = (list: PublicProfile[]) => {
    const fresh = list.filter((p) => !used.has(p.id));
    const out = (fresh.length ? fresh : list).slice(0, size).map((p) => p.id);
    out.forEach((id) => used.add(id));
    return out;
  };

  const since = ctx.lastVisitAt ? new Date(ctx.lastVisitAt).getTime() : null;
  const newSince = since == null ? [] : take(pool.filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() > since && unseen(p)).sort(byRecent));

  const prefFilters = ctx.prefs ? filtersFromPreferences(ctx.prefs, filters.show) : null;
  const day = ctx.now.toISOString().slice(0, 10);
  const rotate = (p: PublicProfile) => hash(`${ctx.viewerId}:${day}:${p.id}`);
  const recommended = prefFilters
    ? take(
        pool
          .filter((p) => matchesFilters(p, prefFilters, { now: ctx.now }))
          // Not cooling down first, then a daily per-viewer rotation (no fixed "top" list).
          .sort((a, b) => Number(inCooldown(ctx.seen.get(a.id), ctx.cfg, ctx.now)) - Number(inCooldown(ctx.seen.get(b.id), ctx.cfg, ctx.now)) || rotate(a).localeCompare(rotate(b)) || a.id.localeCompare(b.id)),
      )
    : [];

  const recentFrom = ctx.now.getTime() - ctx.cfg.newDays * DAY;
  const recent = take(
    pool
      .filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= recentFrom)
      .sort((a, b) => Number(!unseen(a)) - Number(!unseen(b)) || byRecent(a, b)),
  );
  return { recommended, recent, newSince };
}
