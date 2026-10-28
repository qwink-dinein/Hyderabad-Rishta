import { buildSeed, DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_SUBADMIN_PHONE, DEMO_USER_PHONE } from '@/data/seed';
import { adminAlertText } from '@/domain/adminAlerts';
import { declinedRecently, relationBadge } from '@/domain/connections';
import { EMPTY_FILTERS } from '@/domain/search';
import type { Biodata } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/** Relation badges on cards, sequential profile IDs, admin search / member console and the admin bell. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);
const make = () => new DemoBackend({ storage: memoryKV(), now });
const BRIDE = '9000000102'; // u_2 / p_2

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
const bio = (name: string): Biodata => {
  const b = JSON.parse(JSON.stringify(buildSeed().profiles[0].biodata)) as Biodata;
  b.basic.fullName = name;
  return b;
};
let k = 0;
const intro = () => ({ offerPhone: false, consent: false, idempotencyKey: `ac${++k}` });
const alerts = async (b: DemoBackend) => (await b.getNotifications()).filter((n) => n.type === 'admin_alert');

describe('relation badges (no blind re-sends)', () => {
  it('cards show connected / sent / received from the seed data', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    expect((await b.getProfile('p_4')).relation).toMatchObject({ status: 'accepted', direction: 'received' });
    expect((await b.getProfile('p_6')).relation).toMatchObject({ status: 'pending', direction: 'sent' });
    expect((await b.getProfile('p_0')).relation).toMatchObject({ status: 'pending', direction: 'received' });
    const page = await b.searchProfiles(EMPTY_FILTERS, 0, 50);
    const p4 = page.items.find((p) => p.id === 'p_4');
    if (p4) expect(relationBadge(p4.relation)?.key).toBe('connected');
    expect(page.items.find((p) => p.id === 'p_6')?.relation?.status).toBe('pending');
  });

  it('a decline shows on both sides and blocks re-sending during the cool-down', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    await b.sendRequest('p_2', intro());
    await as(b, BRIDE);
    const r = (await b.getRequestStatusWith('p_1'))!;
    await b.respondToRequest(r.request.id, 'declined');
    expect(relationBadge((await b.getProfile('p_1')).relation)?.key).toBe('youDeclined');
    await as(b, DEMO_USER_PHONE);
    const rel = (await b.getProfile('p_2')).relation;
    expect(relationBadge(rel)?.key).toBe('theyDeclined');
    expect(declinedRecently(rel, now())).toBe(true);
    await code(b.sendRequest('p_2', intro()), 'declined_recently');
    expect(declinedRecently(rel, new Date(clock + 31 * 86400000))).toBe(false);
  });

  it('no relation → no badge; relation never leaks a phone number', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    const p = await b.getProfile('p_8');
    expect(p.relation).toBeUndefined();
    expect(relationBadge(undefined)).toBeNull();
    expect(JSON.stringify(await b.getProfile('p_6'))).not.toContain('9000000106');
  });
});

describe('profile IDs', () => {
  it('seed profiles get HR-10001… and new profiles take the next number, never reused', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    expect((await b.getMyProfile())?.code).toBe('HR-10002');
    expect((await b.getProfile('p_2')).code).toBe('HR-10003');
    await as(b, '9333000001');
    const p1 = await b.saveDraft(bio('First New'), 1);
    expect(p1.code).toBe(`HR-${10001 + buildSeed().profiles.length}`);
    await b.saveDraft(bio('First New Edited'), 2);
    expect((await b.getMyProfile())?.code).toBe(p1.code); // edits keep the ID
    await b.deleteAccount();
    await as(b, '9333000002');
    const p2 = await b.saveDraft(bio('Second New'), 1);
    expect(Number(p2.code.slice(3))).toBe(Number(p1.code.slice(3)) + 1);
  });
});

describe('admin search & member console', () => {
  it('finds members by profile ID, name, city and phone digits; phone look-ups are audited and masked', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    expect((await b.adminSearch('HR-10002'))[0]).toMatchObject({ userId: 'u_demo', code: 'HR-10002' });
    expect((await b.adminSearch('hr10002'))[0]?.code).toBe('HR-10002');
    const seedName = buildSeed().profiles[2].biodata.basic.fullName.split(' ')[0];
    expect((await b.adminSearch(seedName)).some((m) => m.code === 'HR-10003')).toBe(true);
    const byPhone = await b.adminSearch('+91 90000 00102');
    expect(byPhone.map((m) => m.userId)).toEqual(['u_2']);
    expect(JSON.stringify(byPhone)).not.toContain('9000000102');
    expect((await b.adminAuditLog()).some((a) => a.action === 'admin.search_phone')).toBe(true);
    expect(await b.adminSearch('x')).toEqual([]);
  });

  it('member page gathers profile, interests, reports and orders with codes', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    await b.reportProfile('p_2', 'fake');
    await as(b, DEMO_ADMIN_PHONE);
    const m = await b.adminGetMember('u_demo');
    expect(m.member.code).toBe('HR-10002');
    expect(m.requests.length).toBeGreaterThanOrEqual(3);
    expect(m.requests.every((r) => r.fromCode.startsWith('HR-') && r.toCode.startsWith('HR-'))).toBe(true);
    expect(m.reportsBy).toHaveLength(1);
    expect(JSON.stringify(m)).not.toContain(DEMO_USER_PHONE);
    const bride = await b.adminGetMember('u_2');
    expect(bride.reportsAbout).toHaveLength(1);
    await code(b.adminGetMember('nope'), 'not_found');
  });

  it('is admin-only (sub-admins allowed, members refused)', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    await code(b.adminSearch('HR-10002'), 'forbidden');
    await code(b.adminGetMember('u_2'), 'forbidden');
    await as(b, DEMO_SUBADMIN_PHONE);
    expect((await b.adminSearch('HR-10002')).length).toBe(1);
  });

  it('admin lists carry profile codes', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    expect((await b.adminListRequests()).every((r) => r.fromCode && r.toCode)).toBe(true);
    expect((await b.adminListUsers()).find((u) => u.id === 'u_demo')?.profileCode).toBe('HR-10002');
  });
});

describe('admin bell', () => {
  it('reports, approvals, payments and deletions alert every active admin — without phone numbers', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await b.adminUpdatePricing({ ...cfg, requireApproval: true, publication: { ...cfg.publication, bride: { mode: 'paid', amount: 299 } } });

    await as(b, DEMO_USER_PHONE);
    await b.reportProfile('p_2', 'harassment');

    await as(b, '9444000001');
    const draft = await b.saveDraft(bio('Paying Bride'), 7);
    const { order } = await b.submitForPublication();
    await b.completePayment(order!.id, 'failure');
    const retry = await b.submitForPublication();
    await b.completePayment(retry.order!.id, 'success'); // → pending (approval on)
    await b.deleteAccount();

    for (const phone of [DEMO_ADMIN_PHONE, DEMO_SUBADMIN_PHONE]) {
      await as(b, phone);
      const list = await alerts(b);
      const kinds = list.map((n) => n.params.kind);
      expect(kinds).toEqual(expect.arrayContaining(['report', 'payment', 'pending_profile', 'account_deleted']));
      expect(list.find((n) => n.params.kind === 'report')?.params.code).toBe('HR-10003');
      expect(list.filter((n) => n.params.kind === 'payment').map((n) => n.params.status).sort()).toEqual(['failed', 'paid']);
      expect(list.find((n) => n.params.kind === 'pending_profile')?.params.code).toBe(draft.code);
      expect(JSON.stringify(list)).not.toMatch(/9444000001|9000000001/);
      for (const n of list) expect(adminAlertText(n).title).not.toBe('Admin alert');
    }

    // Members never receive admin alerts
    await as(b, DEMO_USER_PHONE);
    expect(await alerts(b)).toHaveLength(0);
  });

  it('security changes land in the bell', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    await b.masterAddSubAdmin('+91', '9000000105');
    await as(b, DEMO_SUBADMIN_PHONE);
    const sec = (await alerts(b)).find((n) => n.params.kind === 'security');
    expect(sec?.params.event).toBe('admin_added');
    expect(sec?.deepLink).toBe('/admin/team');
    expect(adminAlertText(sec!).title).toBe('A sub-admin was added');
    expect(adminAlertText({ params: { kind: 'security', event: 'recovery_started' } })).toMatchObject({ urgent: true });
  });
});
