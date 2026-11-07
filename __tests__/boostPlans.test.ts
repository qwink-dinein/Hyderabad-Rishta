import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { boostComparison } from '@/domain/metrics';
import { DEFAULT_PRICING, resolvePricing } from '@/domain/pricing';
import type { Profile, ViewEvent } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';
import { buyBoost, paidBoostMode } from './support/boost';

/** Owner PRD 2026-10-29: 7 / 14 / 30-day Boost options, every price set by the admin. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const DAY = 86400000;
const BRIDE = '9000000104'; // p_4, published, not boosted
const make = (storage = memoryKV()) => new DemoBackend({ storage, now });
async function as(b: DemoBackend, phone: string) {
  await b.logout();
  clock += RESEND_COOLDOWN_MS + 1;
  await b.requestOtp('+91', phone);
  await b.verifyOtp('+91', phone, DEMO_OTP);
}
/** A fresh demo in Paid Boost mode (the default is Referral mode, where no plan can be bought). */
async function paidDemo(storage = memoryKV()) {
  const b = make(storage);
  await as(b, DEMO_ADMIN_PHONE);
  await paidBoostMode(b);
  return b;
}
async function code(p: Promise<unknown>, c: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(c);
}

describe('boost options from the admin config', () => {
  it('members see the enabled options for their type, shortest first, with real prices', () => {
    expect(resolvePricing(DEFAULT_PRICING, 'groom').plans.map((p) => `${p.days}:${p.label}:${p.popular}`)).toEqual(['7:₹100:true', '14:₹200:false', '30:₹350:false']);
    expect(resolvePricing(DEFAULT_PRICING, 'bride').plans.map((p) => `${p.days}:${p.label}`)).toEqual(['7:₹100', '14:₹200', '30:₹350']);
  });

  it('a chosen paid option creates an order with that price and length; paying applies exactly that', async () => {
    const b = await paidDemo();
    await as(b, DEMO_USER_PHONE);
    const { order } = await b.startBoost('d14');
    expect(order).toMatchObject({ status: 'pending', amount: 200, terms: { boostDays: 14, planId: 'd14', autoRenew: false } });
    const { profile } = await b.completePayment(order.id, 'success');
    expect(new Date(profile.boostUntil!).getTime() - clock).toBe(14 * DAY);
  });

  it('repeat taps reuse one order; switching option replaces it (never two open orders)', async () => {
    const b = await paidDemo();
    await as(b, DEMO_USER_PHONE);
    const a = await b.startBoost('d30');
    expect((await b.startBoost('d30')).order.id).toBe(a.order.id);
    const c = await b.startBoost('d7');
    expect(c.order.id).not.toBe(a.order.id);
    const open = (await b.getMyOrders()).filter((o) => o.kind === 'boost' && o.status === 'pending');
    expect(open.map((o) => o.id)).toEqual([c.order.id]);
    await code(b.completePayment(a.order.id, 'success'), 'invalid_state'); // the replaced one can't be paid
  });

  it('a plan set to Free is never offered: free Boosts come only from referrals (owner rule 2026-11-07)', async () => {
    const b = await paidDemo();
    const cfg = await b.getPricing();
    await b.adminUpdatePricing({ ...cfg, boostPlans: cfg.boostPlans.map((p) => (p.id === 'd7' ? { ...p, fee: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'free', amount: 0 } } } : p)) });
    await as(b, BRIDE);
    expect(resolvePricing(await b.getPricing(), 'bride').plans.map((p) => p.id)).toEqual(['d14', 'd30']);
    await code(b.startBoost('d7'), 'fee_disabled');
    expect((await b.getMyProfile())!.boostUntil).toBeFalsy();
  });

  it('Referral mode (the default) allows no plan at all, paid or free', async () => {
    const b = make();
    await as(b, BRIDE);
    await code(b.startBoost('d14'), 'boost_referral_only');
  });

  it('price changes never alter an existing order; unknown or switched-off options are refused', async () => {
    const b = await paidDemo();
    await as(b, DEMO_USER_PHONE);
    const { order } = await b.startBoost('d14');
    await as(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await b.adminUpdatePricing({ ...cfg, boostPlans: cfg.boostPlans.map((p) => (p.id === 'd14' ? { ...p, fee: { ...p.fee, groom: { mode: 'paid', amount: 999 } } } : p.id === 'd30' ? { ...p, enabled: false } : p)) });
    await as(b, DEMO_USER_PHONE);
    expect((await b.getMyOrders()).find((o) => o.id === order.id)!.amount).toBe(200);
    await code(b.startBoost('d30'), 'fee_disabled');
    await code(b.startBoost('nope'), 'fee_disabled');
    await code(b.startBoost('x'.repeat(50)), 'validation');
    expect((await b.startBoost('d14')).order.amount).toBe(999); // new orders use the new price
  });

  it('boosts never renew by themselves', async () => {
    const b = await paidDemo();
    await as(b, BRIDE);
    await buyBoost(b, 'd7');
    clock += 8 * DAY;
    await b.getNotifications();
    const orders = (await b.getMyOrders()).filter((o) => o.kind === 'boost');
    expect(orders).toHaveLength(1);
    expect((await b.getMyProfile())!.boostUntil! < now().toISOString()).toBe(true);
  });

  it('admins can change every duration and price, but not save nonsense', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    const saved = await b.adminUpdatePricing({ ...cfg, boostPlans: [{ id: 'd10', days: 10, fee: { bride: { mode: 'paid', amount: 150 }, groom: { mode: 'paid', amount: 150 } }, enabled: true, popular: false }] });
    expect(saved.boostDays).toBe(10);
    expect(saved.boost.groom).toEqual({ mode: 'paid', amount: 150 });
    await code(b.adminUpdatePricing({ ...cfg, boostPlans: [{ ...cfg.boostPlans[0], fee: { ...cfg.boostPlans[0].fee, groom: { mode: 'paid', amount: -5 } } }] }), 'validation');
    await code(b.adminUpdatePricing({ ...cfg, boostPlans: [{ ...cfg.boostPlans[0], id: '<script>' }] }), 'validation');
  });

  it('configs saved before boost options existed are upgraded in place', async () => {
    const storage = memoryKV();
    const b = make(storage);
    await as(b, DEMO_USER_PHONE);
    const raw = JSON.parse((await storage.getItem('hr.demo.db'))!);
    delete raw.pricing.boostPlans;
    await storage.setItem('hr.demo.db', JSON.stringify(raw));
    const b2 = make(storage);
    expect((await b2.getPricing()).boostPlans.map((p) => p.days)).toEqual([7, 14, 30]);
  });
});

describe('My Boost numbers are honest', () => {
  const T = new Date('2026-11-01T09:00:00Z').getTime();
  const at = (d: number) => new Date(T + d * DAY).toISOString();
  const p = (published: number) => ({ id: 'p', userId: 'u', publishedAt: at(published), boostStartedAt: at(-3), boostUntil: at(4) }) as unknown as Profile;
  const views: ViewEvent[] = [at(-5), at(-4), at(-2), at(-1), at(-0.5)].map((x) => ({ profileId: 'p', viewerUserId: 'v', at: x }));
  it('counts views during the boost and in the same-length window before it', () => {
    expect(boostComparison(p(-30), views, new Date(T))).toMatchObject({ boostState: 'active', boostDays: 7, boostViews: 3, previousViews: 2 });
  });
  it('leaves the comparison out when the profile was not live for the whole earlier window', () => {
    const r = boostComparison(p(-4), views, new Date(T));
    expect(r.boostViews).toBe(3);
    expect(r.previousViews).toBeUndefined();
  });
});
