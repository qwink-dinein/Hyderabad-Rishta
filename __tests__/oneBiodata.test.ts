import { DEMO_ADMIN_PHONE, DEMO_OTP } from '@/data/seed';
import { normalizePhone } from '@/domain/security';
import { emptyBiodata } from '@/domain/validation';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS, TRASH_RETENTION_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/** Owner request 2026-10-28: one mobile number = one biodata; a new one only after deleting the account. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);
const make = () => new DemoBackend({ storage: memoryKV(), now });

async function as(b: DemoBackend, phone: string, cc = '+91') {
  await b.logout();
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp(cc, phone);
  return b.verifyOtp(cc, phone, DEMO_OTP);
}
async function code(p: Promise<unknown>, c: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(c);
}
const draft = (name: string) => {
  const b = emptyBiodata();
  b.basic.fullName = name;
  b.basic.lookingFor = 'bride';
  return b;
};

describe('normalizePhone: every spelling of a number is the same number', () => {
  it.each([
    ['+91', '9555500001'],
    ['+91', '09555500001'],
    ['+091', '9555500001'],
    ['91', '9555500001'],
    ['+91', '95555 00001'],
    ['+91', '95555-00001'],
    ['+91', '919555500001'],
    ['+91', '+919555500001'],
  ])('%s %s → +91 9555500001', (cc, p) => expect(normalizePhone(cc, p)).toEqual({ countryCode: '+91', phone: '9555500001' }));

  it.each([
    ['+91', '1234567890'], // Indian mobiles start 6–9
    ['+91', '95555'],
    ['+91', '95555000011'],
    ['+91', '+449555500001'],
    ['+0', '9555500001'],
    ['+91', 'abc'],
    ['+1', '2025550123456789'],
  ])('%s %s is rejected', (cc, p) => expect(normalizePhone(cc, p)).toBeNull());
});

describe('One number → one account → one biodata', () => {
  it('the same number typed differently logs into the SAME account and biodata', async () => {
    const b = make();
    const first = await as(b, '9555500001');
    await b.saveDraft(draft('Asma Test'), 1);
    for (const [cc, p] of [['+091', '9555500001'], ['+91', '09555500001'], ['+91', '919555500001'], ['91', '95555 00001']]) {
      const again = await as(b, p, cc);
      expect(again.user.id).toBe(first.user.id);
      expect(again.isNew).toBe(false);
      expect((await b.getMyProfile())!.biodata.basic.fullName).toBe('Asma Test');
    }
  });

  it('saving again edits the one biodata — it never creates a second', async () => {
    const b = make();
    await as(b, '9555500002');
    const a = await b.saveDraft(draft('One'), 1);
    const c = await b.saveDraft(draft('One edited'), 2);
    const [x, y] = await Promise.all([b.saveDraft(draft('Race A'), 2), b.saveDraft(draft('Race B'), 2)]);
    expect(new Set([a.id, c.id, x.id, y.id]).size).toBe(1);
    expect(a.code).toBe(y.code);
  });

  it('a biodata removed by the team cannot be replaced — not in Trash, not after purge', async () => {
    const b = make();
    await as(b, '9555500003');
    const p = await b.saveDraft(draft('Removed One'), 1);
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminDeleteProfile(p.id, 'fake profile');
    await as(b, '9555500003');
    expect(await b.getMyProfile()).toBeNull();
    expect((await b.getSession())!.profileRemovedAt).toBeTruthy();
    await code(b.saveDraft(draft('Fresh Start'), 1), 'profile_removed');
    // Typing the number differently doesn't help.
    await as(b, '09555500003');
    await code(b.saveDraft(draft('Sneaky Start'), 1), 'profile_removed');
    // Purged from Trash after 30 days: still no fresh biodata on this number.
    advance(TRASH_RETENTION_MS + 86400000);
    await as(b, '9555500003');
    await code(b.saveDraft(draft('Later Start'), 1), 'profile_removed');
  });

  it('a master restore gives back the original biodata (and still only one)', async () => {
    const b = make();
    await as(b, '9555500004');
    const p = await b.saveDraft(draft('Restored One'), 1);
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminDeleteProfile(p.id, 'mistake');
    await b.masterRestore('profile', p.id);
    await as(b, '9555500004');
    expect((await b.getMyProfile())!.id).toBe(p.id);
    expect((await b.getSession())!.profileRemovedAt).toBeUndefined();
  });

  it('only deleting the account frees the number for a brand-new biodata', async () => {
    const b = make();
    await as(b, '9555500005');
    const p = await b.saveDraft(draft('Old Me'), 1);
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminDeleteProfile(p.id, 'fake profile');
    await as(b, '9555500005');
    await code(b.saveDraft(draft('Blocked'), 1), 'profile_removed');
    await b.deleteAccount();
    const fresh = await as(b, '9555500005');
    expect(fresh.isNew).toBe(true);
    const np = await b.saveDraft(draft('New Me'), 1);
    expect(np.id).not.toBe(p.id);
    expect(np.code).not.toBe(p.code); // HR- numbers are never reused
  });

  it('an account removed by an admin cannot sign in again with any spelling of the number', async () => {
    const b = make();
    const u = await as(b, '9555500006');
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminDeleteUser(u.user.id, 'abuse');
    await b.logout();
    advance(RESEND_COOLDOWN_MS + 1);
    await b.requestOtp('+91', '09555500006');
    await code(b.verifyOtp('+91', '09555500006', DEMO_OTP), 'account_removed');
  });

  it('admins cannot add the same number twice by typing it differently', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    await b.masterAddSubAdmin('+91', '9555500007');
    await code(b.masterAddSubAdmin('+091', '09555500007'), 'duplicate');
  });
});
