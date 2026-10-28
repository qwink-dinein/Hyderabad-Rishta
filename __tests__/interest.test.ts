import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { pokeEligibility, sanitizeMessage } from '@/domain/connections';
import type { ContactRequest } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/**
 * Feature PRD "Express Interest, Consent-Based Contact Sharing & Poke" — §12 acceptance criteria,
 * exercised with two demo accounts: GROOM = u_demo (p_1), BRIDE = u_2 (p_2, phone 9000000102).
 */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);
const H = 3600000;
const make = () => new DemoBackend({ storage: memoryKV(), now });
const GROOM = DEMO_USER_PHONE;
const BRIDE = '9000000102';
const BRIDE_PROFILE = 'p_2';
const GROOM_PROFILE = 'p_1';

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
let k = 0;
const intro = (message?: string) => ({ message, offerPhone: false, consent: false, idempotencyKey: `k${++k}` });
const offer = (message?: string) => ({ message, offerPhone: true, consent: true, idempotencyKey: `k${++k}` });
const reqTo = async (b: DemoBackend, profileId: string) => (await b.getRequestStatusWith(profileId))!;

describe('1–3: express interest without / with a number offer', () => {
  it('sends an introduction with no message and no number', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, intro());
    expect(r).toMatchObject({ status: 'pending', message: undefined });
    await as(b, BRIDE);
    const view = await reqTo(b, GROOM_PROFILE);
    expect(view.theirOffer).toBeUndefined();
    expect(JSON.stringify(view)).not.toContain(GROOM); // sender's number nowhere in the payload
  });

  it('requires explicit consent to offer a number, and stores the consent record', async () => {
    const b = make();
    await as(b, GROOM);
    await code(b.sendRequest(BRIDE_PROFILE, { ...offer(), consent: false }), 'consent_required');
    await b.sendRequest(BRIDE_PROFILE, offer('Salaam'));
    const mine = (await reqTo(b, BRIDE_PROFILE)).myOffer!;
    expect(mine).toMatchObject({ status: 'offered', withInterest: true });
    expect(mine.consentText).toMatch(/I agree to share my phone number/);
    expect(mine.consentAt).toBeTruthy();
  });

  it('sanitises and length-limits the introduction', async () => {
    expect(sanitizeMessage('  <b>Hello</b>\u0007 there  ')).toBe('Hello there');
    const b = make();
    await as(b, GROOM);
    await code(b.sendRequest(BRIDE_PROFILE, intro('x'.repeat(801))), 'validation');
  });

  it('double taps / retries with the same key never create duplicates', async () => {
    const b = make();
    await as(b, GROOM);
    const input = intro('hi');
    const [a, c] = await Promise.all([b.sendRequest(BRIDE_PROFILE, input), b.sendRequest(BRIDE_PROFILE, input)]);
    expect(a.id).toBe(c.id);
    expect((await b.getRequests()).filter((r) => r.other.id === BRIDE_PROFILE)).toHaveLength(1);
    await code(b.sendRequest(BRIDE_PROFILE, intro()), 'duplicate'); // new key, same pair → shows status instead
  });
});

describe('4–6: accept / decline and contact sharing', () => {
  it('Case A: accepting an interest that offered a number reveals ONLY the sender’s number', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    expect((await b.getProfile(GROOM_PROFILE)).contact?.phone).toBe(GROOM);
    await as(b, GROOM);
    expect((await b.getProfile(BRIDE_PROFILE)).contact).toBeUndefined(); // never automatic both ways
  });

  it('Case B: accepting without an offer reveals nothing; either side can then offer separately', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, intro());
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    expect((await b.getProfile(GROOM_PROFILE)).contact).toBeUndefined();
    const o = await b.offerPhone(r.id, true, 'bride-offer');
    await code(b.offerPhone(r.id, true, 'bride-offer-2'), 'duplicate');
    await as(b, GROOM);
    expect((await b.getProfile(BRIDE_PROFILE)).contact).toBeUndefined(); // offered ≠ revealed
    await b.respondToPhoneOffer(o.id, 'accepted');
    expect((await b.getProfile(BRIDE_PROFILE)).contact?.phone).toBe(BRIDE);
    await as(b, BRIDE);
    expect((await b.getProfile(GROOM_PROFILE)).contact).toBeUndefined(); // bride shared hers, not vice versa
  });

  it('declining closes the request and reveals nothing; the sender cannot immediately re-send', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'declined');
    await code(b.respondToRequest(r.id, 'accepted'), 'invalid_state'); // simultaneous second answer loses
    expect((await b.getProfile(GROOM_PROFILE)).contact).toBeUndefined();
    expect((await reqTo(b, GROOM_PROFILE)).theirOffer?.status).toBe('expired');
    await as(b, GROOM);
    await code(b.sendRequest(BRIDE_PROFILE, intro()), 'declined_recently');
  });

  it('an offer cannot be made before acceptance or without consent', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, intro());
    await code(b.offerPhone(r.id, true, 'x'), 'invalid_state');
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    await code(b.offerPhone(r.id, false, 'y'), 'consent_required');
  });
});

describe('11: withdrawal and conflict safety', () => {
  it('withdrawing the number offer before acceptance means acceptance reveals nothing', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    const mine = (await reqTo(b, BRIDE_PROFILE)).myOffer!;
    await b.withdrawPhoneOffer(mine.id);
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted'); // the race resolves in favour of the earlier withdrawal
    expect((await b.getProfile(GROOM_PROFILE)).contact).toBeUndefined();
    expect((await reqTo(b, GROOM_PROFILE)).theirOffer?.status).toBe('withdrawn');
    expect((await b.getNotifications()).some((n) => n.type === 'phone_offer_withdrawn')).toBe(true);
  });

  it('a withdrawn reciprocal offer can never be accepted afterwards', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, intro());
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    const o = await b.offerPhone(r.id, true, 'z');
    await b.withdrawPhoneOffer(o.id);
    await as(b, GROOM);
    await code(b.respondToPhoneOffer(o.id, 'accepted'), 'invalid_state');
    expect((await b.getProfile(BRIDE_PROFILE)).contact).toBeUndefined();
  });

  it('an accepted offer cannot be withdrawn (the number was already revealed)', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    await as(b, GROOM);
    await code(b.withdrawPhoneOffer((await reqTo(b, BRIDE_PROFILE)).myOffer!.id), 'invalid_state');
  });

  it('withdrawing the whole interest withdraws its offer too', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    await b.withdrawRequest(r.id);
    expect((await reqTo(b, BRIDE_PROFILE)).myOffer?.status).toBe('withdrawn');
    await as(b, BRIDE);
    await code(b.respondToRequest(r.id, 'accepted'), 'invalid_state');
  });

  it('blocking marks requests Blocked, hides a previously shared number and stops pokes/offers', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    expect((await b.getProfile(GROOM_PROFILE)).contact?.phone).toBe(GROOM);
    await b.blockProfile(GROOM_PROFILE);
    const v = (await b.getRequests()).find((x) => x.request.id === r.id)!;
    expect(v.request.status).toBe('blocked');
    expect(v.other.contact).toBeUndefined();
    await code(b.offerPhone(r.id, true, 'after-block'), 'invalid_state');
    await as(b, GROOM);
    await code(b.sendRequest(BRIDE_PROFILE, intro()), 'not_found');
  });
});

describe('7–8: poke', () => {
  const base = (over: Partial<ContactRequest> = {}): ContactRequest => ({
    id: 'r', fromUserId: 'a', fromProfileId: 'pa', toUserId: 'b', toProfileId: 'pb', status: 'pending',
    createdAt: new Date(clock - 49 * H).toISOString(), expiresAt: new Date(clock + 9 * 86400000).toISOString(), pokes: [], ...over,
  });
  const cfg = { pokeWaitHours: 48, pokeMaxPer7Days: 2 };

  it('pure rules: wait, one per request, two per 7 days per person, opt-out, status, sender only', () => {
    const t = now();
    expect(pokeEligibility(base(), 'a', [base()], cfg, true, t)).toEqual({ canPoke: true });
    expect(pokeEligibility(base({ createdAt: new Date(clock - 2 * H).toISOString() }), 'a', [], cfg, true, t).reason).toBe('wait');
    expect(pokeEligibility(base({ pokes: [t.toISOString()] }), 'a', [], cfg, true, t).reason).toBe('used');
    const others = [base({ id: 'x', pokes: [new Date(clock - H).toISOString()] }), base({ id: 'y', pokes: [new Date(clock - 2 * H).toISOString()] })];
    expect(pokeEligibility(base(), 'a', others, cfg, true, t).reason).toBe('limit');
    const old = [base({ id: 'x', pokes: [new Date(clock - 8 * 86400000).toISOString()] }), base({ id: 'y', pokes: [new Date(clock - 9 * 86400000).toISOString()] })];
    expect(pokeEligibility(base(), 'a', old, cfg, true, t).canPoke).toBe(true); // rolling window
    expect(pokeEligibility(base(), 'a', [], cfg, false, t).reason).toBe('optout');
    for (const status of ['accepted', 'declined', 'withdrawn', 'expired', 'blocked'] as const)
      expect(pokeEligibility(base({ status }), 'a', [], cfg, true, t).reason).toBe('status');
    expect(pokeEligibility(base(), 'b', [], cfg, true, t).reason).toBe('not_sender');
  });

  it('backend enforces the wait, one-per-request and never changes the status', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, intro());
    await code(b.pokeRequest(r.id), 'poke_wait');
    advance(48 * H + 1000);
    await b.pokeRequest(r.id);
    await code(b.pokeRequest(r.id), 'poke_used');
    expect((await reqTo(b, BRIDE_PROFILE)).request.status).toBe('pending');
    await as(b, BRIDE);
    const n = (await b.getNotifications()).find((x) => x.type === 'poke')!;
    expect(n.params).toEqual({}); // no names, no numbers
    await code(b.pokeRequest(r.id), 'invalid_state'); // only the sender can poke
  });

  it('respects the recipient’s opt-out and the per-person 7-day limit across requests', async () => {
    const b = make();
    await as(b, BRIDE);
    await b.setAllowReminders(false);
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, intro());
    advance(49 * H);
    await code(b.pokeRequest(r.id), 'poke_optout');
    await as(b, BRIDE);
    await b.setAllowReminders(true);
    await as(b, GROOM);
    await b.pokeRequest(r.id);
    // withdraw + new request + poke → second poke in 7 days OK, third blocked
    await b.withdrawRequest(r.id);
    const r2 = await b.sendRequest(BRIDE_PROFILE, intro());
    advance(49 * H);
    await b.pokeRequest(r2.id);
    await b.withdrawRequest(r2.id);
    const r3 = await b.sendRequest(BRIDE_PROFILE, intro());
    advance(49 * H);
    await code(b.pokeRequest(r3.id), 'poke_limit');
  });

  it('seeded demo: the groom can poke his 3-day-old unanswered request', async () => {
    const b = make();
    await as(b, GROOM);
    expect((await reqTo(b, 'p_6')).poke).toEqual({ canPoke: true });
  });
});

describe('9: expiry', () => {
  it('pending requests expire after the configured days; expired cannot be accepted; a new one can be sent', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminUpdatePricing({ ...(await b.getPricing()), requestExpiryDays: 3 });
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    advance(3 * 86400000 + 1000);
    expect((await reqTo(b, BRIDE_PROFILE)).request.status).toBe('expired');
    expect((await reqTo(b, BRIDE_PROFILE)).myOffer?.status).toBe('expired');
    expect((await b.getNotifications()).some((n) => n.type === 'request_expired')).toBe(true);
    await as(b, BRIDE);
    await code(b.respondToRequest(r.id, 'accepted'), 'expired');
    expect((await b.getProfile(GROOM_PROFILE)).contact).toBeUndefined();
    await as(b, GROOM);
    await expect(b.sendRequest(BRIDE_PROFILE, intro())).resolves.toMatchObject({ status: 'pending' });
  });
});

describe('10–11: notifications, analytics, audit and admin visibility', () => {
  it('no notification ever contains a phone number', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer());
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    const o = await b.offerPhone(r.id, true, 'n1');
    await as(b, GROOM);
    await b.respondToPhoneOffer(o.id, 'accepted');
    const groomNotes = JSON.stringify(await b.getNotifications());
    await as(b, BRIDE);
    const brideNotes = JSON.stringify(await b.getNotifications());
    for (const json of [groomNotes, brideNotes]) {
      expect(json).not.toContain(GROOM);
      expect(json).not.toContain(BRIDE);
    }
    expect(brideNotes).toContain('"offered":"1"');
  });

  it('records sharing in the audit log, tracks analytics without numbers, and admins see no raw numbers', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.sendRequest(BRIDE_PROFILE, offer('hello'));
    await as(b, BRIDE);
    await b.respondToRequest(r.id, 'accepted');
    await as(b, DEMO_ADMIN_PHONE);
    const audit = await b.adminAuditLog();
    expect(audit.map((e) => e.action)).toEqual(expect.arrayContaining(['phone.offered', 'phone.revealed']));
    const stats = await b.adminStats();
    expect(stats.connections.phoneShared).toBeGreaterThanOrEqual(2);
    expect(stats.connections.acceptanceRate).toBeGreaterThan(0);
    const rows = JSON.stringify(await b.adminListRequests());
    expect(rows).not.toContain(GROOM);
    expect(rows).not.toContain(BRIDE);
    // @ts-expect-error — test-only peek at persisted analytics
    const db = JSON.parse(await b.storage.getItem('hr.demo.db'));
    const events = JSON.stringify(db.analytics);
    expect(events).not.toContain(GROOM);
    expect(events).not.toContain('hello');
    expect(db.analytics.filter((e: { name: string }) => e.name === 'interest_initiated')).toHaveLength(1);
  });

  it('admins configure expiry and reminder limits (validated)', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await code(b.adminUpdatePricing({ ...cfg, pokeWaitHours: 0 }), 'validation');
    const saved = await b.adminUpdatePricing({ ...cfg, requestExpiryDays: 21, pokeWaitHours: 24, pokeMaxPer7Days: 1 });
    expect(saved).toMatchObject({ requestExpiryDays: 21, pokeWaitHours: 24, pokeMaxPer7Days: 1 });
  });
});
