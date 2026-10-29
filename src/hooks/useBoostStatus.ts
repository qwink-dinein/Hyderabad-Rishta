import { bidiIsolate, formatMoney } from '@/domain/format';
import type { ProfileStatus } from '@/domain/types';
import { resolvePricing, type ResolvedPlan } from '@/domain/pricing';
import { profileTypeOf } from '@/domain/privacy';
import { useBoostNudge } from './useBoostNudge';
import { useDashboard, useMyProfile, usePricing } from './queries';

export interface BoostStatus {
  /** no_profile · not_published · disabled · ready (could boost now) · active */
  nudge: ReturnType<typeof useBoostNudge>;
  /** A boost ran before and has ended. */
  expired: boolean;
  plans: ResolvedPlan[];
  /** The default (shortest) option is free. */
  free: boolean;
  /** "₹100" — the cheapest paid option, for "From …" labels. */
  fromPrice?: string;
  until?: string;
  /** The member's profile status (to tell "paused" and "waiting for approval" from "not published"). */
  status?: ProfileStatus;
}

/** One place that turns profile + live admin pricing + dashboard into what Home, Profile and Boost show. */
export function useBoostStatus(): BoostStatus {
  const nudge = useBoostNudge();
  const { data: profile } = useMyProfile();
  const { data: pricing } = usePricing();
  const { data: m } = useDashboard();
  const plans = profile && pricing ? resolvePricing(pricing, profileTypeOf(profile)).plans : [];
  const paid = plans.filter((p) => p.fee.mode === 'paid');
  const cheapest = paid.length ? Math.min(...paid.map((p) => p.fee.amount)) : undefined;
  return {
    nudge,
    expired: nudge !== 'active' && m?.boostState === 'expired',
    plans,
    free: plans[0]?.fee.mode === 'free',
    // Isolated so "₹100" keeps its order inside Urdu (right-to-left) sentences.
    fromPrice: cheapest != null && pricing ? bidiIsolate(formatMoney(cheapest, pricing.currency)) : undefined,
    status: profile?.status,
    until: m?.boostUntil,
  };
}
