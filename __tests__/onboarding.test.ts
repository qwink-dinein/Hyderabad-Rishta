import { buildSeed, DEMO_OTP } from '@/data/seed';
import { profileCompletion } from '@/domain/completion';
import { ageFromDob } from '@/domain/format';
import { AGE_BANDS, applyAnswers, questionOrder, partnerAgeRange, previewRegion, onboardingGap, computeMatchPreview, inRegion, lookingForFor, subjectOf } from '@/domain/onboarding';
import { NO_CONSENT, profileTypeOf, projectProfile } from '@/domain/privacy';
import type { Biodata, User } from '@/domain/types';
import { emptyBiodata, firstInvalidStep, stepErrors } from '@/domain/validation';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/**
 * Onboarding redesign (owner request 2026-11-01): see matches before signing up, one number to sign up,
 * the few answers needed to go live, and follow-up questions only when they apply.
 */
let clock = new Date('2026-11-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const makeBackend = () => new DemoBackend({ storage: memoryKV(), now });

describe('who the biodata is for', () => {
  it('implies the side for son/daughter/brother/sister and asks only for self or a relative', () => {
    expect(lookingForFor('son')).toBe('bride');
    expect(lookingForFor('brother')).toBe('bride');
    expect(lookingForFor('daughter')).toBe('groom');
    expect(lookingForFor('sister')).toBe('groom');
    expect(lookingForFor('self')).toBeUndefined();
    expect(lookingForFor('relative')).toBeUndefined();
  });
  it('words screens as he / she / you', () => {
    expect(subjectOf('son', 'bride')).toBe('he');
    expect(subjectOf('daughter', 'groom')).toBe('she');
    expect(subjectOf('self', 'bride')).toBe('you');
  });
});

describe('match preview before sign-up', () => {
  const seed = buildSeed();
  const users = new Map<string, User>(seed.users.map((u) => [u.id, u]));
  const brides = seed.profiles.filter((p) => p.status === 'published' && !p.deletedAt && profileTypeOf(p) === 'bride');

  it('counts only live profiles of the side asked for, and shows at most 3 safe rows', () => {
    const r = computeMatchPreview(seed.profiles, users, { show: 'bride' }, now());
    const visible = brides.filter((p) => {
      const u = users.get(p.userId);
      return u && !u.deactivatedAt && !u.deletedAt;
    });
    expect(r.count).toBe(visible.length);
    expect(r.items.length).toBeLessThanOrEqual(3);
    for (const it of r.items) {
      // Never a name, photo, code, contact or anything beyond these five fields.
      expect(Object.keys(it).sort()).toEqual(['age', 'city', 'initial', 'profession', 'professionOther'].filter((k) => k in it).sort());
      expect(it.initial).toMatch(/^.$/u);
    }
    expect(JSON.stringify(r)).not.toMatch(/fullName|photos|uri|phone|code/);
  });

  it('filters by age band and region', () => {
    const band = AGE_BANDS[1];
    const r = computeMatchPreview(seed.profiles, users, { show: 'bride', ageMin: band.min, ageMax: band.max, region: 'hyd' }, now());
    const expected = brides.filter((p) => {
      const age = ageFromDob(p.biodata.basic.dob, now());
      return age >= band.min && age <= band.max && inRegion(p.biodata.location.country, p.biodata.location.state, 'hyd');
    });
    expect(r.count).toBeLessThanOrEqual(expected.length);
    for (const it of r.items) expect(it.age).toBeGreaterThanOrEqual(band.min);
  });

  it('rejects anything but bride / groom', () => {
    expect(computeMatchPreview(seed.profiles, users, { show: 'x' as never }).count).toBe(0);
  });

  it('works without logging in (demo backend)', async () => {
    const b = makeBackend();
    const r = await b.getMatchPreview({ show: 'groom', region: 'anywhere' });
    expect(r.count).toBeGreaterThan(0);
    expect(r.items.length).toBeLessThanOrEqual(3);
  });
});

describe('answers before sign-up are kept, never asked twice', () => {
  it('own age → a sensible partner range; living in Hyderabad fills the home, never overwriting saved answers', () => {
    const b = applyAnswers(emptyBiodata(), { createdFor: 'son', lookingFor: 'bride', ageBand: '23-27', region: 'hyd' });
    expect(b.basic.createdFor).toBe('son');
    expect(b.basic.lookingFor).toBe('bride');
    expect([b.preferences.ageMin, b.preferences.ageMax]).toEqual([18, 27]); // he is 23–27 → bride 18–27
    expect([b.location.country, b.location.state, b.location.city]).toEqual(['India', 'Telangana', 'Hyderabad']);
    const kept = emptyBiodata();
    kept.location = { ...kept.location, country: 'India', state: 'Karnataka', city: 'Bengaluru' };
    kept.preferences.ageMin = 25;
    kept.preferences.ageMax = 30;
    const again = applyAnswers(kept, { ageBand: '18-22', region: 'hyd' });
    expect(again.location.city).toBe('Bengaluru');
    expect([again.preferences.ageMin, again.preferences.ageMax]).toEqual([25, 30]);
  });
});

describe('follow-up questions', () => {
  const base = (): Biodata => JSON.parse(JSON.stringify(buildSeed().profiles.find((p) => p.status === 'published')!.biodata));

  it('children: required once previously married (0 is fine); the extra answers stay optional', () => {
    const b = base();
    b.basic.maritalStatus = 'divorced';
    b.basic.children = undefined;
    expect(stepErrors(0, b.basic)).toHaveProperty('children');
    b.basic.children = 0;
    expect(stepErrors(0, b.basic)).not.toHaveProperty('children');
    b.basic.children = 2;
    expect(firstInvalidStep(b)).toBe(-1); // live-with and note are optional
    b.basic.childrenNote = 'x'.repeat(301);
    expect(stepErrors(0, b.basic)).toHaveProperty('childrenNote');
  });

  it('children details reach other families only when previously married with children', () => {
    const seed = buildSeed();
    const p = JSON.parse(JSON.stringify(seed.profiles.find((x) => x.status === 'published')!));
    p.biodata.basic = { ...p.biodata.basic, maritalStatus: 'divorced', children: 2, childrenLiveWith: 'yes', childrenNote: 'Ages 6 and 9' };
    const shown = projectProfile(p, NO_CONSENT);
    expect([shown.childrenLiveWith, shown.childrenNote]).toEqual(['yes', 'Ages 6 and 9']);
    p.biodata.basic.children = 0;
    expect(projectProfile(p, NO_CONSENT).childrenNote).toBeUndefined();
    p.biodata.basic = { ...p.biodata.basic, maritalStatus: 'never_married', children: 2 };
    const never = projectProfile(p, NO_CONSENT);
    expect([never.children, never.childrenLiveWith, never.childrenNote]).toEqual([undefined, undefined, undefined]);
  });

  it('married brothers / sisters cannot outnumber brothers / sisters', () => {
    const b = base();
    b.family = { ...b.family, siblings: 3, brothers: 1, sisters: 2, marriedBrothers: 2, marriedSisters: 1 };
    expect(stepErrors(4, b.family)).toHaveProperty('marriedBrothers');
    b.family.marriedBrothers = 1;
    expect(stepErrors(4, b.family)).toEqual({});
  });
});

describe('the whole journey on the demo backend', () => {
  it('number → code → seeded draft → 7 answers → live', async () => {
    const b = makeBackend();
    clock += RESEND_COOLDOWN_MS + 1;
    await b.requestOtp('+91', '9876500011');
    const { user, isNew } = await b.verifyOtp('+91', '9876500011', DEMO_OTP);
    expect(isNew).toBe(true);
    expect(user.role).toBe('user');
    // Pre-sign-up answers become the draft.
    let bd = applyAnswers(emptyBiodata(), { createdFor: 'son', lookingFor: 'bride', ageBand: '23-27', region: 'hyd' });
    await b.saveDraft(bd, 0);
    // About / more / work: the only answers still needed.
    bd = { ...bd, basic: { ...bd.basic, fullName: 'Imran Ahmed', dob: '1997-03-12', heightCm: 175, maritalStatus: 'never_married', motherTongue: 'urdu' } };
    await b.saveDraft(bd, 0);
    bd = { ...bd, career: { ...bd.career, education: 'bachelors', profession: 'other', professionOther: 'Software engineer' } };
    expect(firstInvalidStep(bd)).toBe(-1);
    await b.saveDraft(bd, 0);
    const { profile } = await b.submitForPublication();
    expect(['published', 'pending']).toContain(profile.status);
    // Live, but not yet 100 %: the extras become suggestions (photo first).
    const c = profileCompletion(profile.biodata);
    expect(c.complete).toBe(false);
    expect(c.fields[0]).toMatchObject({ field: 'photos', required: false });
  });
});

describe('finishing: the member is sent to the exact missing answer', () => {
  const full = (): Biodata => {
    const b = applyAnswers(emptyBiodata(), { createdFor: 'son', lookingFor: 'bride', region: 'hyd' });
    Object.assign(b.basic, { fullName: 'Imran Ahmed', dob: '1997-03-12', heightCm: 175, maritalStatus: 'never_married', motherTongue: 'urdu' });
    Object.assign(b.career, { education: 'high_school', profession: 'skilled' });
    return b;
  };
  it('complete → nothing missing', () => expect(onboardingGap(full())).toBeNull());
  it('bride/groom or "for whom" missing (bug 2026-11-02: signed in before onboarding) → back to the first question', () => {
    const b = full();
    b.basic.createdFor = '';
    expect(onboardingGap(b)).toBe('who');
    const c = full();
    c.basic.lookingFor = '' as never;
    expect(onboardingGap(c)).toBe('who');
  });
  it('other gaps go to their own screen', () => {
    const a = full(); a.basic.heightCm = undefined as never; expect(onboardingGap(a)).toBe('height');
    const m = full(); m.basic.maritalStatus = 'divorced'; expect(onboardingGap(m)).toBe('children');
    const l = full(); l.location.city = ''; expect(onboardingGap(l)).toBe('city');
    const w = full(); w.career.profession = ''; expect(onboardingGap(w)).toBe('profession');
  });
  it('the pre-sign-up answers fill a saved draft that lacks them', () => {
    const saved = full(); saved.basic.createdFor = ''; saved.basic.lookingFor = '' as never;
    expect(onboardingGap(applyAnswers(saved, { createdFor: 'son', lookingFor: 'bride' }))).toBeNull();
  });
});

describe('the second screen asks about the person, not the partner (owner request 2026-11-02)', () => {
  it('bride: same age or up to 7 younger, never under 18', () => {
    expect(partnerAgeRange({ lookingFor: 'bride', ageBand: '18-22' })).toEqual({ min: 18, max: 22 });
    expect(partnerAgeRange({ lookingFor: 'bride', ageBand: '28-32' })).toEqual({ min: 21, max: 32 });
    expect(partnerAgeRange({ lookingFor: 'bride', ageBand: '33+' })).toEqual({ min: 26, max: 60 });
  });
  it('groom: same age or up to 7 older, never under 21', () => {
    expect(partnerAgeRange({ lookingFor: 'groom', ageBand: '18-22' })).toEqual({ min: 21, max: 29 });
    expect(partnerAgeRange({ lookingFor: 'groom', ageBand: '23-27' })).toEqual({ min: 23, max: 34 });
    expect(partnerAgeRange({ lookingFor: 'groom', ageBand: '33+' })).toEqual({ min: 33, max: 60 });
  });
  it('nothing guessed without both answers; families abroad see matches anywhere', () => {
    expect(partnerAgeRange({ ageBand: '23-27' })).toBeUndefined();
    expect(previewRegion('hyd')).toBe('hyd');
    expect(previewRegion('abroad')).toBe('anywhere');
    const b = applyAnswers(emptyBiodata(), { createdFor: 'daughter', lookingFor: 'groom', ageBand: '23-27', region: 'abroad' });
    expect(b.location.city).toBeFalsy();
    expect([b.preferences.ageMin, b.preferences.ageMax]).toEqual([23, 34]);
  });
});

describe('one question per screen (owner request 2026-11-02)', () => {
  it('8 questions; "children" only for someone married before', () => {
    const b = emptyBiodata();
    expect(questionOrder(b)).toEqual(['name', 'dob', 'height', 'marital', 'tongue', 'city', 'education', 'profession']);
    b.basic.maritalStatus = 'widowed';
    expect(questionOrder(b)).toHaveLength(9);
    expect(questionOrder(b)[4]).toBe('children');
  });
});
