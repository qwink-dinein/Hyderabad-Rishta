import { isBoostActive } from './privacy';
import type { Profile, User } from './types';

/**
 * Boost = featured placement with fair exposure (owner Mini PRD 2026-10-31, replacing the 2026-10-28
 * "every viewer sees every boost" rule): the Featured section rotates among active boosts, shows only
 * profiles that match the viewer's current filters, caps how often one boosted profile is featured to the
 * same viewer, and never guarantees views.
 *
 * Eligible profile: published, not deleted, boost not expired, owner active (not suspended,
 * deactivated or deleted). Eligible viewer: anyone signed in except the owner, anyone in a
 * block relationship with the owner, and (matrimony rule) people looking for the other type.
 */
export function isFeaturable(p: Pick<Profile, 'status' | 'deletedAt' | 'boostUntil'>, owner: Pick<User, 'deactivatedAt' | 'deletedAt'> | undefined, now = new Date()) {
  return p.status === 'published' && !p.deletedAt && isBoostActive(p, now) && !!owner && !owner.deactivatedAt && !owner.deletedAt;
}

/** Small, stable string hash (FNV-1a) — deterministic, no crypto needed for ordering. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** UTC calendar day, e.g. "2026-10-28" — the rotation and impression-dedupe window. */
export const dayKey = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Fair rotation: each viewer gets a different, stable-for-the-day order, so with many boosts every
 * boosted profile regularly takes the first slot — nobody is permanently buried behind others.
 */
export function rotateFeatured<T extends { id: string }>(items: T[], viewerId: string, now = new Date()): T[] {
  const seed = `${viewerId}:${dayKey(now)}`;
  return [...items].sort((a, b) => hash32(`${seed}:${a.id}`) - hash32(`${seed}:${b.id}`) || a.id.localeCompare(b.id));
}

export interface FeaturedRules {
  enabled: boolean;
  maxCards: number;
  /** Featured to the same viewer on at most this many distinct days in any 7 (today included). */
  capDaysPer7: number;
}

/**
 * Picks the Featured cards for one viewer (the demo backend runs this; SQL get_featured mirrors it).
 *  - `eligible`: active boosts this viewer may see (published, owner active, not blocked, right side,
 *    matching the viewer's filters) — eligibility is decided by the caller, never bypassed here.
 *  - `history`: the days this viewer was already shown each profile in Featured.
 * A profile already featured today stays (stable for the day); otherwise it is skipped once it has been
 * featured on `capDaysPer7` of the last 7 days. The order rotates per viewer per day.
 */
export function pickFeatured<T extends { id: string }>(
  eligible: T[],
  viewerId: string,
  history: { profileId: string; day: string }[],
  rules: FeaturedRules,
  now = new Date(),
): T[] {
  if (!rules.enabled) return [];
  const today = dayKey(now);
  const weekAgo = dayKey(new Date(now.getTime() - 6 * 86400000));
  const days = new Map<string, Set<string>>();
  for (const h of history) {
    if (h.day < weekAgo || h.day > today) continue;
    (days.get(h.profileId) ?? days.set(h.profileId, new Set()).get(h.profileId)!).add(h.day);
  }
  const cap = Math.max(1, Math.min(7, Math.floor(rules.capDaysPer7)));
  const allowed = eligible.filter((p) => {
    const d = days.get(p.id);
    return !d || d.has(today) || d.size < cap;
  });
  return rotateFeatured(allowed, viewerId, now).slice(0, Math.max(1, Math.min(30, Math.floor(rules.maxCards))));
}

export const featuredRulesOf = (cfg: { featuredEnabled: boolean; featuredMaxCards: number; featuredCapDaysPer7: number }): FeaturedRules => ({
  enabled: cfg.featuredEnabled,
  maxCards: cfg.featuredMaxCards,
  capDaysPer7: cfg.featuredCapDaysPer7,
});

export const BOOST_ENDING_NOTICE_MS = 24 * 3600 * 1000;

/** Which lifecycle notice (if any) is due for this boost now. Idempotent via the stored markers. */
export function boostNoticeDue(p: Pick<Profile, 'boostUntil' | 'boostNotices'>, now = new Date()): 'ending' | 'ended' | null {
  if (!p.boostUntil) return null;
  const end = new Date(p.boostUntil).getTime();
  const t = now.getTime();
  if (t >= end) return p.boostNotices?.ended === p.boostUntil ? null : 'ended';
  if (end - t <= BOOST_ENDING_NOTICE_MS && p.boostNotices?.ending !== p.boostUntil) return 'ending';
  return null;
}

/**
 * Boost tab state for the owner (drives the centre button's dot/pulse, the Home reminder card and
 * the Boost screen). `ready` = could boost right now and hasn't: that's when we remind.
 */
export type BoostNudge = 'no_profile' | 'not_published' | 'active' | 'disabled' | 'ready';
export function boostNudge(p: Pick<Profile, 'status' | 'deletedAt' | 'boostUntil'> | null | undefined, boostDisabled: boolean, now = new Date()): BoostNudge {
  if (!p || p.deletedAt) return 'no_profile';
  if (isBoostActive(p, now)) return 'active';
  if (p.status !== 'published') return 'not_published';
  return boostDisabled ? 'disabled' : 'ready';
}

/** Weekly "boost your profile" reminder: gentle, never right after publishing or right after a boost. */
export const BOOST_REMINDER_EVERY_MS = 7 * 86400000;
export const BOOST_REMINDER_GRACE_MS = 2 * 86400000;
export function boostReminderDue(
  p: Pick<Profile, 'status' | 'deletedAt' | 'boostUntil' | 'publishedAt'>,
  owner: Pick<User, 'deactivatedAt' | 'deletedAt'> | undefined,
  lastReminderAt: string | undefined,
  boostDisabled: boolean,
  now = new Date(),
): boolean {
  if (boostNudge(p, boostDisabled, now) !== 'ready' || !owner || owner.deactivatedAt || owner.deletedAt) return false;
  const t = now.getTime();
  if (p.publishedAt && t - new Date(p.publishedAt).getTime() < BOOST_REMINDER_GRACE_MS) return false;
  if (p.boostUntil && t - new Date(p.boostUntil).getTime() < BOOST_REMINDER_EVERY_MS) return false;
  return !lastReminderAt || t - new Date(lastReminderAt).getTime() >= BOOST_REMINDER_EVERY_MS;
}
