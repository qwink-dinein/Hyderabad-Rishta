import { DEMO_ADMIN_PHONE, DEMO_OTP } from '@/data/seed';
import { adminAlertText } from '@/domain/adminAlerts';
import { emptyBiodata } from '@/domain/validation';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS, TRASH_RETENTION_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';
import { purgeExpired, type PurgeDeps } from '../supabase/functions/purge-deleted-accounts/purge';

/** Owner decision 2026-11-02: admins see who deleted their account and the full profile, for 30 days only. */
let clock = new Date('2026-11-02T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);
const make = () => new DemoBackend({ storage: memoryKV(), now });
async function as(b: DemoBackend, phone: string) {
  await b.logout();
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp('+91', phone);
  return b.verifyOtp('+91', phone, DEMO_OTP);
}

describe('deleted accounts: admin-only copy for 30 days', () => {
  it('admins see who it was and the full profile; members cannot; gone after 30 days', async () => {
    const b = make();
    await as(b, '9555600001');
    const bd = emptyBiodata();
    bd.basic.fullName = 'Ayesha Khan';
    bd.basic.lookingFor = 'groom';
    bd.basic.aboutMe = 'Teacher from Tolichowki';
    const p = await b.saveDraft(bd, 1);
    await b.deleteAccount();

    // A member can never read the copies.
    await as(b, '9555600002');
    await expect(b.adminListDeletedAccounts()).rejects.toBeInstanceOf(AppError);

    await as(b, DEMO_ADMIN_PHONE);
    const list = await b.adminListDeletedAccounts();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ code: p.code, fullName: 'Ayesha Khan', profileType: 'bride' });
    expect(list[0].phoneMasked).not.toContain('9555600001'); // masked, as everywhere in the console
    expect(list[0]).not.toHaveProperty('profile'); // the list carries no biodata
    const d = await b.adminGetDeletedAccount(list[0].id);
    expect(d.profile?.biodata.basic.aboutMe).toBe('Teacher from Tolichowki');
    expect(new Date(d.purgeAt).getTime() - new Date(d.deletedAt).getTime()).toBe(TRASH_RETENTION_MS);
    expect((await b.adminAuditLog()).some((a) => a.action === 'deleted_account.viewed')).toBe(true);

    // The admin alert says who, and opens the copy.
    const alerts = await b.getNotifications();
    const alert = alerts.find((n) => n.params.kind === 'account_deleted')!;
    expect(adminAlertText(alert).title).toBe(`Ayesha Khan (${p.code}) deleted their account`);
    expect(alert.deepLink).toBe(`/admin/deleted/${list[0].id}`);

    // After 30 days it is erased.
    advance(TRASH_RETENTION_MS + 60_000);
    await as(b, DEMO_ADMIN_PHONE);
    expect(await b.adminListDeletedAccounts()).toHaveLength(0);
    await expect(b.adminGetDeletedAccount(list[0].id)).rejects.toBeInstanceOf(AppError);
  });
});

describe('purge-deleted-accounts job', () => {
  const fake = (removeOk: (paths: string[]) => boolean) => {
    const finished: string[][] = [];
    const removed: string[][] = [];
    const deps: PurgeDeps = {
      due: async () => [
        { id: 'a', photo_paths: ['11111111-1111-1111-1111-111111111111/p1.jpg', '../../etc/passwd'] },
        { id: 'b', photo_paths: [] },
        { id: 'c', photo_paths: ['22222222-2222-2222-2222-222222222222/p2.webp'] },
      ],
      removePhotos: async (p) => (removed.push(p), removeOk(p)),
      finish: async (ids) => (finished.push(ids), ids.length),
      log: () => undefined,
    };
    return { deps, finished, removed };
  };
  it('erases photos first, then the copies; only well-formed photo paths are ever deleted', async () => {
    const f = fake(() => true);
    expect(await purgeExpired(f.deps)).toEqual({ erased: 3, retry: 0 });
    expect(f.removed).toEqual([['11111111-1111-1111-1111-111111111111/p1.jpg'], ['22222222-2222-2222-2222-222222222222/p2.webp']]);
    expect(f.finished).toEqual([['a', 'b', 'c']]);
  });
  it('a copy whose photos could not be removed is kept for the next run (no orphaned photos)', async () => {
    const f = fake((p) => !p[0].endsWith('.webp'));
    expect(await purgeExpired(f.deps)).toEqual({ erased: 2, retry: 1 });
    expect(f.finished).toEqual([['a', 'b']]);
  });
});
