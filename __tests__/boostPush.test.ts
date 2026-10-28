import fs from 'fs';
import path from 'path';
import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { boostNoticeDue, isFeaturable, rotateFeatured } from '@/domain/featured';
import { CATEGORY, DEFAULT_PUSH_PREFS, PUSH_HOURLY_CAP, PUSH_LANGS, pushAllowed, pushContent, pushCopyKeys, scrubContact } from '@/domain/push';
import { EMPTY_FILTERS } from '@/domain/search';
import type { NotificationType } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';
import { buildMessage, checkReceipts, dispatchOnce, type ClaimedRow } from '../supabase/functions/push-dispatch/dispatch';

/** Owner request 2026-10-28: boosts must be seen by everyone eligible; every profile action must reach the phone. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const H = 3600_000;
const advance = (ms: number) => (clock += ms);
const make = () => new DemoBackend({ storage: memoryKV(), now });
const GROOM = DEMO_USER_PHONE; // u_demo / p_1
const BRIDE = '9000000102'; // u_2 / p_2
const BRIDE2 = '9000000104'; // u_4 / p_4
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbb]';

async function as(b: DemoBackend, phone: string) {
  await b.logout();
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp('+91', phone);
  await b.verifyOtp('+91', phone, DEMO_OTP);
}
async function code(p: Promise<unknown>, c: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(c));
}
/** Free boost for the signed-in member (admin sets boost price to free first). */
async function freeBoost(b: DemoBackend, phone: string, days = 7) {
  await as(b, DEMO_ADMIN_PHONE);
  const cfg = await b.getPricing();
  await b.adminUpdatePricing({ ...cfg, boostDays: days, boost: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'free', amount: 0 } } });
  await as(b, phone);
  await b.startBoost();
}
const outbox = (b: DemoBackend) => (b as unknown as { db: { pushOutbox: { userId: string; status: string; reason?: string; body: string; category: string; token?: string }[] } }).db.pushOutbox;

describe('featured (domain)', () => {
  it('only published, unexpired boosts of active owners are featurable', () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const p = { status: 'published' as const, deletedAt: undefined, boostUntil: '2026-10-05T00:00:00Z' };
    expect(isFeaturable(p, {}, at)).toBe(true);
    expect(isFeaturable({ ...p, status: 'paused' }, {}, at)).toBe(false);
    expect(isFeaturable({ ...p, boostUntil: '2026-09-30T00:00:00Z' }, {}, at)).toBe(false);
    expect(isFeaturable(p, { deactivatedAt: 'x' }, at)).toBe(false);
    expect(isFeaturable(p, undefined, at)).toBe(false);
  });

  it('rotation is stable per viewer per day and gives every boost the first slot over many viewers', () => {
    const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const day = new Date('2026-10-01T10:00:00Z');
    expect(rotateFeatured(items, 'v1', day)).toEqual(rotateFeatured(items, 'v1', new Date('2026-10-01T23:00:00Z')));
    const firsts = new Set(Array.from({ length: 200 }, (_, i) => rotateFeatured(items, `viewer${i}`, day)[0].id));
    expect(firsts).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('lifecycle notices fire once per end-time', () => {
    const until = '2026-10-02T00:00:00Z';
    expect(boostNoticeDue({ boostUntil: until }, new Date('2026-09-30T12:00:00Z'))).toBe(null);
    expect(boostNoticeDue({ boostUntil: until }, new Date('2026-10-01T06:00:00Z'))).toBe('ending');
    expect(boostNoticeDue({ boostUntil: until, boostNotices: { ending: until } }, new Date('2026-10-01T06:00:00Z'))).toBe(null);
    expect(boostNoticeDue({ boostUntil: until, boostNotices: { ending: until } }, new Date('2026-10-02T00:00:01Z'))).toBe('ended');
    expect(boostNoticeDue({ boostUntil: until, boostNotices: { ending: until, ended: until } }, new Date('2026-10-03T00:00:00Z'))).toBe(null);
  });
});

describe('boost visibility (backend)', () => {
  it('a boosted bride is featured to every groom, whatever their filters or sort', async () => {
    const b = make();
    await freeBoost(b, BRIDE2);
    await as(b, GROOM);
    const f = await b.getFeatured();
    expect(f.map((p) => p.id)).toContain('p_4');
    expect(f.every((p) => !p.contact)).toBe(true);
    // Filters that would exclude her from results don't affect Featured.
    const filtered = await b.searchProfiles({ ...EMPTY_FILTERS, ageMin: 40, ageMax: 45, sort: 'recent' }, 0, 50);
    expect(filtered.items.find((p) => p.id === 'p_4')).toBeUndefined();
    expect((await b.getFeatured()).map((p) => p.id)).toContain('p_4');
  });

  it('is never shown to the same profile type, to the owner, or across a block', async () => {
    const b = make();
    await freeBoost(b, BRIDE2);
    await as(b, BRIDE); // another bride
    expect((await b.getFeatured()).map((p) => p.id)).not.toContain('p_4');
    await as(b, BRIDE2); // the owner
    expect((await b.getFeatured()).map((p) => p.id)).not.toContain('p_4');
    await as(b, GROOM);
    await b.blockProfile('p_4');
    expect((await b.getFeatured()).map((p) => p.id)).not.toContain('p_4');
  });

  it('pausing hides the boost (and the owner is told why); resuming restores it', async () => {
    const b = make();
    await freeBoost(b, BRIDE2);
    await b.setPaused(true);
    const d = await b.getDashboard();
    expect(d).toMatchObject({ boostActive: true, boostVisible: false });
    await as(b, GROOM);
    expect((await b.getFeatured()).map((p) => p.id)).not.toContain('p_4');
    await as(b, BRIDE2);
    await b.setPaused(false);
    await as(b, GROOM);
    expect((await b.getFeatured()).map((p) => p.id)).toContain('p_4');
  });

  it('records unique reach for the owner and keeps the start date when extended', async () => {
    const b = make();
    await freeBoost(b, BRIDE2);
    const started = (await b.getDashboard()).boostStartedAt;
    for (const phone of [GROOM, '9000000103', '9000000105']) {
      await as(b, phone);
      await b.getFeatured();
      await b.getFeatured(); // same day → counted once
    }
    await as(b, BRIDE2);
    const d = await b.getDashboard();
    expect(d.featuredReach).toBeGreaterThanOrEqual(2);
    await b.startBoost(); // extend
    expect((await b.getDashboard()).boostStartedAt).toBe(started);
  });

  it('sends "ending" then "ended" exactly once each, and stops featuring at the end', async () => {
    const b = make();
    await freeBoost(b, BRIDE2, 2);
    advance(25 * H);
    await b.getNotifications();
    advance(H);
    const mid = await b.getNotifications();
    expect(mid.filter((n) => n.type === 'boost_ending')).toHaveLength(1);
    advance(24 * H);
    await b.getNotifications();
    const end = await b.getNotifications();
    expect(end.filter((n) => n.type === 'boost_ended')).toHaveLength(1);
    await as(b, GROOM);
    expect((await b.getFeatured()).map((p) => p.id)).not.toContain('p_4');
  });
});

describe('push policy (domain)', () => {
  it('every notification type has a category and copy in all three languages', () => {
    const types = Object.keys(CATEGORY) as NotificationType[];
    for (const lang of PUSH_LANGS) {
      expect(pushCopyKeys(lang)).toEqual(pushCopyKeys('en'));
      for (const t of types) expect(pushContent({ type: t, params: { name: 'Fatima', count: '3', status: 'paid' } }, lang, false).body.length).toBeGreaterThan(5);
    }
  });

  it('lock screens are generic by default; names only when opted in; never numbers', () => {
    const n = { type: 'request_received' as const, params: { name: 'Fatima' } };
    expect(pushContent(n, 'en', false).body).not.toContain('Fatima');
    expect(pushContent(n, 'en', true).body).toContain('Fatima');
    expect(pushContent({ type: 'request_received', params: { name: 'Call 9876543210' } }, 'en', true).body).not.toMatch(/\d{7}/);
    expect(scrubContact('mail me a@b.co or +91 98765 43210')).toBe('mail me ••• or •••');
  });

  it('categories can be muted, account notices cannot', () => {
    expect(pushAllowed('poke', { ...DEFAULT_PUSH_PREFS, interests: false })).toEqual({ ok: false, reason: 'category_off' });
    expect(pushAllowed('profile_viewed', { ...DEFAULT_PUSH_PREFS, enabled: false })).toEqual({ ok: false, reason: 'disabled' });
    expect(pushAllowed('payment', { ...DEFAULT_PUSH_PREFS, enabled: false })).toEqual({ ok: true });
  });
});

describe('push pipeline (backend)', () => {
  it('every action on a profile produces a phone push for its owner', async () => {
    const b = make();
    await as(b, BRIDE);
    await b.registerPushDevice(TOKEN_A, 'android');
    await as(b, GROOM);
    await b.getProfile('p_2'); // view
    await b.toggleShortlist('p_2'); // shortlist
    await b.sendRequest('p_2', { offerPhone: false, consent: false, idempotencyKey: 'k1' }); // interest
    const rows = outbox(b).filter((x) => x.userId === 'u_2');
    expect(rows.map((x) => x.category).sort()).toEqual(['activity', 'activity', 'interests']);
    expect(rows.every((x) => x.reason === 'not_configured' && x.token === TOKEN_A)).toBe(true);
    expect(rows.every((x) => !x.body.includes('Imran'))).toBe(true); // generic by default
  });

  it('views are batched (one notice per 6 h) and shortlists notify once per person', async () => {
    const b = make();
    for (const phone of [GROOM, '9000000103', '9000000105']) {
      await as(b, phone);
      await b.getProfile('p_2');
      advance(31 * 60_000);
    }
    await as(b, GROOM);
    await b.toggleShortlist('p_2');
    await b.toggleShortlist('p_2');
    await b.toggleShortlist('p_2');
    await as(b, BRIDE);
    const list = await b.getNotifications();
    expect(list.filter((n) => n.type === 'profile_viewed')).toHaveLength(1);
    expect(list.filter((n) => n.type === 'profile_shortlisted')).toHaveLength(1);
  });

  it('a shared phone only ever receives the signed-in account’s alerts', async () => {
    const b = make();
    await as(b, BRIDE);
    await b.registerPushDevice(TOKEN_A, 'ios');
    await as(b, BRIDE2);
    await b.registerPushDevice(TOKEN_A, 'ios'); // same phone, other account
    await as(b, GROOM);
    await b.sendRequest('p_2', { offerPhone: false, consent: false, idempotencyKey: 'k2' });
    expect(outbox(b).filter((x) => x.userId === 'u_2')).toHaveLength(0);
    await as(b, BRIDE);
    expect((await b.getPushSettings()).devices).toBe(0);
  });

  it('logout path: unregister removes only my own device', async () => {
    const b = make();
    await as(b, BRIDE);
    await b.registerPushDevice(TOKEN_A, 'android');
    await as(b, BRIDE2);
    await b.registerPushDevice(TOKEN_B, 'android');
    await b.unregisterPushDevice(TOKEN_A); // not hers → no effect
    await as(b, BRIDE);
    expect((await b.getPushSettings()).devices).toBe(1);
    await b.unregisterPushDevice(TOKEN_A);
    expect((await b.getPushSettings()).devices).toBe(0);
  });

  it('honours preferences, inactive accounts and the hourly cap (account notices exempt)', async () => {
    const b = make();
    await as(b, BRIDE);
    await b.registerPushDevice(TOKEN_A, 'android');
    expect(await b.setPushPrefs({ activity: false, showNames: true, bogus: true } as never)).toMatchObject({ activity: false, showNames: true });
    await as(b, GROOM);
    await b.getProfile('p_2');
    expect(outbox(b).find((x) => x.userId === 'u_2')?.reason).toBe('category_off');
    await b.sendRequest('p_2', { offerPhone: false, consent: false, idempotencyKey: 'k3' });
    const interest = outbox(b).find((x) => x.userId === 'u_2' && x.category === 'interests');
    expect(interest?.body).toContain('Imran'); // she opted in to names
  });

  it('caps pushes per hour (in-app still gets everything); account notices are exempt', async () => {
    const b = make();
    await as(b, BRIDE);
    await b.registerPushDevice(TOKEN_A, 'android');
    const raw = b as unknown as { run: (fn: (db: unknown) => void, write: boolean) => Promise<void>; notify: (db: unknown, u: string, t: string, p?: object) => void };
    await raw.run((db) => {
      for (let i = 0; i < PUSH_HOURLY_CAP + 3; i++) raw.notify.call(b, db, 'u_2', 'poke', {});
      raw.notify.call(b, db, 'u_2', 'payment', { status: 'paid' });
    }, true);
    const mine = outbox(b).filter((x) => x.userId === 'u_2');
    expect(mine.filter((x) => x.reason === 'rate_limited')).toHaveLength(3);
    expect(mine.find((x) => x.category === 'account')?.reason).toBe('not_configured');
    expect((await b.getNotifications()).filter((n) => n.type === 'poke')).toHaveLength(PUSH_HOURLY_CAP + 3);
    advance(61 * 60_000);
    await raw.run((db) => raw.notify.call(b, db, 'u_2', 'poke', {}), true);
    expect(outbox(b)[0].reason).toBe('not_configured');
  });

  it('rejects malformed tokens and requires a session', async () => {
    const b = make();
    await code(b.registerPushDevice('ExponentPushToken[aaaaaaaaaaaa]', 'android'), 'unauthenticated');
    await as(b, BRIDE);
    await code(b.registerPushDevice('hello', 'android'), 'validation');
    await code(b.registerPushDevice(TOKEN_A, 'web' as never), 'validation');
  });

  it('admins see push health counts without tokens', async () => {
    const b = make();
    await as(b, BRIDE);
    await b.registerPushDevice(TOKEN_A, 'android');
    await as(b, DEMO_ADMIN_PHONE);
    const s = await b.adminStats();
    expect(s.push).toMatchObject({ devices: 1, usersWithDevices: 1 });
    expect(JSON.stringify(s)).not.toContain('PushToken');
    expect(s.boosts).toEqual(expect.objectContaining({ active: expect.any(Number), visible: expect.any(Number) }));
  });
});

describe('dispatcher (edge function core)', () => {
  const rows: ClaimedRow[] = [
    { id: 1, token: TOKEN_A, type: 'request_received', params: { name: 'Fatima' }, deep_link: '/requests', notification_id: 'n1', lang: 'ur', show_names: false },
    { id: 2, token: TOKEN_B, type: 'poke', params: {}, deep_link: '/requests', notification_id: 'n2', lang: 'en', show_names: true },
  ];

  it('builds lock-screen-safe messages with routing data only', () => {
    const m = buildMessage(rows[0]);
    expect(m).toMatchObject({ to: TOKEN_A, title: 'حیدرآباد رشتہ', data: { notificationId: 'n1', deepLink: '/requests' }, channelId: 'default' });
    expect(JSON.stringify(m)).not.toContain('Fatima');
  });

  it('records tickets, removes dead tokens, retries network failures, and checks receipts', async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      calls.push([fn, args]);
      if (fn === 'claim_push_batch') return rows;
      if (fn === 'due_push_receipts') return ['t1'];
      return null;
    };
    const fetchOk = async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.endsWith('/send') ? { data: [{ status: 'ok', id: 't1' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] } : { data: { t1: { status: 'ok' } } }),
    });
    expect(await dispatchOnce({ rpc, fetch: fetchOk })).toEqual({ claimed: 2, sent: 1, failed: 1 });
    expect(calls).toContainEqual(['push_result', { p_id: 1, p_ok: true, p_ticket: 't1', p_error: null }]);
    expect(calls).toContainEqual(['push_result', { p_id: 2, p_ok: false, p_ticket: null, p_error: 'DeviceNotRegistered' }]);
    expect(await checkReceipts({ rpc, fetch: fetchOk })).toEqual({ checked: 1 });
    expect(calls).toContainEqual(['push_receipt', { p_ticket: 't1', p_ok: true, p_error: null }]);

    calls.length = 0;
    const fetchDown = async () => {
      throw new Error('offline');
    };
    expect(await dispatchOnce({ rpc, fetch: fetchDown as never })).toEqual({ claimed: 2, sent: 0, failed: 2 });
    expect(calls.filter((c) => c[0] === 'push_result').every((c) => c[1].p_error === 'network')).toBe(true);
  });

  it('the Deno copy of the push policy is in sync with src/domain/push.ts', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FILES, build } = require('../scripts/sync-shared.js');
    for (const [src, dest] of FILES) expect(fs.readFileSync(path.join(__dirname, '..', dest), 'utf8')).toBe(build(src));
  });
});
