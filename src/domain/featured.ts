import { isBoostActive } from './privacy';
import type { Profile, User } from './types';

/**
 * Boost = guaranteed featured placement (owner request, 2026-10-28):
 * every eligible viewer sees every actively boosted profile in the Featured section,
 * regardless of the viewer's own filters or sort. Main results stay filter-honest.
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
