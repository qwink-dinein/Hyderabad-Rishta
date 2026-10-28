import { DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { DemoBackend, MAX_ANALYTICS, MAX_NOTIFICATIONS_PER_USER, RESEND_COOLDOWN_MS, type DemoDb } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/** Owner request 2026-10-28: "minimise the long data sizes". The on-phone store must stay bounded. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const kv = memoryKV();
const b = new DemoBackend({ storage: kv, now });
const dbOf = (x: DemoBackend) => (x as unknown as { db: DemoDb }).db;
const size = async () => (await kv.getItem('hr.demo.db'))!.length;

it('a year of heavy use cannot grow the store without limit', async () => {
  await b.requestOtp('+91', DEMO_USER_PHONE);
  await b.verifyOtp('+91', DEMO_USER_PHONE, DEMO_OTP);
  const fresh = await size();
  const db = dbOf(b);
  const old = new Date(clock - 300 * 86400000).toISOString();
  for (let i = 0; i < 20_000; i++) db.notifications.push({ id: `n_x${i}`, userId: 'u_demo', type: 'profile_viewed', params: { count: '1' }, deepLink: '/dashboard', createdAt: old });
  for (let i = 0; i < 50_000; i++) db.analytics.push({ id: `ev_x${i}`, name: 'search', at: old, props: {} });
  for (let i = 0; i < 5_000; i++) db.idem.push({ key: `interest:${i}`, userId: 'u_demo', resultId: 'r', at: old });
  for (let i = 0; i < 20_000; i++) db.boostImpressions.push({ profileId: 'p_2', viewerUserId: `u_${i}`, day: '2025-01-01' });
  for (let i = 0; i < 2_000; i++) db.otps.push({ key: `+91${i}`, issuedAt: 0, attempts: 0, resends: [0] });
  await (b as unknown as { persist(): Promise<void> }).persist();
  const bloated = await size();
  clock += RESEND_COOLDOWN_MS;
  await b.setAllowReminders(true); // any write prunes
  const after = await size();
  const d = dbOf(b);
  expect(d.notifications.filter((n) => n.userId === 'u_demo').length).toBe(MAX_NOTIFICATIONS_PER_USER);
  expect(d.analytics.length).toBeLessThanOrEqual(MAX_ANALYTICS);
  expect(d.idem.length).toBe(0);
  expect(d.otps.length).toBe(0);
  expect(d.boostImpressions.some((i) => i.day === '2025-01-01')).toBe(false);
  expect(after).toBeLessThan(fresh + 1_000_000);
  console.log(`demo store: fresh ${(fresh / 1024).toFixed(0)} KB · flooded ${(bloated / 1024).toFixed(0)} KB · after prune ${(after / 1024).toFixed(0)} KB`);
});

it('the newest notifications are the ones kept', async () => {
  const list = await b.getNotifications();
  expect(list.length).toBeLessThanOrEqual(MAX_NOTIFICATIONS_PER_USER);
});
