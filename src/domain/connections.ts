import type { ContactRequest, PokeEligibility, PricingConfig, Relation } from './types';
import { stripUnsafe } from './security';

const DAY = 86400000;

/**
 * Poke (gentle reminder) rules — the single source of truth used by the backend and the UI:
 * pending + unexpired, only the sender, after the wait period, one per request, at most
 * `pokeMaxPer7Days` to the same recipient in a rolling 7 days (across requests), recipient opt-out respected.
 */
export function pokeEligibility(
  r: ContactRequest,
  viewerUserId: string,
  all: ContactRequest[],
  cfg: Pick<PricingConfig, 'pokeWaitHours' | 'pokeMaxPer7Days'>,
  recipientAllowsReminders: boolean,
  now = new Date(),
): PokeEligibility {
  if (r.fromUserId !== viewerUserId) return { canPoke: false, reason: 'not_sender' };
  if (r.status !== 'pending' || new Date(r.expiresAt).getTime() <= now.getTime()) return { canPoke: false, reason: 'status' };
  if (!recipientAllowsReminders) return { canPoke: false, reason: 'optout' };
  if (r.pokes.length >= 1) return { canPoke: false, reason: 'used' };
  const availableAt = new Date(new Date(r.createdAt).getTime() + cfg.pokeWaitHours * 3600000);
  if (now.getTime() < availableAt.getTime()) return { canPoke: false, reason: 'wait', availableAt: availableAt.toISOString() };
  const weekAgo = now.getTime() - 7 * DAY;
  const recent = all
    .filter((x) => x.fromUserId === r.fromUserId && x.toUserId === r.toUserId)
    .flatMap((x) => x.pokes)
    .filter((t) => new Date(t).getTime() > weekAgo).length;
  if (recent >= cfg.pokeMaxPer7Days) return { canPoke: false, reason: 'limit' };
  return { canPoke: true };
}

/** Requests that still "hold" the pair (prevent a duplicate interest). */
export const isActiveRequest = (r: ContactRequest, now = new Date()) =>
  (r.status === 'pending' && new Date(r.expiresAt).getTime() > now.getTime()) || r.status === 'accepted' || r.status === 'blocked';

export const DECLINE_COOLDOWN_DAYS = 30;

export const PHONE_CONSENT_TEXT = 'I agree to share my phone number with this person if they accept my offer.';

/** Light sanitising for free text: strip control chars and HTML-ish tags, collapse whitespace runs. */
export function sanitizeMessage(s: string): string {
  return stripUnsafe(s)
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type RelationBadgeKey = 'connected' | 'sent' | 'received' | 'theyDeclined' | 'youDeclined' | 'expired' | 'withdrawn';

/**
 * What a profile card says about your history with this person, so nobody re-sends blindly.
 * Blocked pairs never reach a card (they are filtered out of search), so they map to nothing.
 */
export function relationBadge(rel?: Relation): { key: RelationBadgeKey; tone: 'success' | 'gold' | 'emerald' | 'danger' | 'muted' } | null {
  if (!rel) return null;
  switch (rel.status) {
    case 'accepted':
      return { key: 'connected', tone: 'success' };
    case 'pending':
      return rel.direction === 'sent' ? { key: 'sent', tone: 'gold' } : { key: 'received', tone: 'emerald' };
    case 'declined':
      return rel.direction === 'sent' ? { key: 'theyDeclined', tone: 'danger' } : { key: 'youDeclined', tone: 'muted' };
    case 'expired':
      return { key: 'expired', tone: 'muted' };
    case 'withdrawn':
      return { key: 'withdrawn', tone: 'muted' };
    default:
      return null;
  }
}

/** True while the other person's "no" still blocks a new interest from you (cool-down window). */
export function declinedRecently(rel: Relation | undefined, now = new Date()) {
  return !!rel && rel.status === 'declined' && rel.direction === 'sent' && now.getTime() - new Date(rel.at).getTime() < DECLINE_COOLDOWN_DAYS * 86400000;
}
