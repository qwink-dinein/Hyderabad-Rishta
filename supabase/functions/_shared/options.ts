// GENERATED from src/domain/options.ts by scripts/sync-shared.js — do not edit here.
/**
 * Predefined option keys. Labels live in i18n under `opt.<group>.<key>`.
 * Stored values are always the stable key; "other" pairs with a free-text field.
 * Admin-managed options can be added later without invalidating stored custom values,
 * because custom values are stored verbatim in `*Other` fields.
 */

import { ABROAD, INDIA, type Place } from './places.ts';

export const CREATED_FOR = ['self', 'son', 'daughter', 'brother', 'sister', 'relative', 'other'] as const;
export const MARITAL_STATUS = ['never_married', 'divorced', 'widowed', 'separated', 'annulled'] as const;
export const MOTHER_TONGUES = [
  'urdu', 'dakhini', 'telugu', 'hindi', 'english', 'tamil', 'kannada', 'marathi', 'malayalam', 'arabic', 'bengali', 'other',
] as const;
export const EDUCATION = [
  'high_school', 'diploma', 'bachelors', 'masters', 'doctorate', 'professional', 'islamic', 'other',
] as const;
export const PROFESSION = [
  'it', 'engineering', 'healthcare', 'education', 'finance', 'government', 'business', 'skilled', 'homemaker', 'student',
  'not_employed', 'other',
] as const;
export const EMPLOYMENT_TYPE = ['private', 'government', 'self_employed', 'business_owner', 'not_applicable'] as const;
export const INCOME_BANDS = ['lt3', '3to5', '5to10', '10to20', '20to35', '35to50', 'gt50', 'undisclosed'] as const;
export const RELOCATE = ['yes', 'no', 'maybe'] as const;

export const MASLAK = ['sunni', 'shia', 'just_muslim', 'other', 'prefer_not'] as const;
/** Sub-maslak / school options per maslak. "other" pairs with the free-text maslakOther field. */
export const SUB_MASLAK: Record<string, readonly string[]> = {
  sunni: ['hanafi', 'shafii', 'maliki', 'hanbali', 'barelvi', 'deobandi', 'ahle_hadith', 'salafi', 'sufi', 'other'],
  shia: ['ithna_ashari', 'dawoodi_bohra', 'ismaili', 'zaidi', 'other'],
};
export const ALL_SUB_MASLAK = [...new Set(Object.values(SUB_MASLAK).flat())];
export const MAX_CHILDREN = 15;
export const CHILDREN_LIVE = ['yes', 'no', 'sometimes'] as const;
export const PRACTICE = ['regularly', 'mostly', 'sometimes', 'learning', 'prefer_not'] as const;
export const YES_NO_PNS = ['yes', 'no', 'prefer_not'] as const;
export const IMPORTANCE = ['very', 'somewhat', 'not_much', 'prefer_not'] as const;

export const FAMILY_TYPE = ['nuclear', 'joint', 'other'] as const;
export const FAMILY_VALUES = ['traditional', 'moderate', 'other', 'prefer_not'] as const;

export const REPORT_REASONS = ['fake', 'inappropriate', 'harassment', 'scam', 'already_married', 'other'] as const;

export const VISIBILITY = ['public', 'onConsent', 'hidden'] as const;

/** Structured locations: countries → states → districts/cities (full list in ./places). Manual entry is always allowed. */
export const LOCATIONS: Record<string, Record<string, Place>> = { India: INDIA, ...ABROAD };

export const COUNTRIES = Object.keys(LOCATIONS);
export const statesOf = (country?: string) => (country && LOCATIONS[country] ? Object.keys(LOCATIONS[country]) : []);
export const districtsOf = (country?: string, state?: string) =>
  (country && state && LOCATIONS[country]?.[state]?.districts) || [];
export const citiesOf = (country?: string, state?: string) => (country && state && LOCATIONS[country]?.[state]?.cities) || [];

export const COUNTRY_CODES = [
  { code: '+91', country: 'India' },
  { code: '+971', country: 'UAE' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+974', country: 'Qatar' },
  { code: '+965', country: 'Kuwait' },
  { code: '+968', country: 'Oman' },
  { code: '+1', country: 'USA / Canada' },
  { code: '+44', country: 'UK' },
  { code: '+61', country: 'Australia' },
];

/** Heights in cm from 4'6" to 7'0". */
export const HEIGHTS_CM: number[] = Array.from({ length: 78 }, (_, i) => 137 + i);
