import { ageFromDob } from './format';
import type { Biodata, LookingFor, Profile, User } from './types';
import { photosSchema, privacySchema, stepErrors } from './validation';

/**
 * New-member onboarding (owner request 2026-11-01): a visitor answers a few taps, sees a safe preview of
 * real matches, and only then signs up. Pure rules shared by the screens, the demo backend and tests.
 */
export type Region = 'hyd' | 'india' | 'abroad' | 'anywhere';
export const REGIONS: Region[] = ['hyd', 'india', 'abroad'];

/** Age bands offered as taps (inclusive). */
export const AGE_BANDS = [
  { id: '18-22', min: 18, max: 22 },
  { id: '23-27', min: 23, max: 27 },
  { id: '28-32', min: 28, max: 32 },
  { id: '33+', min: 33, max: 60 },
] as const;
export type AgeBandId = (typeof AGE_BANDS)[number]['id'];
export const ageBand = (id?: string) => AGE_BANDS.find((b) => b.id === id);

/** "My son" needs a bride, "my daughter" a groom; only self / relative / other must be asked. */
export function lookingForFor(createdFor: string): LookingFor | undefined {
  if (createdFor === 'son' || createdFor === 'brother') return 'bride';
  if (createdFor === 'daughter' || createdFor === 'sister') return 'groom';
  return undefined;
}

/** He / she wording for the person the biodata is about (undefined → "you" / neutral). */
export function subjectOf(createdFor: string, lookingFor?: LookingFor): 'he' | 'she' | 'you' {
  if (createdFor === 'self') return 'you';
  if (lookingFor === 'bride') return 'he';
  if (lookingFor === 'groom') return 'she';
  return 'you';
}

export interface MatchPreviewInput {
  /** The side being looked for. */
  show: LookingFor;
  ageMin?: number;
  ageMax?: number;
  region?: Region;
}
export interface MatchPreviewItem {
  initial: string;
  age: number;
  profession: string;
  professionOther?: string;
  city: string;
}
export interface MatchPreview {
  count: number;
  items: MatchPreviewItem[];
}

export function inRegion(country: string, state: string, region?: Region) {
  if (!region || region === 'anywhere') return true;
  if (region === 'hyd') return country === 'India' && state === 'Telangana';
  if (region === 'india') return country === 'India';
  return country !== 'India';
}

/** Same rules as the SQL `match_preview`: live, visible profiles of the requested side only; 3 safe rows. */
export function computeMatchPreview(profiles: Profile[], users: Map<string, User>, input: MatchPreviewInput, now = new Date()): MatchPreview {
  if (input.show !== 'bride' && input.show !== 'groom') return { count: 0, items: [] };
  const clamp = (n: number) => Math.max(18, Math.min(80, n));
  const pool = profiles
    .filter((p) => {
      if (p.status !== 'published' || p.deletedAt) return false;
      const owner = users.get(p.userId);
      if (!owner || owner.deactivatedAt || owner.deletedAt) return false;
      const b = p.biodata;
      const type: LookingFor = b.basic.lookingFor === 'groom' ? 'bride' : 'groom';
      if (type !== input.show) return false;
      const age = ageFromDob(b.basic.dob, now);
      if (input.ageMin != null && age < clamp(input.ageMin)) return false;
      if (input.ageMax != null && age > clamp(input.ageMax)) return false;
      return inRegion(b.location.country, b.location.state, input.region);
    })
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  return {
    count: pool.length,
    items: pool.slice(0, 3).map((p) => ({
      initial: p.biodata.basic.fullName.trim().charAt(0).toUpperCase(),
      age: ageFromDob(p.biodata.basic.dob, now),
      profession: p.biodata.career.profession,
      professionOther: p.biodata.career.professionOther,
      city: p.biodata.location.city,
    })),
  };
}

/**
 * Answers collected before sign-up (kept on the phone until the account exists).
 * `ageBand` and `region` describe the person the biodata is FOR (their own age and where they live) —
 * owner request 2026-11-02: asking for the partner's age/place confused families. The partner range
 * shown in the preview and saved as the preference is worked out from it (`partnerAgeRange`).
 */
export interface OnboardingAnswers {
  createdFor?: string;
  lookingFor?: LookingFor;
  ageBand?: AgeBandId;
  region?: Region;
}

/**
 * A sensible partner age range from the member's own age band: a bride is usually the same age or up to
 * 7 years younger, a groom the same age or up to 7 years older. Never below the legal minimum (bride 18,
 * groom 21); "33 and over" stays open-ended up to 60.
 */
export function partnerAgeRange(a: Pick<OnboardingAnswers, 'ageBand' | 'lookingFor'>): { min: number; max: number } | undefined {
  const band = ageBand(a.ageBand);
  if (!band || !a.lookingFor) return undefined;
  if (a.lookingFor === 'bride') return { min: Math.max(18, band.min - 7), max: Math.max(18, band.max) };
  return { min: Math.max(21, band.min), max: Math.min(60, band.max + 7) };
}

/** Where to look in the preview: near home for Hyderabad / India; anywhere for families abroad. */
export function previewRegion(region?: Region): Region | undefined {
  if (!region) return undefined;
  return region === 'abroad' ? 'anywhere' : region;
}

/** Fold the pre-sign-up answers into a biodata (partner age range, and a likely home city for Hyderabad). */
export function applyAnswers(b: Biodata, a: OnboardingAnswers): Biodata {
  const out: Biodata = JSON.parse(JSON.stringify(b));
  if (a.createdFor) out.basic.createdFor = a.createdFor;
  if (a.lookingFor) out.basic.lookingFor = a.lookingFor;
  const range = partnerAgeRange({ ageBand: a.ageBand, lookingFor: a.lookingFor ?? out.basic.lookingFor });
  if (range && out.preferences.ageMin == null && out.preferences.ageMax == null) {
    out.preferences.ageMin = range.min;
    out.preferences.ageMax = range.max;
  }
  // They live in Hyderabad: pre-fill the home (only when no city was chosen yet; shown as "tap to change").
  if (a.region === 'hyd' && !out.location.city) {
    out.location.country = 'India';
    out.location.state = 'Telangana';
    out.location.city = 'Hyderabad';
  }
  return out;
}

/** The few answers needed to go live, in the order the onboarding asks them (wizard step + field). */
export const ONBOARDING_REQUIRED = [
  ['basic', 'createdFor'],
  ['basic', 'lookingFor'],
  ['basic', 'fullName'],
  ['basic', 'dob'],
  ['basic', 'heightCm'],
  ['basic', 'maritalStatus'],
  ['basic', 'motherTongue'],
  ['location', 'country'],
  ['location', 'state'],
  ['location', 'city'],
  ['career', 'education'],
  ['career', 'profession'],
] as const;

/** Which onboarding screen holds a field of the biodata. */
const FIELD_SCREEN: Record<string, 'who' | 'about' | 'more' | 'work'> = {
  'basic.createdFor': 'who', 'basic.lookingFor': 'who',
  'basic.fullName': 'about', 'basic.dob': 'about', 'basic.heightCm': 'about',
};

/**
 * The first onboarding screen with a missing or invalid answer needed to go live, or null when the
 * biodata can be published. Used before submitting so the member is taken to the exact screen instead of
 * a generic "complete the required sections" error.
 */
export function onboardingGap(b: Biodata): 'who' | 'about' | 'more' | 'work' | null {
  const order = ['who', 'about', 'more', 'work'] as const;
  const found = new Set<string>();
  const sections = [['basic', 0], ['location', 1], ['career', 2]] as const;
  for (const [key, step] of sections) {
    for (const k of Object.keys(stepErrors(step, b[key]))) {
      const field = `${key}.${k.split('.')[0]}`;
      found.add(FIELD_SCREEN[field] ?? (key === 'career' ? 'work' : 'more'));
    }
  }
  if (!privacySchema.safeParse(b.privacy).success || !photosSchema.safeParse(b.photos).success) found.add('more');
  return order.find((s) => found.has(s)) ?? null;
}
