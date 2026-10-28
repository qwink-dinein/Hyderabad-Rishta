import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { BOOST_REMINDER_EVERY_MS, boostNudge, boostReminderDue } from '@/domain/featured';
import { CATEGORY } from '@/domain/push';
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
    await b.adminUpdatePricing({ ...cfg, boostDays: 7, boost: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'free', amount: 0 } } });
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
