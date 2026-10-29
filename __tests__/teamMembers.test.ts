import { buildSeed, DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_SUBADMIN_PHONE, DEMO_USER_PHONE } from '@/data/seed';
import { EMPTY_FILTERS } from '@/domain/search';
import type { Biodata } from '@/domain/types';
import { emptyBiodata } from '@/domain/validation';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/**
 * Owner request 2026-10-29: admins and sub-admins add members for any phone number without OTP;
 * when that number's owner later logs in (with OTP) they get that account and that biodata.
 */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const make = () => new DemoBackend({ storage: memoryKV(), now });
async function as(b: DemoBackend, phone: string) {
  await b.logout();
  clock += RESEND_COOLDOWN_MS + 1;
  await b.requestOtp('+91', phone);
  return b.verifyOtp('+91', phone, DEMO_OTP);
}
async function code(p: Promise<unknown>, c: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(c);
}
/** A complete bride biodata (from the seed) under a new name. */
function brideBiodata(name: string): Biodata {
  const src = buildSeed().profiles.find((p) => p.biodata.basic.lookingFor === 'groom' && p.status === 'published')!.biodata;
  const b: Biodata = JSON.parse(JSON.stringify(src));
  b.basic.fullName = name;
  b.photos = [];
  return b;
}
const NEW = '9999999999';

describe('team-added members', () => {
  it('admin adds a member for a number (no OTP), publishes it; the number is then taken however it is typed', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    expect(await b.adminCheckPhone('+91', NEW)).toMatchObject({ available: true, countryCode: '+91', phone: NEW });
    const created = await b.adminCreateMember({ countryCode: '+91', phone: NEW, biodata: brideBiodata('Zulekha Teamadded'), lastStep: 7 });
    expect(created.profile).toMatchObject({ status: 'draft', createdByAdminId: 'u_admin' });
    expect(created.claimed).toBe(false);
    const pub = await b.adminPublishMember(created.profile.id);
    expect(pub.profile.status).toBe('published');
    for (const typed of ['09999999999', '+91 99999 99999', '99999-99999']) {
      expect((await b.adminCheckPhone('+91', typed)).available).toBe(false);
      await code(b.adminCreateMember({ countryCode: '+91', phone: typed, biodata: brideBiodata('Again'), lastStep: 7 }), 'phone_taken');
    }
    // An existing member's number is refused too, and the check points at that account.
    const taken = await b.adminCheckPhone('+91', DEMO_USER_PHONE);
    expect(taken).toMatchObject({ available: false, existingUserId: 'u_demo' });
    // Other members find the new profile in Discover (with its own privacy settings applied).
    await as(b, DEMO_USER_PHONE);
    const found = await b.searchProfiles({ ...EMPTY_FILTERS }, 0, 100);
    expect(found.items.map((p) => p.id)).toContain(created.profile.id);
  });

  it('the owner of the number logs in with OTP and lands in that account with that biodata', async () => {
    const b = make();
    await as(b, DEMO_SUBADMIN_PHONE); // sub-admins can add members too
    const created = await b.adminCreateMember({ countryCode: '+91', phone: NEW, biodata: brideBiodata('Zulekha Teamadded'), lastStep: 7 });
    await b.adminPublishMember(created.profile.id);
    const login = await as(b, NEW);
    expect(login.isNew).toBe(false); // straight to Home, not a blank registration
    expect(login.needsPin).toBe(true); // first login on this phone: set a PIN
    expect(login.user.id).toBe(created.userId);
    const mine = await b.getMyProfile();
    expect(mine).toMatchObject({ id: created.profile.id, code: created.profile.code, status: 'published' });
    expect(mine!.biodata.basic.fullName).toBe('Zulekha Teamadded');
    expect((await b.getNotifications()).map((n) => n.type)).toContain('team_created');
    // Reviewing (saving) it once clears the "please review" note.
    expect(mine!.ownerReviewedAt).toBeUndefined();
    const saved = await b.saveDraft(mine!.biodata, 7);
    expect(saved.ownerReviewedAt).toBeDefined();
    // Once claimed, only the owner edits it.
    await as(b, DEMO_ADMIN_PHONE);
    await code(b.adminSaveMemberBiodata(created.profile.id, brideBiodata('Changed by team'), 7), 'invalid_state');
    expect((await b.adminGetMemberDraft(created.profile.id)).claimed).toBe(true);
    const row = (await b.adminSearch('Zulekha'))[0];
    expect(row).toMatchObject({ addedByTeam: true });
    expect(row.claimedAt).toBeDefined();
  });

  it('a draft can be saved step by step and only a complete biodata is published', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    const partial = emptyBiodata();
    partial.basic.fullName = 'Half Done';
    const d = await b.adminCreateMember({ countryCode: '+91', phone: '9888877777', biodata: partial, lastStep: 1 });
    await code(b.adminPublishMember(d.profile.id), 'incomplete_biodata');
    const full = brideBiodata('Half Done');
    const saved = await b.adminSaveMemberBiodata(d.profile.id, full, 7);
    expect(saved.profile.lastStep).toBe(7);
    expect((await b.adminPublishMember(d.profile.id)).profile.status).toBe('published');
    // Publishing twice is harmless (one notification).
    await b.adminPublishMember(d.profile.id);
    await as(b, '9888877777');
    expect((await b.getNotifications()).filter((n) => n.type === 'team_created')).toHaveLength(1);
  });

  it('members cannot add members; bad input is refused', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    await code(b.adminCheckPhone('+91', NEW), 'forbidden');
    await code(b.adminCreateMember({ countryCode: '+91', phone: NEW, biodata: brideBiodata('X'), lastStep: 7 }), 'forbidden');
    await as(b, DEMO_ADMIN_PHONE);
    await code(b.adminCreateMember({ countryCode: '+91', phone: '12345', biodata: brideBiodata('X'), lastStep: 7 }), 'validation');
    const noName = brideBiodata(' ');
    await code(b.adminCreateMember({ countryCode: '+91', phone: NEW, biodata: noName, lastStep: 7 }), 'validation');
    const spoof = brideBiodata('Rukhsar ‮moc.live');
    await code(b.adminCreateMember({ countryCode: '+91', phone: NEW, biodata: spoof, lastStep: 7 }), 'validation');
    // Ordinary member profiles can't be edited through the team path.
    await code(b.adminSaveMemberBiodata('p_2', brideBiodata('Hijack'), 7), 'not_found');
    await code(b.adminPublishMember('p_31'), 'not_found');
  });

  it('admin-added accounts are counted once: logging in does not create a second account', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminCreateMember({ countryCode: '+91', phone: NEW, biodata: brideBiodata('Once'), lastStep: 7 });
    await as(b, NEW);
    await as(b, NEW);
    await as(b, DEMO_ADMIN_PHONE);
    expect((await b.adminSearch(NEW)).length).toBe(1);
  });
});
