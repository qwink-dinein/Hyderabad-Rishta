import { z } from 'zod';
import { ageFromDob } from './format';
import { unsafeText } from './security';
import type { Biodata } from './types';

// No runtime code generation: lets the web build run under a strict CSP (no 'unsafe-eval').
z.config({ jitless: true });

/**
 * Zod schemas per biodata step. Error messages are i18n keys (translated in the UI).
 * Minimum ages follow Indian law (bride 18, groom 21) — adjust per launch market.
 */
const req = z.string().trim().min(1, 'v.required').refine((v) => !unsafeText(v), 'v.badChars');
const opt = z.string().trim().max(500, 'v.tooLong').refine((v) => !unsafeText(v), 'v.badChars').optional().or(z.literal(''));

export const MIN_AGE = { bride: 18, groom: 21 } as const;
export const MAX_AGE = 80;

export const basicSchema = z
  .object({
    createdFor: req,
    lookingFor: z.enum(['bride', 'groom'], { message: 'v.required' }),
    fullName: req.min(2, 'v.nameShort').max(80, 'v.tooLong'),
    dob: req.regex(/^\d{4}-\d{2}-\d{2}$/, 'v.dob'),
    heightCm: z.number({ message: 'v.required' }).min(120, 'v.height').max(230, 'v.height'),
    maritalStatus: req,
    children: z.number({ message: 'v.children' }).int('v.children').min(0, 'v.children').max(15, 'v.children').optional(),
    motherTongue: req,
    aboutMe: z.string().max(1000, 'v.tooLong').optional(),
  })
  .superRefine((v, ctx) => {
    // Anyone previously married states how many children they have (0 is a valid answer).
    if (v.maritalStatus && v.maritalStatus !== 'never_married' && v.children == null)
      ctx.addIssue({ code: 'custom', path: ['children'], message: 'v.children' });
    const age = ageFromDob(v.dob);
    if (Number.isNaN(age)) {
      ctx.addIssue({ code: 'custom', path: ['dob'], message: 'v.dob' });
      return;
    }
    // Looking for a groom ⇒ the profile is a bride.
    const min = v.lookingFor === 'groom' ? MIN_AGE.bride : MIN_AGE.groom;
    if (age < min) ctx.addIssue({ code: 'custom', path: ['dob'], message: v.lookingFor === 'groom' ? 'v.minAgeBride' : 'v.minAgeGroom' });
    if (age > MAX_AGE) ctx.addIssue({ code: 'custom', path: ['dob'], message: 'v.dob' });
  });

export const photosSchema = z.array(z.object({ id: z.string(), uri: z.string().min(1) })).max(3, 'v.maxPhotos');

export const locationSchema = z.object({
  country: req,
  state: req,
  district: opt,
  city: req,
  locality: opt,
  nativePlace: opt,
  nationality: opt,
  livingAbroad: z.boolean().optional(),
  willingToRelocate: opt,
});

export const careerSchema = z
  .object({
    education: req,
    educationOther: opt,
    educationDetails: opt,
    profession: req,
    professionOther: opt,
    professionDetails: opt,
    employmentType: opt,
    employer: opt,
    income: opt,
    workLocation: opt,
  })
  .superRefine((v, ctx) => {
    // "Other" requires the matching free-text field — and only then (PRD §6.4).
    if (v.education === 'other' && !v.educationOther?.trim())
      ctx.addIssue({ code: 'custom', path: ['educationOther'], message: 'v.specifyEducation' });
    if (v.profession === 'other' && !v.professionOther?.trim())
      ctx.addIssue({ code: 'custom', path: ['professionOther'], message: 'v.specifyProfession' });
  });

export const religionSchema = z.object({
  maslak: opt,
  subMaslak: opt,
  maslakOther: opt,
  namaz: opt,
  fasting: opt,
  hajj: opt,
  umrah: opt,
  dargah: opt,
  expectations: opt,
  compatibilityImportance: opt,
});

const count = z.number().int().min(0, 'v.count').max(20, 'v.count').optional();
export const familySchema = z
  .object({
    familyType: opt,
    familyValues: opt,
    fatherOccupation: opt,
    motherOccupation: opt,
    siblings: count,
    brothers: count,
    sisters: count,
    residence: opt,
    description: z.string().max(1000, 'v.tooLong').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.siblings != null && (v.brothers ?? 0) + (v.sisters ?? 0) > v.siblings)
      ctx.addIssue({ code: 'custom', path: ['siblings'], message: 'v.siblings' });
  });

export const preferencesSchema = z
  .object({
    ageMin: z.number().optional(),
    ageMax: z.number().optional(),
    heightMin: z.number().optional(),
    heightMax: z.number().optional(),
    maritalStatus: z.array(z.string()),
    education: z.array(z.string()),
    profession: z.array(z.string()),
    countries: z.array(z.string()),
    states: z.array(z.string()),
    cities: z.array(z.string()),
    motherTongues: z.array(z.string()),
    religious: opt,
    relocation: opt,
    expectations: z.string().max(1000, 'v.tooLong').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.ageMin != null && v.ageMax != null && v.ageMin > v.ageMax) ctx.addIssue({ code: 'custom', path: ['ageMax'], message: 'v.range' });
    if (v.heightMin != null && v.heightMax != null && v.heightMin > v.heightMax)
      ctx.addIssue({ code: 'custom', path: ['heightMax'], message: 'v.range' });
  });

export const privacySchema = z.object({
  displayName: z.enum(['full', 'first', 'initials']),
  photoVisibility: z.enum(['public', 'onConsent', 'hidden']),
  incomeVisibility: z.enum(['public', 'onConsent', 'hidden']),
  familyVisibility: z.enum(['public', 'onConsent', 'hidden']),
  acceptContactRequests: z.boolean(),
});

export const STEP_SCHEMAS = [basicSchema, locationSchema, careerSchema, religionSchema, familySchema, preferencesSchema, privacySchema];
export const STEP_KEYS = ['basic', 'location', 'career', 'religion', 'family', 'preferences', 'privacy'] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** Returns the first incomplete step index, or -1 if the biodata is publishable. */
export function firstInvalidStep(b: Biodata): number {
  const parts = [b.basic, b.location, b.career, b.religion, b.family, b.preferences, b.privacy];
  for (let i = 0; i < parts.length; i++) if (!STEP_SCHEMAS[i].safeParse(parts[i]).success) return i;
  if (!photosSchema.safeParse(b.photos).success) return 0;
  return -1;
}

export function stepErrors(step: number, value: unknown): Record<string, string> {
  const r = STEP_SCHEMAS[step].safeParse(value);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = issue.path.join('.');
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

export const requestMessageSchema = z.string().max(800, 'v.tooLong');
export const phoneSchema = z.string().regex(/^\d{6,14}$/, 'v.phone');
export const otpSchema = z.string().regex(/^\d{6}$/, 'v.otp');

export function emptyBiodata(): Biodata {
  return {
    basic: { createdFor: '', lookingFor: '' as never, fullName: '', dob: '', heightCm: 0, maritalStatus: '', motherTongue: '', aboutMe: '' },
    photos: [],
    location: { country: 'India', state: 'Telangana', city: '', district: '', locality: '', nativePlace: '', nationality: 'Indian' },
    career: { education: '', profession: '', income: 'undisclosed' },
    religion: {},
    family: {},
    preferences: { maritalStatus: [], education: [], profession: [], countries: [], states: [], cities: [], motherTongues: [] },
    privacy: { displayName: 'first', photoVisibility: 'onConsent', incomeVisibility: 'hidden', familyVisibility: 'public', acceptContactRequests: true },
  };
}
