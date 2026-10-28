import { buildSeed } from '@/data/seed';
import { ageFromDob, displayNameFor, formatHeight, maskPhone, profileCode } from '@/domain/format';
import { announcementStats, audienceFor, dashboardMetrics } from '@/domain/metrics';
import { DEFAULT_PRICING, pricingCopy, resolvePricing, validatePricing } from '@/domain/pricing';
import { FULL_ACCESS, NO_CONSENT, projectProfile } from '@/domain/privacy';
import { activeFilterCount, EMPTY_FILTERS, filtersFromPreferences, matchesFilters, sortProfiles } from '@/domain/search';
import type { PricingConfig, Profile } from '@/domain/types';
import { basicSchema, careerSchema, emptyBiodata, familySchema, firstInvalidStep, preferencesSchema, stepErrors } from '@/domain/validation';

const NOW = new Date('2026-10-01T09:00:00Z');
const seed = buildSeed(NOW);
const profile = (i: number) => JSON.parse(JSON.stringify(seed.profiles[i])) as Profile;

describe('ageFromDob', () => {
  it('calculates whole years around the birthday', () => {
    expect(ageFromDob('2000-10-01', NOW)).toBe(26);
    expect(ageFromDob('2000-10-02', NOW)).toBe(25);
    expect(ageFromDob('2000-09-30', NOW)).toBe(26);
  });
  it('rejects invalid dates', () => {
    expect(ageFromDob('2000-02-31', NOW)).toBeNaN();
    expect(ageFromDob('not-a-date', NOW)).toBeNaN();
    expect(ageFromDob('', NOW)).toBeNaN();
  });
});

describe('format helpers', () => {
  it('formats height in ft/in and cm', () => expect(formatHeight(165)).toBe('5′ 5″ (165 cm)'));
  it('builds privacy-safe display names', () => {
    expect(displayNameFor('Ayesha Siddiqui', 'first')).toBe('Ayesha');
    expect(displayNameFor('Ayesha Siddiqui', 'initials')).toBe('A. S.');
    expect(displayNameFor('  ', 'full')).toBe('—');
  });
  it('masks phones and builds stable codes', () => {
    expect(maskPhone('9876543210')).toBe('••••••3210');
    expect(profileCode('p_1')).toBe(profileCode('p_1'));
    expect(profileCode('p_1')).toMatch(/^HR-[0-9A-F]{4}$/);
  });
});

describe('validation', () => {
  const basic = { createdFor: 'self', lookingFor: 'groom' as const, fullName: 'Test Name', dob: '2000-01-01', heightCm: 160, maritalStatus: 'never_married', motherTongue: 'urdu' };
  it('accepts a valid basic section', () => expect(basicSchema.safeParse(basic).success).toBe(true));
  it('enforces minimum marriage age per profile type', () => {
    const young = { ...basic, dob: `${new Date().getUTCFullYear() - 19}-01-01` };
    expect(basicSchema.safeParse(young).success).toBe(true); // bride ≥ 18
    expect(stepErrors(0, { ...young, lookingFor: 'bride' }).dob).toBe('v.minAgeGroom'); // groom ≥ 21
  });
  it('requires "please specify" only when Other is selected', () => {
    expect(careerSchema.safeParse({ education: 'bachelors', profession: 'it' }).success).toBe(true);
    expect(stepErrors(2, { education: 'other', profession: 'it' }).educationOther).toBe('v.specifyEducation');
    expect(stepErrors(2, { education: 'bachelors', profession: 'other', professionOther: ' ' }).professionOther).toBe('v.specifyProfession');
    expect(careerSchema.safeParse({ education: 'other', educationOther: 'Aalim course', profession: 'other', professionOther: 'Calligrapher' }).success).toBe(true);
  });
  it('requires number of children unless never married', () => {
    expect(stepErrors(0, { ...basic, maritalStatus: 'divorced' }).children).toBe('v.children');
    expect(basicSchema.safeParse({ ...basic, maritalStatus: 'divorced', children: 0 }).success).toBe(true);
    expect(basicSchema.safeParse({ ...basic, maritalStatus: 'widowed', children: 2 }).success).toBe(true);
    expect(basicSchema.safeParse({ ...basic, maritalStatus: 'divorced', children: 1.5 }).success).toBe(false);
    expect(basicSchema.safeParse({ ...basic, maritalStatus: 'never_married' }).success).toBe(true);
  });
  it('validates sibling counts and preference ranges', () => {
    expect(familySchema.safeParse({ siblings: 1, brothers: 1, sisters: 1 }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...emptyBiodata().preferences, ageMin: 30, ageMax: 25 }).success).toBe(false);
  });
  it('detects first incomplete step; seed profiles are complete', () => {
    expect(firstInvalidStep(emptyBiodata())).toBe(0);
    expect(firstInvalidStep(seed.profiles[0].biodata)).toBe(-1);
  });
});

describe('privacy projection (PRD §9.3, §12)', () => {
  it('never exposes the phone number without phone consent', () => {
    const p = projectProfile(profile(0), NO_CONSENT, { countryCode: '+91', phone: '9999999999' }, NOW);
    expect(JSON.stringify(p)).not.toContain('9999999999');
    expect(p.contact).toBeUndefined();
  });
  it('hides on-consent photos, hidden income and employer from the serialised payload', () => {
    const raw = profile(1);
    raw.biodata.photos = [{ id: 'x', uri: 'secret-photo-uri' }];
    raw.biodata.privacy.photoVisibility = 'onConsent';
    raw.biodata.privacy.incomeVisibility = 'hidden';
    raw.biodata.career.income = '20to35';
    raw.biodata.career.employer = 'Secret Employer';
    const p = projectProfile(raw, NO_CONSENT, undefined, NOW);
    const json = JSON.stringify(p);
    expect(json).not.toContain('secret-photo-uri');
    expect(json).not.toContain('Secret Employer');
    expect(p.career.income).toBeUndefined();
    expect(p.photosHidden).toBe(true);
  });
  it('reveals granted scopes only', () => {
    const raw = profile(1);
    raw.biodata.photos = [{ id: 'x', uri: 'photo' }];
    raw.biodata.privacy.photoVisibility = 'onConsent';
    const photosOnly = projectProfile(raw, { photos: true, phone: false, fullBiodata: false }, { countryCode: '+91', phone: '9' }, NOW);
    expect(photosOnly.photos).toHaveLength(1);
    expect(photosOnly.contact).toBeUndefined();
    const full = projectProfile(raw, FULL_ACCESS, { countryCode: '+91', phone: '9876' }, NOW);
    expect(full.contact?.phone).toBe('9876');
    expect(full.displayName).toBe(raw.biodata.basic.fullName);
  });
  it('never shows hidden photos even with consent', () => {
    const raw = profile(1);
    raw.biodata.photos = [{ id: 'x', uri: 'photo' }];
    raw.biodata.privacy.photoVisibility = 'hidden';
    expect(projectProfile(raw, FULL_ACCESS, undefined, NOW).photos).toHaveLength(0);
  });
});

describe('search & filters (PRD §9)', () => {
  const all = seed.profiles.filter((p) => p.status === 'published').map((p) => projectProfile(p, NO_CONSENT, undefined, NOW));
  it('filters by profile type and age range', () => {
    const res = all.filter((p) => matchesFilters(p, { ...EMPTY_FILTERS, show: 'bride', ageMin: 22, ageMax: 26 }));
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((p) => p.profileType === 'bride' && p.age >= 22 && p.age <= 26)).toBe(true);
  });
  it('makes custom "Other" education searchable by keyword and by value', () => {
    const custom = all.find((p) => p.career.education === 'other')!;
    expect(custom).toBeDefined();
    const kw = custom.career.educationOther!.split(' ')[0];
    expect(all.filter((p) => matchesFilters(p, { ...EMPTY_FILTERS, keyword: kw })).map((p) => p.id)).toContain(custom.id);
    expect(matchesFilters(custom, { ...EMPTY_FILTERS, education: [custom.career.educationOther!] })).toBe(true);
    expect(matchesFilters(custom, { ...EMPTY_FILTERS, education: ['other'] })).toBe(true);
  });
  it('does not exclude profiles missing optional data unless strict', () => {
    const p = { ...all[0], religion: { ...all[0].religion, maslak: undefined } };
    expect(matchesFilters(p, { ...EMPTY_FILTERS, maslak: ['sunni'] })).toBe(true);
    expect(matchesFilters(p, { ...EMPTY_FILTERS, maslak: ['sunni'], strictOptional: true })).toBe(false);
  });
  it('filters by sub-maslak and shows children only for previously married', () => {
    const hanafi = all.filter((p) => matchesFilters(p, { ...EMPTY_FILTERS, maslak: ['sunni'], subMaslak: ['hanafi'], strictOptional: true }));
    expect(hanafi.length).toBeGreaterThan(0);
    expect(hanafi.every((p) => p.religion.subMaslak === 'hanafi')).toBe(true);
    expect(all.filter((p) => p.maritalStatus === 'never_married').every((p) => p.children === undefined)).toBe(true);
    expect(all.filter((p) => p.maritalStatus !== 'never_married').every((p) => typeof p.children === 'number')).toBe(true);
  });
  it('cannot probe hidden income via the income filter', () => {
    const hidden = all.find((p) => p.career.income === undefined)!;
    // Hidden income behaves as "undisclosed": passes non-strict, excluded when strict — never matched on its real value.
    expect(matchesFilters(hidden, { ...EMPTY_FILTERS, incomeMin: 'gt50' })).toBe(true);
    expect(matchesFilters(hidden, { ...EMPTY_FILTERS, incomeMin: 'gt50', strictOptional: true })).toBe(false);
  });
  it('sorts boosted first for recommended, recency otherwise', () => {
    const sorted = sortProfiles(all, 'recommended');
    const firstNonBoosted = sorted.findIndex((p) => !p.boosted);
    expect(sorted.slice(firstNonBoosted).some((p) => p.boosted)).toBe(false);
  });
  it('builds non-strict filters from partner preferences and counts chips', () => {
    const f = filtersFromPreferences({ ...emptyBiodata().preferences, ageMin: 22, ageMax: 30, cities: ['Hyderabad'] }, 'bride');
    expect(f.strictOptional).toBe(false);
    expect(activeFilterCount(f)).toBe(2);
  });
});

describe('dynamic pricing (PRD §8)', () => {
  const cfg = (pub: 'free' | 'paid', boost: 'free' | 'paid' | 'disabled'): PricingConfig => ({
    ...DEFAULT_PRICING,
    publication: { bride: { mode: pub, amount: 299 }, groom: { mode: pub, amount: 299 } },
    boost: { bride: { mode: boost, amount: 199 }, groom: { mode: boost, amount: 199 } },
  });
  it('picks the right copy for every combination', () => {
    expect(pricingCopy(cfg('free', 'free'), 'bride').key).toBe('pricing.copy.bothFree');
    expect(pricingCopy(cfg('free', 'paid'), 'bride').key).toBe('pricing.copy.pubFreeBoostPaid');
    expect(pricingCopy(cfg('paid', 'free'), 'bride').key).toBe('pricing.copy.pubPaidBoostFree');
    expect(pricingCopy(cfg('paid', 'paid'), 'groom').key).toBe('pricing.copy.bothPaid');
    expect(pricingCopy(cfg('free', 'disabled'), 'groom').key).toBe('pricing.copy.pubFreeBoostOff');
  });
  it('resolves per profile type from the same config', () => {
    expect(resolvePricing(DEFAULT_PRICING, 'bride').boost.mode).toBe('free');
    expect(resolvePricing(DEFAULT_PRICING, 'groom').boostLabel).toBe('₹499');
    expect(pricingCopy(DEFAULT_PRICING, 'groom').params.days).toBe('7');
  });
  it('validates admin input', () => {
    expect(validatePricing(cfg('paid', 'paid'))).toEqual([]);
    const bad = cfg('paid', 'free');
    bad.publication.bride.amount = 0;
    bad.boostDays = 0;
    expect(validatePricing(bad).length).toBe(2);
  });
});

describe('metrics & analytics', () => {
  it('excludes owner views and counts unique viewers', () => {
    const p = seed.profiles[1];
    const m = dashboardMetrics(p, { views: [...seed.views, { profileId: p.id, viewerUserId: p.userId, at: NOW.toISOString() }], shortlists: [], requests: seed.requests }, NOW);
    expect(m.views).toBe(5);
    expect(m.uniqueViewers).toBe(4);
    expect(m.requestsReceived).toBe(2);
    expect(m.requestsAccepted).toBe(1);
  });
  it('targets audiences and reports honest readership', () => {
    const audience = audienceFor('brides', seed.users, seed.profiles);
    expect(audience.every((u) => u.role !== 'admin')).toBe(true);
    const a = { ...seed.announcements[0], status: 'published' as const };
    const deliveries = audience.slice(0, 4).map((u, i) => ({ announcementId: a.id, userId: u.id, inAppAt: NOW.toISOString(), pushStatus: 'not_configured' as const, viewedAt: i < 1 ? NOW.toISOString() : undefined }));
    const s = announcementStats(a, deliveries);
    expect(s).toMatchObject({ targeted: 4, inAppAvailable: 4, uniqueViewers: 1, unread: 3, pushSubmitted: 0, pushNotConfigured: 4 });
  });
});
