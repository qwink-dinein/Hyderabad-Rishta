import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { isProfileFull, newReferralCode, normalizeReferralCode, referralCodeFromUrl, referralLink, referralStage } from '@/domain/referral';
import type { Biodata } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/** Referral-based free Boosts (owner spec 2026-11-02) on the demo backend, which mirrors the server rules. */
let clock = new Date('2026-11-02T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);
const DAY = 86400000;
const make = () => new DemoBackend({ storage: memoryKV(), now });

async function as(b: DemoBackend, phone: string) {
  await b.logout();
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp('+91', phone);
  await b.verifyOtp('+91', phone, DEMO_OTP);
}
async function fails(p: Promise<unknown>, c: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(c));
}
async function adminSettings(b: DemoBackend, patch: Partial<Awaited<ReturnType<DemoBackend['getReferralSettings']>>>) {
  await as(b, DEMO_ADMIN_PHONE);
  const s = await b.getReferralSettings();
  await b.adminUpdateReferralSettings({ ...s, ...patch });
}
/** A 100% biodata (every completion item) from the demo member's own, renamed. */
async function fullBiodata(b: DemoBackend, name: string): Promise<Biodata> {
  await as(b, DEMO_USER_PHONE);
  const mine = (await b.getMyProfile())!.biodata;
  return {
    ...mine,
    basic: { ...mine.basic, fullName: name, aboutMe: 'Calm, kind and close to family; works in IT.' },
    photos: [{ id: 'ph1', uri: 'file:///photos/main.jpg' }] as Biodata['photos'],
    religion: { ...mine.religion, maslak: 'sunni', namaz: 'mostly' },
    family: { ...mine.family, familyType: 'nuclear', fatherOccupation: 'Business' },
    preferences: { ...mine.preferences, ageMin: 22, ageMax: 30 },
  };
}
/** Each invited family signs up on its OWN phone (one shared phone would rightly be flagged for a team check). */
async function signUpWith(b: DemoBackend, phone: string, refCode: string) {
  (b as unknown as { local: { device?: unknown } }).local.device = undefined;
  await as(b, phone);
  await b.claimReferral(refCode);
}

describe('referral codes and links', () => {
  it('codes are readable, normalised and found in links', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 200; i++) taken.add(newReferralCode((c) => taken.has(c)));
    expect(taken.size).toBe(200);
    for (const c of taken) expect(c).toMatch(/^HR[2-9A-HJKMNP-Z]{4,6}$/);
    expect(normalizeReferralCode(' hr8k29 ')).toBe('HR8K29');
    expect(normalizeReferralCode('HR0OIL')).toBeNull(); // look-alike characters are never in codes
    expect(referralCodeFromUrl('https://x.in/r/HR8K29')).toBe('HR8K29');
    expect(referralCodeFromUrl('https://x.in/welcome?ref=hr8k29&a=1')).toBe('HR8K29');
    expect(referralLink('HR8K29', undefined)).toBeUndefined();
    expect(referralLink('HR8K29', 'https://hyderabadrishta.in/')).toBe('https://hyderabadrishta.in/r/HR8K29');
    expect(referralStage('registered', undefined)).toBe('registered');
    expect(referralStage('revoked', undefined)).toBe('rejected');
  });

  it('every member has a unique code, and sees only their own referral data', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    const a = await b.getMyReferral();
    await as(b, '9000000102');
    const c = await b.getMyReferral();
    expect(a.code).not.toBe(c.code);
    expect(a.code).toMatch(/^HR/);
    expect(c.stats.referred).toBe(0);
  });
});

describe('who can be referred', () => {
  it('rejects unknown codes, self-referral and a second code after sign-up; a retry of the same code is fine', async () => {
    const b = make();
    await as(b, DEMO_USER_PHONE);
    const { code } = await b.getMyReferral();
    await fails(b.claimReferral(code), 'referral_self');
    await as(b, '9811100001');
    await fails(b.claimReferral('HRZZZZ'), 'referral_invalid');
    await b.claimReferral(code);
    await b.claimReferral(code.toLowerCase()); // retry
    await as(b, '9000000102');
    const other = (await b.getMyReferral()).code;
    await as(b, '9811100001');
    await fails(b.claimReferral(other), 'referral_locked');
  });

  it('an existing account can never attach a code, even by logging in again', async () => {
    const b = make();
    await as(b, '9000000102');
    const { code } = await b.getMyReferral();
    advance(4 * DAY);
    await as(b, '9811100002'); // new
    advance(4 * DAY); // …but 4 days later the window has passed
    await as(b, '9811100002');
    await fails(b.claimReferral(code), 'referral_locked');
    await as(b, DEMO_USER_PHONE); // a long-standing member
    await fails(b.claimReferral(code), 'referral_locked');
  });
});

describe('earning free Boosts', () => {
  it('a family signing up on the referrer\'s own phone is sent to the team (flagged), not refused', async () => {
    const b = make();
    const bio = await fullBiodata(b, 'Same Phone');
    await adminSettings(b, { mode: 'referral', review: false });
    await as(b, DEMO_USER_PHONE);
    const { code } = await b.getMyReferral();
    await as(b, '9811100051'); // same phone as the referrer
    await b.claimReferral(code);
    await b.saveDraft({ ...bio, basic: { ...bio.basic, lookingFor: 'groom' } }, 6);
    await b.submitForPublication();
    await as(b, DEMO_ADMIN_PHONE);
    const [row] = await b.adminListReferrals('flagged');
    expect(row).toMatchObject({ status: 'review', flags: ['same_device'] });
  });

  it('only a 100% complete, live biodata earns — and both families get exactly one Boost, once', async () => {
    const b = make();
    const bio = await fullBiodata(b, 'Sana Invited');
    expect(isProfileFull(bio)).toBe(true);
    await adminSettings(b, { mode: 'referral', review: true, inviteeReward: true, rewardDays: 7 });
    await as(b, DEMO_USER_PHONE);
    const { code } = await b.getMyReferral();

    await signUpWith(b, '9811100003', code);
    const { photos: _p, ...noPhoto } = bio;
    await b.saveDraft({ ...noPhoto, photos: [], basic: { ...bio.basic, lookingFor: 'groom' } } as Biodata, 6);
    await b.submitForPublication();
    await as(b, DEMO_USER_PHONE);
    let mine = await b.getMyReferral();
    expect(mine.referrals[0]).toMatchObject({ initial: 'S', stage: expect.stringMatching(/incomplete|pending/) });
    expect(JSON.stringify(mine)).not.toContain('9811100003');
    expect(JSON.stringify(mine)).not.toContain('Sana Invited');
    expect(mine.stats.earned).toBe(0);

    await as(b, '9811100003');
    await b.saveDraft({ ...bio, basic: { ...bio.basic, lookingFor: 'groom' } }, 6); // now 100%
    await as(b, DEMO_ADMIN_PHONE);
    const [row] = await b.adminListReferrals('review');
    expect(row).toMatchObject({ status: 'review', referred: { full: true } });
    await as(b, '9811100003');
    await fails(b.adminDecideReferral(row.id, true), 'forbidden'); // members cannot approve
    await as(b, DEMO_ADMIN_PHONE);
    await b.adminDecideReferral(row.id, true, 'Genuine');
    await b.adminDecideReferral(row.id, true, 'double tap');
    await as(b, DEMO_USER_PHONE);
    mine = await b.getMyReferral();
    expect(mine.stats).toMatchObject({ referred: 1, approved: 1, earned: 1, available: 1, used: 0 });
    expect(mine.referrals[0].stage).toBe('rewarded');
    await as(b, '9811100003');
    const theirs = await b.getMyReferral();
    expect(theirs).toMatchObject({ invited: true, stats: { available: 1 } });
    expect(theirs.rewards[0]).toMatchObject({ role: 'invitee', days: 7 });
  });

  it('no team check: rewarded straight away; many referrals → many Boosts (no cap)', async () => {
    const b = make();
    const bio = await fullBiodata(b, 'Hina Invited');
    await adminSettings(b, { mode: 'referral', review: false });
    await as(b, DEMO_USER_PHONE);
    const { code } = await b.getMyReferral();
    for (const phone of ['9811100011', '9811100012', '9811100013']) {
      await signUpWith(b, phone, code);
      await b.saveDraft({ ...bio, basic: { ...bio.basic, lookingFor: 'groom' } }, 6);
      await b.submitForPublication();
    }
    await as(b, DEMO_USER_PHONE);
    expect((await b.getMyReferral()).stats).toMatchObject({ approved: 3, available: 3 });
  });

  it('using one starts a normal Boost and consumes exactly one; paid Boost keeps working afterwards', async () => {
    const b = make();
    const bio = await fullBiodata(b, 'Zoya Invited');
    await adminSettings(b, { mode: 'referral', review: false });
    await as(b, DEMO_USER_PHONE);
    const { code } = await b.getMyReferral();
    await signUpWith(b, '9811100021', code);
    await b.saveDraft({ ...bio, basic: { ...bio.basic, lookingFor: 'groom' } }, 6);
    await b.submitForPublication();
    await as(b, DEMO_USER_PHONE);
    const ordersBefore = (await b.getMyOrders()).length;
    const { profile } = await b.useReferralBoost();
    expect(new Date(profile.boostUntil!).getTime() - clock).toBeGreaterThan(6.9 * DAY);
    await fails(b.useReferralBoost(), 'boost_active');
    await fails(b.startBoost(), 'boost_active'); // one Boost at a time, whatever the source
    expect((await b.getMyOrders()).length).toBe(ordersBefore); // free Boosts are not purchases
    expect((await b.getMyReferral()).stats).toMatchObject({ available: 0, used: 1 });
    advance(8 * DAY);
    await fails(b.useReferralBoost(), 'no_free_boost');
    await adminSettings(b, { mode: 'paid' });
    await as(b, DEMO_USER_PHONE);
    const paid = await b.startBoost(); // paid flow unchanged (groom 7-day plan: pending payment)
    expect(paid.order).toMatchObject({ kind: 'boost', status: 'pending', amount: 100 });
  });

  it('switching modes never changes what was earned; revoking ends only that free Boost', async () => {
    const b = make();
    const bio = await fullBiodata(b, 'Rehan Invited');
    await adminSettings(b, { mode: 'referral', review: false });
    await as(b, DEMO_USER_PHONE);
    const { code } = await b.getMyReferral();
    await signUpWith(b, '9811100031', code);
    await b.saveDraft({ ...bio, basic: { ...bio.basic, lookingFor: 'groom' } }, 6);
    await b.submitForPublication();
    await adminSettings(b, { mode: 'paid' });
    await adminSettings(b, { mode: 'referral' });
    await as(b, '9811100031');
    expect((await b.getMyReferral()).stats.available).toBe(1);
    await b.useReferralBoost();
    await as(b, DEMO_ADMIN_PHONE);
    const [row] = await b.adminListReferrals('approved');
    const invitee = row.rewards.find((w) => w.role === 'invitee')!;
    await fails(b.adminRevokeReferralReward(invitee.id, ''), 'validation');
    await b.adminRevokeReferralReward(invitee.id, 'Duplicate account');
    await as(b, '9811100031');
    const p = (await b.getMyProfile())!;
    expect(new Date(p.boostUntil!).getTime()).toBeLessThanOrEqual(clock);
    await as(b, DEMO_USER_PHONE);
    expect((await b.getMyReferral()).stats.available).toBe(1); // the referrer's own reward untouched
    await as(b, DEMO_ADMIN_PHONE);
    const o = await b.adminReferralOverview();
    expect(o).toMatchObject({ referred: 1, rewardsIssued: 2, rewardsRevoked: 1, freeReferralBoosts: 1 });
  });

  it('a rejected referral earns nothing; visits are counted but are not referrals', async () => {
    const b = make();
    const bio = await fullBiodata(b, 'Ayesha Invited');
    await adminSettings(b, { mode: 'referral', review: true });
    await as(b, DEMO_USER_PHONE);
    const { code } = await b.getMyReferral();
    expect(await b.recordReferralVisit(code)).toBe(true);
    expect(await b.recordReferralVisit('nonsense')).toBe(false);
    await signUpWith(b, '9811100041', code);
    await b.saveDraft({ ...bio, basic: { ...bio.basic, lookingFor: 'groom' } }, 6);
    await b.submitForPublication();
    await as(b, DEMO_ADMIN_PHONE);
    const [row] = await b.adminListReferrals('review', 'ayesha');
    await b.adminDecideReferral(row.id, false, 'Not genuine');
    const o = await b.adminReferralOverview();
    expect(o).toMatchObject({ referred: 1, rejected: 1, approved: 0, rewardsIssued: 0, visits: 1 });
    await as(b, DEMO_USER_PHONE);
    expect((await b.getMyReferral()).referrals[0].stage).toBe('rejected');
  });
});
