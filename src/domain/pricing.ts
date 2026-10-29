import { formatMoney } from './format';
import type { BoostPlan, Fee, PricingConfig, ProfileType } from './types';

/**
 * Initial Boost options (owner PRD 2026-10-29: 7 / 14 / 30 days at ₹100 / ₹200 / ₹350). These are only
 * starting values — the admin changes every duration and price in Admin → Pricing. Brides keep the
 * earlier owner rule of a free 7-day boost; longer bride boosts use the same prices as grooms.
 */
export const DEFAULT_BOOST_PLANS: BoostPlan[] = [
  { id: 'd7', days: 7, fee: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'paid', amount: 100 } }, enabled: true, popular: true },
  { id: 'd14', days: 14, fee: { bride: { mode: 'paid', amount: 200 }, groom: { mode: 'paid', amount: 200 } }, enabled: true, popular: false },
  { id: 'd30', days: 30, fee: { bride: { mode: 'paid', amount: 350 }, groom: { mode: 'paid', amount: 350 } }, enabled: true, popular: false },
];
export const MAX_BOOST_PLANS = 6;
const PLAN_ID = /^[a-z0-9_-]{1,20}$/;

export const DEFAULT_PRICING: PricingConfig = {
  version: 1,
  currency: 'INR',
  publication: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'free', amount: 0 } },
  boostPlans: DEFAULT_BOOST_PLANS,
  boost: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'paid', amount: 100 } },
  boostDays: 7,
  requireApproval: true,
  requestExpiryDays: 14,
  pokeWaitHours: 48,
  pokeMaxPer7Days: 2,
  updatedAt: new Date(0).toISOString(),
};

export interface ResolvedPlan {
  id: string;
  days: number;
  fee: Fee;
  label: string;
  popular: boolean;
}

export interface ResolvedPricing {
  publication: Fee;
  /** Boost options this member can choose (enabled, not disabled for their type), shortest first. */
  plans: ResolvedPlan[];
  /** The default (shortest) plan's fee — `disabled` when no plan is available. */
  boost: Fee;
  boostDays: number;
  currency: string;
  publicationLabel: string;
  boostLabel: string;
}

export function feeLabel(fee: Fee, currency: string): string {
  if (fee.mode === 'free') return 'free';
  if (fee.mode === 'disabled') return 'disabled';
  return formatMoney(fee.amount, currency);
}

/** The ONLY way screens should read prices (PRD §8 — never hardcode). */
/** The plans a member of `type` can buy, shortest first. */
export function boostPlansFor(cfg: PricingConfig, type: ProfileType): ResolvedPlan[] {
  return (cfg.boostPlans ?? [])
    .filter((p) => p.enabled && p.fee[type].mode !== 'disabled')
    .map((p) => ({ id: p.id, days: p.days, fee: p.fee[type], label: feeLabel(p.fee[type], cfg.currency), popular: p.popular }))
    .sort((a, b) => a.days - b.days);
}

export function resolvePricing(cfg: PricingConfig, type: ProfileType): ResolvedPricing {
  const publication = cfg.publication[type];
  const plans = boostPlansFor(cfg, type);
  const boost: Fee = plans[0]?.fee ?? { mode: 'disabled', amount: 0 };
  return {
    publication,
    plans,
    boost,
    boostDays: plans[0]?.days ?? cfg.boostDays,
    currency: cfg.currency,
    publicationLabel: feeLabel(publication, cfg.currency),
    boostLabel: feeLabel(boost, cfg.currency),
  };
}

export type PricingCopyKey =
  | 'pricing.copy.bothFree'
  | 'pricing.copy.pubFreeBoostPaid'
  | 'pricing.copy.pubPaidBoostFree'
  | 'pricing.copy.bothPaid'
  | 'pricing.copy.pubFreeBoostOff'
  | 'pricing.copy.pubPaidBoostOff';

/**
 * Picks the pricing explainer copy for the active configuration.
 * Returns an i18n key and interpolation params; the copy is generated, never hand-written per screen.
 */
export function pricingCopy(cfg: PricingConfig, type: ProfileType): { key: PricingCopyKey; params: Record<string, string> } {
  const r = resolvePricing(cfg, type);
  const params = {
    days: String(r.boostDays),
    publicationPrice: r.publication.mode === 'paid' ? formatMoney(r.publication.amount, r.currency) : '',
    boostPrice: r.boost.mode === 'paid' ? formatMoney(r.boost.amount, r.currency) : '',
  };
  const pubPaid = r.publication.mode === 'paid';
  if (r.boost.mode === 'disabled') return { key: pubPaid ? 'pricing.copy.pubPaidBoostOff' : 'pricing.copy.pubFreeBoostOff', params };
  const boostPaid = r.boost.mode === 'paid';
  if (!pubPaid && !boostPaid) return { key: 'pricing.copy.bothFree', params };
  if (!pubPaid && boostPaid) return { key: 'pricing.copy.pubFreeBoostPaid', params };
  if (pubPaid && !boostPaid) return { key: 'pricing.copy.pubPaidBoostFree', params };
  return { key: 'pricing.copy.bothPaid', params };
}

export function validatePricing(cfg: PricingConfig): string[] {
  const errors: string[] = [];
  const check = (label: string, f: Fee) => {
    if (f.mode === 'paid' && (!Number.isFinite(f.amount) || f.amount <= 0)) errors.push(`${label}: paid amount must be greater than 0`);
    if (f.amount > 100000) errors.push(`${label}: amount looks too high`);
  };
  check('Publication (bride)', cfg.publication.bride);
  check('Publication (groom)', cfg.publication.groom);
  const plans = Array.isArray(cfg.boostPlans) ? cfg.boostPlans : [];
  if (!plans.length) errors.push('Add at least one boost option');
  if (plans.length > MAX_BOOST_PLANS) errors.push(`At most ${MAX_BOOST_PLANS} boost options`);
  const days = new Set<number>();
  const ids = new Set<string>();
  for (const p of plans) {
    const name = `Boost ${p?.days ?? '?'} days`;
    if (typeof p?.id !== 'string' || !PLAN_ID.test(p.id) || ids.has(p.id)) errors.push(`${name}: invalid or repeated id`);
    else ids.add(p.id);
    if (!Number.isInteger(p?.days) || p.days < 1 || p.days > 90) errors.push(`${name}: duration must be 1–90 days`);
    else if (days.has(p.days)) errors.push(`${name}: two options have the same duration`);
    else days.add(p.days);
    if (!p?.fee?.bride || !p?.fee?.groom) errors.push(`${name}: missing prices`);
    else {
      check(`${name} (bride)`, p.fee.bride);
      check(`${name} (groom)`, p.fee.groom);
    }
  }
  if (plans.filter((p) => p?.popular).length > 1) errors.push('Only one option can be marked Popular');
  if (!Number.isInteger(cfg.requestExpiryDays) || cfg.requestExpiryDays < 1 || cfg.requestExpiryDays > 90) errors.push('Request expiry must be 1–90 days');
  if (!Number.isInteger(cfg.pokeWaitHours) || cfg.pokeWaitHours < 1 || cfg.pokeWaitHours > 336) errors.push('Reminder wait must be 1–336 hours');
  if (!Number.isInteger(cfg.pokeMaxPer7Days) || cfg.pokeMaxPer7Days < 0 || cfg.pokeMaxPer7Days > 7) errors.push('Reminders per person per 7 days must be 0–7');
  return errors;
}

/** Keeps the derived `boost` / `boostDays` summary equal to each type's default (shortest) plan. */
export function syncBoostSummary(cfg: PricingConfig): PricingConfig {
  const bride = boostPlansFor(cfg, 'bride')[0];
  const groom = boostPlansFor(cfg, 'groom')[0];
  return {
    ...cfg,
    boost: { bride: bride?.fee ?? { mode: 'disabled', amount: 0 }, groom: groom?.fee ?? { mode: 'disabled', amount: 0 } },
    boostDays: (groom ?? bride)?.days ?? cfg.boostDays,
  };
}

/** Older saved configs (before boost options existed) get the default options. */
export function withBoostPlans(cfg: PricingConfig): PricingConfig {
  return Array.isArray(cfg.boostPlans) && cfg.boostPlans.length ? cfg : syncBoostSummary({ ...cfg, boostPlans: DEFAULT_BOOST_PLANS.map((p) => ({ ...p, fee: { ...p.fee } })) });
}

/** One boost option only (e.g. "7 days, free for everyone") — used by tests and quick admin setups. */
export function withSinglePlan(cfg: PricingConfig, days: number, fee: Record<ProfileType, Fee>): PricingConfig {
  return syncBoostSummary({ ...cfg, boostPlans: [{ id: `d${days}`, days, fee, enabled: true, popular: false }] });
}
