import { withSinglePlan } from '@/domain/pricing';
import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { BOOST_REMINDER_EVERY_MS, boostNudge, boostReminderDue } from '@/domain/featured';
import { CATEGORY } from '@/domain/push';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/** Owner request 2026-10-28: Boost as the centre tab, reminding members who haven't boosted. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const DAY = 86400000;
const live = { status: 'published' as const, deletedAt: undefined, boostUntil: undefined, publishedAt: new Date(clock - 30 * DAY).toISOString() };
const owner = { deactivatedAt: undefined, deletedAt: undefined };

describe('boostNudge (tab dot, pulse, Home card, Boost screen)', () => {
  it('reminds only when the member could boost right now', () => {
    expect(boostNudge(null, false, now())).toBe('no_profile');
    expect(boostNudge({ ...live, status: 'draft' }, false, now())).toBe('not_published');
    expect(boostNudge({ ...live, status: 'pending' }, false, now())).toBe('not_published');
    expect(boostNudge(live, false, now())).toBe('ready');
    expect(boostNudge(live, true, now())).toBe('disabled');
    expect(boostNudge({ ...live, boostUntil: new Date(clock + DAY).toISOString() }, false, now())).toBe('active');
    expect(boostNudge({ ...live, boostUntil: new Date(clock - DAY).toISOString() }, false, now())).toBe('ready'); // expired
  });
});

describe('boostReminderDue (weekly notification)', () => {
  it('weekly at most, never right after publishing or a boost', () => {
    expect(boostReminderDue(live, owner, undefined, false, now())).toBe(true);
    expect(boostReminderDue(live, owner, new Date(clock - 3 * DAY).toISOString(), false, now())).toBe(false);
    expect(boostReminderDue(live, owner, new Date(clock - BOOST_REMINDER_EVERY_MS).toISOString(), false, now())).toBe(true);
    expect(boostReminderDue({ ...live, publishedAt: new Date(clock - DAY).toISOString() }, owner, undefined, false, now())).toBe(false);
    expect(boostReminderDue({ ...live, boostUntil: new Date(clock - 2 * DAY).toISOString() }, owner, undefined, false, now())).toBe(false);
    expect(boostReminderDue({ ...live, boostUntil: new Date(clock + 2 * DAY).toISOString() }, owner, undefined, false, now())).toBe(false);
    expect(boostReminderDue(live, owner, undefined, true, now())).toBe(false);
    expect(boostReminderDue(live, { deactivatedAt: 'x', deletedAt: undefined }, undefined, false, now())).toBe(false);
    expect(boostReminderDue(live, undefined, undefined, false, now())).toBe(false);
  });
  it('is promotional: obeys the "announcements" switch and the hourly cap', () => {
    expect(CATEGORY.boost_reminder).toBe('announcements');
  });
});

describe('demo backend reminders', () => {
  async function login(b: DemoBackend, phone: string) {
    await b.logout();
    clock += RESEND_COOLDOWN_MS + 1;
    await b.requestOtp('+91', phone);
    await b.verifyOtp('+91', phone, DEMO_OTP);
  }
  const reminders = async (b: DemoBackend) => (await b.getNotifications()).filter((n) => n.type === 'boost_reminder');

  it('an unboosted member gets one reminder a week, opening the Boost tab; boosting stops them', async () => {
    const b = new DemoBackend({ storage: memoryKV(), now });
    await login(b, DEMO_USER_PHONE);
    expect(await reminders(b)).toHaveLength(0); // the seed profile went live a day ago: grace period
    clock += 2 * DAY;
    let r = await reminders(b);
    expect(r).toHaveLength(1);
    expect(r[0].deepLink).toBe('/boost');
    clock += 3 * DAY;
    expect(await reminders(b)).toHaveLength(1);
    clock += 5 * DAY;
    expect(await reminders(b)).toHaveLength(2);
    // Boost (free for this test) → no more reminders while boosted, nor the week after it ends.
    await login(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await b.adminUpdatePricing(withSinglePlan(cfg, 7, { bride: { mode: 'free', amount: 0 }, groom: { mode: 'free', amount: 0 } }));
    await login(b, DEMO_USER_PHONE);
    await b.startBoost();
    clock += 10 * DAY; // boost ended 3 days ago
    r = await reminders(b);
    expect(r).toHaveLength(2);
    clock += 5 * DAY; // a week after it ended
    expect(await reminders(b)).toHaveLength(3);
    const n = (await b.getNotifications()).find((x) => x.type === 'boost_started')!;
    expect(n.deepLink).toBe('/boost');
  });
});

describe('one boost at a time (owner rule 2026-10-28)', () => {
  async function login(b: DemoBackend, phone: string) {
    await b.logout();
    clock += RESEND_COOLDOWN_MS + 1;
    await b.requestOtp('+91', phone);
    await b.verifyOtp('+91', phone, DEMO_OTP);
  }
  async function code(p: Promise<unknown>, c: string) {
    const e = await p.then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe(c);
    return e as AppError;
  }
  async function setBoost(b: DemoBackend, mode: 'free' | 'paid') {
    await login(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await b.adminUpdatePricing(withSinglePlan(cfg, 7, { bride: { mode, amount: mode === 'paid' ? 499 : 0 }, groom: { mode, amount: mode === 'paid' ? 499 : 0 } }));
    await login(b, DEMO_USER_PHONE);
  }

  it('free boost: a second boost while the first runs is refused, until it ends', async () => {
    const b = new DemoBackend({ storage: memoryKV(), now });
    await setBoost(b, 'free');
    const first = await b.startBoost();
    const until = first.profile.boostUntil;
    const e = await code(b.startBoost(), 'boost_active');
    expect(e.details?.until).toBe(until);
    clock += 3 * DAY;
    await code(b.startBoost(), 'boost_active');
    expect((await b.getMyProfile())!.boostUntil).toBe(until); // never extended
    clock += 5 * DAY; // ended
    const again = await b.startBoost();
    expect(new Date(again.profile.boostUntil!).getTime()).toBeGreaterThan(new Date(until!).getTime());
  });

  it('paid boost: repeat taps reuse ONE pending order; after paying, no new order', async () => {
    const b = new DemoBackend({ storage: memoryKV(), now });
    await setBoost(b, 'paid');
    const a = await b.startBoost();
    const c = await b.startBoost();
    expect(c.order.id).toBe(a.order.id);
    expect((await b.getMyOrders()).filter((o) => o.kind === 'boost' && o.status === 'pending')).toHaveLength(1);
    await b.completePayment(a.order.id, 'success');
    await code(b.startBoost(), 'boost_active');
    expect((await b.getMyOrders()).filter((o) => o.kind === 'boost')).toHaveLength(1);
  });

  it('two phones: paying the same order twice is refused; a stray unpaid order is cancelled, never charged', async () => {
    const storage = memoryKV();
    const b = new DemoBackend({ storage, now });
    await setBoost(b, 'paid');
    const a = await b.startBoost();
    await b.completePayment(a.order.id, 'success');
    await code(b.completePayment(a.order.id, 'success'), 'invalid_state'); // second phone, same order
    // A stray pending boost order (e.g. from an old app version) while the boost runs:
    const db = (b as unknown as { db: { orders: { id: string; status: string }[] } }).db;
    db.orders.unshift({ ...(await b.getMyOrders())[0], id: 'o_stray', status: 'pending' } as never);
    await code(b.completePayment('o_stray', 'success'), 'boost_active');
    expect((await b.getMyOrders()).find((o) => o.id === 'o_stray')!.status).toBe('cancelled');
    expect((await b.getMyOrders()).filter((o) => o.kind === 'boost' && o.status === 'paid')).toHaveLength(1);
  });
});
