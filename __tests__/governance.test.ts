import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_SUBADMIN_PHONE, DEMO_USER_PHONE, buildSeed } from '@/data/seed';
import { EMPTY_FILTERS } from '@/domain/search';
import type { Biodata } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RECOVERY_DELAY_MS, RESEND_COOLDOWN_MS, TRASH_RETENTION_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/**
 * Admin governance: master vs sub-admin powers, single-master invariant, Trash, suspension,
 * and lost-phone recovery. Each test tries to break a rule, not just use it.
 */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);
const make = () => new DemoBackend({ storage: memoryKV(), now });

async function otp(b: DemoBackend, phone: string, cc = '+91') {
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp(cc, phone);
}
async function login(b: DemoBackend, phone: string) {
  await otp(b, phone);
  return b.verifyOtp('+91', phone, DEMO_OTP);
}
async function as(b: DemoBackend, phone: string) {
  await b.logout();
  await login(b, phone);
}
async function code(p: Promise<unknown>, c: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(c));
}
const masters = async (b: DemoBackend) => (await b.masterListAdmins()).filter((m) => m.role === 'master');

describe('roles & powers', () => {
  it('sub-admins can moderate everything', async () => {
    const b = make();
    await login(b, DEMO_SUBADMIN_PHONE);
    await b.adminSetRequireApproval(true);
    await b.adminSetProfileStatus('p_2', 'paused');
    await b.adminSetProfileStatus('p_2', 'published');
    await b.adminRemovePhoto('p_2', 'missing').catch(() => undefined);
    await b.adminDeleteRequest('r_1');
    await b.adminDeleteProfile('p_4', 'test');
    await b.adminDeleteUser('u_6', 'test');
    expect((await b.adminListTrash()).length).toBe(2);
    const a = await b.adminSaveAnnouncement({ title: { en: 't' }, body: { en: 'b' }, segment: 'all' });
    await b.adminDeleteAnnouncement(a.id);
  });

  it('sub-admins cannot touch the team, recovery, restores, the master or other admins', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await b.masterAddSubAdmin('+91', '9111100000');
    await as(b, DEMO_SUBADMIN_PHONE);
    await code(b.masterAddSubAdmin('+91', '9222200000'), 'forbidden');
    await code(b.masterRemoveSubAdmin('u_sub'), 'forbidden');
    await code(b.masterGenerateRecoveryCodes(DEMO_OTP), 'forbidden');
    await code(b.masterSetBackupPhone('+91', '9333300000', DEMO_OTP), 'forbidden');
    await code(b.masterCancelRecovery(), 'forbidden');
    await b.adminDeleteProfile('p_2', 'x');
    await code(b.masterRestore('profile', 'p_2'), 'forbidden');
    await code(b.masterPurge('profile', 'p_2'), 'forbidden');
    await code(b.adminDeleteUser('u_admin', 'x'), 'forbidden');
    await code(b.adminSetUserDeactivated('u_admin', true), 'forbidden');
    const other = (await b.masterListAdmins()).find((m) => m.role === 'admin' && m.id !== 'u_sub')!;
    await code(b.adminDeleteUser(other.id, 'x'), 'forbidden');
    await code(b.adminSetUserDeactivated(other.id, true), 'forbidden');
    await code(b.adminDeleteUser('u_sub', 'x'), 'forbidden'); // not even themselves
  });

  it('members cannot call any admin or master operation', async () => {
    const b = make();
    await login(b, DEMO_USER_PHONE);
    await code(b.adminSetRequireApproval(false), 'forbidden');
    await code(b.adminApproveAllPending(), 'forbidden');
    await code(b.adminDeleteProfile('p_2', 'x'), 'forbidden');
    await code(b.adminListTrash(), 'forbidden');
    await code(b.masterListAdmins(), 'forbidden');
    await code(b.masterSecurityStatus(), 'forbidden');
  });

  it('removing a sub-admin revokes access on the very next call', async () => {
    const b = make();
    await login(b, DEMO_SUBADMIN_PHONE);
    await b.adminStats();
    // master demotes in the "background" (same DB)
    await as(b, DEMO_ADMIN_PHONE);
    await b.masterRemoveSubAdmin('u_sub');
    await as(b, DEMO_SUBADMIN_PHONE);
    await code(b.adminStats(), 'forbidden');
  });
});

describe('exactly one master', () => {
  it('transfer needs a fresh OTP and swaps roles atomically', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await code(b.masterTransfer('u_sub', DEMO_OTP), 'otp_expired'); // no step-up code requested
    await otp(b, DEMO_ADMIN_PHONE);
    await code(b.masterTransfer('u_2', DEMO_OTP), 'invalid_state'); // target must be a sub-admin
    await otp(b, DEMO_ADMIN_PHONE);
    await b.masterTransfer('u_sub', DEMO_OTP);
    await code(b.masterAddSubAdmin('+91', '9444400000'), 'forbidden'); // old master is now a sub-admin
    const ms = await masters(b);
    expect(ms).toHaveLength(1);
    expect(ms[0].id).toBe('u_sub');
  });

  it('the master cannot delete, deactivate or demote themselves', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await code(b.deleteAccount(), 'forbidden');
    await code(b.deactivateAccount(), 'forbidden');
    await code(b.adminDeleteUser('u_admin', 'x'), 'forbidden');
    await code(b.masterAddSubAdmin('+91', DEMO_ADMIN_PHONE), 'invalid_state');
  });

  it('caps sub-admins and rejects duplicates', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await code(b.masterAddSubAdmin('+91', DEMO_SUBADMIN_PHONE), 'duplicate');
    for (let i = 0; i < 9; i++) await b.masterAddSubAdmin('+91', `95555000${i}0`);
    await code(b.masterAddSubAdmin('+91', '9666600000'), 'rate_limited');
  });
});

describe('approval mode (one click)', () => {
  const bio = (): Biodata => ({ ...JSON.parse(JSON.stringify(buildSeed().profiles[0].biodata)), basic: { ...buildSeed().profiles[0].biodata.basic, fullName: 'Approval Test' } });

  it('ON → submissions wait; OFF → publish directly; approve-all clears the queue', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    expect((await b.adminSetRequireApproval(true)).requireApproval).toBe(true);
    await as(b, '9700000001');
    await b.saveDraft(bio(), 7);
    expect((await b.submitForPublication()).profile.status).toBe('pending');
    await as(b, DEMO_ADMIN_PHONE);
    const r = await b.adminSetRequireApproval(false);
    expect(r.pending).toBeGreaterThanOrEqual(2); // seed p_30 + ours
    await as(b, '9700000002');
    await b.saveDraft(bio(), 7);
    expect((await b.submitForPublication()).profile.status).toBe('published');
    await as(b, DEMO_ADMIN_PHONE);
    expect(await b.adminApproveAllPending()).toBe(r.pending);
    expect((await b.adminStats()).profiles.pending).toBe(0);
    expect((await b.adminAuditLog()).some((e) => e.action === 'settings.approval_mode')).toBe(true);
  });
});

describe('trash, deletion & suspension', () => {
  it('deleted profiles vanish everywhere, then restore exactly', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await b.adminDeleteProfile('p_2', 'fake');
    await as(b, DEMO_USER_PHONE);
    expect((await b.searchProfiles(EMPTY_FILTERS, 0, 100)).items.map((p) => p.id)).not.toContain('p_2');
    await code(b.getProfile('p_2'), 'not_found');
    await as(b, DEMO_ADMIN_PHONE);
    await b.masterRestore('profile', 'p_2');
    await as(b, DEMO_USER_PHONE);
    expect((await b.getProfile('p_2')).id).toBe('p_2');
  });

  it('deleting a user ends their session and blocks login; restore brings them back', async () => {
    const b = make();
    await login(b, DEMO_USER_PHONE);
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminDeleteUser('u_demo', 'spam');
    await b.logout();
    await otp(b, DEMO_USER_PHONE);
    await code(b.verifyOtp('+91', DEMO_USER_PHONE, DEMO_OTP), 'account_removed');
    await login(b, DEMO_ADMIN_PHONE);
    await b.masterRestore('user', 'u_demo');
    await as(b, DEMO_USER_PHONE);
    expect((await b.getMyProfile())?.id).toBe('p_1');
  });

  it('purges permanently, automatically after 30 days', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await b.adminDeleteProfile('p_2', 'x');
    await b.adminDeleteUser('u_8', 'x');
    await b.masterPurge('profile', 'p_2');
    expect((await b.adminListTrash()).map((t) => t.id)).toEqual(['u_8']);
    advance(TRASH_RETENTION_MS + 1000);
    expect(await b.adminListTrash()).toEqual([]);
    expect((await b.adminListUsers()).some((u) => u.id === 'u_8')).toBe(false);
  });

  it('admin suspension survives re-login; self-deactivation does not', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await b.adminSetUserDeactivated('u_2', true);
    await b.logout();
    await otp(b, '9000000102');
    await code(b.verifyOtp('+91', '9000000102', DEMO_OTP), 'account_suspended');
    await login(b, DEMO_USER_PHONE);
    await b.deactivateAccount();
    await login(b, DEMO_USER_PHONE); // reactivates
    expect((await b.getSession())?.id).toBe('u_demo');
  });

  it('orders can be cancelled but never deleted', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    expect('adminDeleteOrder' in b).toBe(false);
    expect('adminDeleteAudit' in b).toBe(false);
  });
});

describe('master lost-phone recovery', () => {
  async function setup() {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await otp(b, DEMO_ADMIN_PHONE);
    const codes = await b.masterGenerateRecoveryCodes(DEMO_OTP);
    await otp(b, '9888800000');
    await b.masterSetBackupPhone('+91', '9888800000', DEMO_OTP);
    await b.logout();
    return { b, codes };
  }

  it('generating codes requires a fresh OTP and stores no plaintext', async () => {
    const b = make();
    await login(b, DEMO_ADMIN_PHONE);
    await code(b.masterGenerateRecoveryCodes(DEMO_OTP), 'otp_expired');
    await otp(b, DEMO_ADMIN_PHONE);
    const codes = await b.masterGenerateRecoveryCodes(DEMO_OTP);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    const stored = await memoryProbe(b);
    for (const c of codes) expect(stored).not.toContain(c);
    expect((await b.masterSecurityStatus()).codesRemaining).toBe(10);
  });

  it('backup phone + code → master immediately; old phone demoted; codes reset', async () => {
    const { b, codes } = await setup();
    await otp(b, '9888800000');
    expect(await b.recoverMaster('+91', '9888800000', DEMO_OTP, codes[0].toLowerCase())).toEqual({ status: 'completed' });
    await login(b, '9888800000');
    expect((await masters(b))[0].phoneMasked).toContain('0000');
    expect((await masters(b))).toHaveLength(1);
    expect((await b.masterSecurityStatus()).codesRemaining).toBe(0);
    await as(b, DEMO_ADMIN_PHONE);
    await code(b.adminStats(), 'forbidden'); // old master is now a regular member
  });

  it('a new phone waits 72 h and the real master can cancel it', async () => {
    const { b, codes } = await setup();
    await otp(b, '9777700000');
    const r = await b.recoverMaster('+91', '9777700000', DEMO_OTP, codes[1]);
    expect(r.status).toBe('pending');
    await login(b, DEMO_ADMIN_PHONE);
    expect((await b.masterSecurityStatus()).pendingRecovery).toBeDefined();
    await b.masterCancelRecovery();
    advance(RECOVERY_DELAY_MS + 1000);
    expect((await masters(b))[0].id).toBe('u_admin');
  });

  it('a used code never works again, and only one recovery can be in flight', async () => {
    const { b, codes } = await setup();
    await otp(b, '9777700000');
    await b.recoverMaster('+91', '9777700000', DEMO_OTP, codes[4]);
    await otp(b, '9777700001');
    await code(b.recoverMaster('+91', '9777700001', DEMO_OTP, codes[5]), 'invalid_state'); // in flight
    await login(b, DEMO_ADMIN_PHONE);
    await b.masterCancelRecovery();
    expect((await b.masterSecurityStatus()).codesRemaining).toBe(9);
    await b.logout();
    await otp(b, '9777700002');
    await code(b.recoverMaster('+91', '9777700002', DEMO_OTP, codes[4]), 'invalid_recovery_code'); // reused
  });

  it('an uncancelled new-phone recovery completes after the delay', async () => {
    const { b, codes } = await setup();
    await otp(b, '9777700000');
    await b.recoverMaster('+91', '9777700000', DEMO_OTP, codes[2]);
    advance(RECOVERY_DELAY_MS + 1000);
    await login(b, '9777700000');
    expect((await masters(b))).toHaveLength(1);
    expect((await b.getSession())?.role).toBe('master');
  });

  it('rejects wrong / reused codes, needs an OTP, and rate-limits guessing', async () => {
    const { b, codes } = await setup();
    await code(b.recoverMaster('+91', '9888800000', DEMO_OTP, codes[0]), 'otp_expired'); // no OTP for this phone
    await otp(b, '9888800000');
    await b.recoverMaster('+91', '9888800000', DEMO_OTP, codes[0]);
    // codes were reset after recovery → even an unused old code is now invalid
    await otp(b, '9888800001');
    await code(b.recoverMaster('+91', '9888800001', DEMO_OTP, codes[3]), 'invalid_recovery_code');
    for (let i = 0; i < 4; i++) {
      await otp(b, `98888001${i}0`);
      await code(b.recoverMaster('+91', `98888001${i}0`, DEMO_OTP, 'AAAA-AAAA'), 'invalid_recovery_code');
    }
    await otp(b, '9888800199');
    await code(b.recoverMaster('+91', '9888800199', DEMO_OTP, 'AAAA-AAAA'), 'rate_limited');
  });

  it('every governance action is audited', async () => {
    const { b, codes } = await setup();
    await otp(b, '9888800000');
    await b.recoverMaster('+91', '9888800000', DEMO_OTP, codes[0]);
    await login(b, '9888800000');
    const actions = (await b.adminAuditLog()).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['master.recovery_codes_generated', 'master.backup_phone_set', 'master.recovered']));
  });
});

/** Reads the persisted demo DB text to prove codes are never stored in plaintext. */
async function memoryProbe(b: DemoBackend): Promise<string> {
  // @ts-expect-error — test-only peek at private storage
  return (await b.storage.getItem('hr.demo.db')) as string;
}
