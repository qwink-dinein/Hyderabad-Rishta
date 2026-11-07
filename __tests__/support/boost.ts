import { withSinglePlan } from '@/domain/pricing';
import type { Backend } from '@/services/backend';

/** Paid Boost mode (admin): plans can be bought. Referral mode — the default — allows no plan at all. */
export async function paidBoostMode(b: Backend) {
  const s = await b.getReferralSettings();
  await b.adminUpdateReferralSettings({ ...s, mode: 'paid' });
}

/** Admin side: Paid Boost mode with one `days`-day plan at ₹`amount` for both types. Call while signed in as admin. */
export async function singlePaidPlan(b: Backend, days = 7, amount = 100) {
  await paidBoostMode(b);
  const cfg = await b.getPricing();
  return b.adminUpdatePricing(withSinglePlan(cfg, days, { bride: { mode: 'paid', amount }, groom: { mode: 'paid', amount } }));
}

/** Member side: buy and pay for a Boost (a Boost is never free outside referrals — owner rule 2026-11-07). */
export async function buyBoost(b: Backend, planId?: string) {
  const { order } = await b.startBoost(planId);
  if (order.status === 'pending') return b.completePayment(order.id, 'success');
  throw new Error(`unexpected boost order status ${order.status}`);
}
