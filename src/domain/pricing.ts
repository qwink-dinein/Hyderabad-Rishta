import { formatMoney } from './format';
import type { Fee, PricingConfig, ProfileType } from './types';

export const DEFAULT_PRICING: PricingConfig = {
  version: 1,
  currency: 'INR',
  publication: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'free', amount: 0 } },
  boost: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'paid', amount: 499 } },
  boostDays: 7,
  requireApproval: true,
  updatedAt: new Date(0).toISOString(),
};

export interface ResolvedPricing {
  publication: Fee;
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
export function resolvePricing(cfg: PricingConfig, type: ProfileType): ResolvedPricing {
  const publication = cfg.publication[type];
  const boost = cfg.boost[type];
  return {
    publication,
    boost,
    boostDays: cfg.boostDays,
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
  check('Boost (bride)', cfg.boost.bride);
  check('Boost (groom)', cfg.boost.groom);
  if (!Number.isInteger(cfg.boostDays) || cfg.boostDays < 1 || cfg.boostDays > 90) errors.push('Boost duration must be 1–90 days');
  return errors;
}
