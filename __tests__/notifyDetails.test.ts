import { DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { pendingReceivedCount } from '@/domain/connections';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/** Owner request 2026-10-29: interest state shows at once, Requests badge counts, clear notifications. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const make = () => new DemoBackend({ storage: memoryKV(), now });
async function as(b: DemoBackend, phone: string) {
  await b.logout();
  clock += RESEND_COOLDOWN_MS + 1;
  await b.requestOtp('+91', phone);
  await b.verifyOtp('+91', phone, DEMO_OTP);
}

describe('interest sent shows at once and cannot be duplicated', () => {
  it('after sending, the pair status and the card relation both say "sent"; a second send is refused', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    await b.sendRequest('p_12', { message: 'Salaam', offerPhone: false, consent: false, idempotencyKey: 'k1' });
    const st = await b.getRequestStatusWith('p_12');
    expect(st).toMatchObject({ direction: 'sent', request: { status: 'pending' } });
    expect((await b.getProfile('p_12')).relation).toMatchObject({ status: 'pending', direction: 'sent' });
    // Same key (double tap / retry) → same request; a new key → refused as a duplicate.
    expect((await b.sendRequest('p_12', { offerPhone: false, consent: false, idempotencyKey: 'k1' })).id).toBe(st!.request.id);
    const e = await b.sendRequest('p_12', { offerPhone: false, consent: false, idempotencyKey: 'k2' }).then(() => null, (x: unknown) => x);
    expect((e as AppError).code).toBe('duplicate');
  });
});

describe('Requests tab badge', () => {
  it('counts only received interests still waiting for an answer', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    const before = pendingReceivedCount(await b.getRequests(), now());
    expect(before).toBeGreaterThan(0);
    await b.respondToRequest('r_1', 'declined');
    expect(pendingReceivedCount(await b.getRequests(), now())).toBe(before - 1);
    clock += 60 * 86400000; // everything left has expired
    expect(pendingReceivedCount(await b.getRequests(), now())).toBe(0);
  });
});

describe('notifications say what happened', () => {
  it('accepting an interest that came with a number tells the sender their number is now visible', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    await b.respondToRequest('r_1', 'accepted'); // r_1 carried u_0's number offer
    await as(b, '9000000100'); // u_0
    const n = (await b.getNotifications()).find((x) => x.type === 'request_accepted')!;
    expect(n.params.numberShared).toBe('1');
  });
  it('a paid boost produces both "payment confirmed" and "boost active"', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    const { order } = await b.startBoost('d7');
    await b.completePayment(order.id, 'success');
    const types = (await b.getNotifications()).map((x) => (x.type === 'payment' ? `payment_${x.params.status}` : x.type));
    expect(types).toEqual(expect.arrayContaining(['payment_paid', 'boost_started']));
  });
});
