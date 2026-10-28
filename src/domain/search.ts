import { INCOME_BANDS } from './options';
import type { LookingFor, PartnerPreferences, PublicProfile } from './types';

/**
 * Discovery filters. Empty arrays / undefined mean "any".
 * Filters on OPTIONAL fields never exclude a profile that simply hasn't filled the field,
 * unless `strictOptional` is set (PRD §9.2). Filters on fields the owner keeps private are
 * evaluated against the projected (privacy-safe) profile, so hidden values cannot be probed.
 */
export interface SearchFilters {
  /** Which profile type to show (derived from the viewer's own "looking for"). */
  show?: LookingFor;
  ageMin?: number;
  ageMax?: number;
  heightMin?: number;
  heightMax?: number;
  maritalStatus: string[];
  countries: string[];
  states: string[];
  districts: string[];
  cities: string[];
  locality?: string;
  motherTongues: string[];
  education: string[];
  profession: string[];
  employmentType: string[];
  /** Minimum income band key — only matches profiles that publicly disclose income. */
  incomeMin?: string;
  maslak: string[];
  familyType: string[];
  familyValues: string[];
  relocation: string[];
  /** Free text matched against custom "Other" education/profession, details and city. */
  keyword?: string;
  boostedOnly: boolean;
  recentDays?: number;
  shortlistedOnly: boolean;
  strictOptional: boolean;
  sort: 'recommended' | 'recent';
}

export const EMPTY_FILTERS: SearchFilters = {
  maritalStatus: [],
  countries: [],
  states: [],
  districts: [],
  cities: [],
  motherTongues: [],
  education: [],
  profession: [],
  employmentType: [],
  maslak: [],
  familyType: [],
  familyValues: [],
  relocation: [],
  boostedOnly: false,
  shortlistedOnly: false,
  strictOptional: false,
  sort: 'recommended',
};

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/** Matches a required field: value must be in the list (if list non-empty). */
function inList(list: string[], value?: string): boolean {
  if (list.length === 0) return true;
  return !!value && list.map(norm).includes(norm(value));
}

/** Matches an optional field: missing values pass unless strict. */
function optionalInList(list: string[], value: string | undefined, strict: boolean): boolean {
  if (list.length === 0) return true;
  if (!value) return !strict;
  return list.map(norm).includes(norm(value));
}

/**
 * Education/profession filter. Selecting a predefined key matches it; selecting "other"
 * matches every custom value; a custom value (e.g. "Hafiz-e-Quran") matches that text.
 */
function matchesCustomList(list: string[], key: string, other?: string): boolean {
  if (list.length === 0) return true;
  const n = list.map(norm);
  if (n.includes(norm(key))) return true;
  if (key === 'other' && other && n.includes(norm(other))) return true;
  return false;
}

export function matchesFilters(
  p: PublicProfile,
  f: SearchFilters,
  ctx: { shortlisted?: Set<string>; now?: Date } = {},
): boolean {
  const strict = f.strictOptional;
  if (f.show && p.profileType !== f.show) return false;
  if (f.ageMin != null && p.age < f.ageMin) return false;
  if (f.ageMax != null && p.age > f.ageMax) return false;
  if (f.heightMin != null && p.heightCm < f.heightMin) return false;
  if (f.heightMax != null && p.heightCm > f.heightMax) return false;
  if (!inList(f.maritalStatus, p.maritalStatus)) return false;
  if (!inList(f.countries, p.location.country)) return false;
  if (!inList(f.states, p.location.state)) return false;
  if (!optionalInList(f.districts, p.location.district, strict)) return false;
  if (!inList(f.cities, p.location.city)) return false;
  if (f.locality && !norm(p.location.locality).includes(norm(f.locality))) {
    if (p.location.locality || strict) return false;
  }
  if (!inList(f.motherTongues, p.motherTongue)) return false;
  if (!matchesCustomList(f.education, p.career.education, p.career.educationOther)) return false;
  if (!matchesCustomList(f.profession, p.career.profession, p.career.professionOther)) return false;
  if (!optionalInList(f.employmentType, p.career.employmentType, strict)) return false;

  if (f.incomeMin) {
    const minIdx = INCOME_BANDS.indexOf(f.incomeMin as (typeof INCOME_BANDS)[number]);
    const idx = p.career.income ? INCOME_BANDS.indexOf(p.career.income as (typeof INCOME_BANDS)[number]) : -1;
    // Income filter only applies where disclosed (PRD §9.1); undisclosed passes unless strict.
    if (idx === -1) {
      if (strict) return false;
    } else if (idx < minIdx) return false;
  }

  if (!optionalInList(f.maslak, p.religion.maslak, strict)) return false;
  if (!optionalInList(f.familyType, p.family?.familyType, strict)) return false;
  if (!optionalInList(f.familyValues, p.family?.familyValues, strict)) return false;
  if (!optionalInList(f.relocation, p.location.willingToRelocate, strict)) return false;

  if (f.keyword) {
    const k = norm(f.keyword);
    const hay = [
      p.career.educationOther,
      p.career.educationDetails,
      p.career.professionOther,
      p.career.professionDetails,
      p.location.city,
      p.location.locality,
      p.location.district,
      p.displayName,
    ]
      .map(norm)
      .join(' | ');
    if (!hay.includes(k)) return false;
  }

  if (f.boostedOnly && !p.boosted) return false;
  if (f.recentDays && p.publishedAt) {
    const now = ctx.now ?? new Date();
    if (now.getTime() - new Date(p.publishedAt).getTime() > f.recentDays * 86400000) return false;
  }
  if (f.shortlistedOnly && !ctx.shortlisted?.has(p.id)) return false;
  return true;
}

/** Boosted first (promotional placement only), then most recently published. */
export function sortProfiles(list: PublicProfile[], sort: SearchFilters['sort']): PublicProfile[] {
  const byRecent = (a: PublicProfile, b: PublicProfile) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
  return [...list].sort((a, b) => {
    if (sort === 'recommended' && a.boosted !== b.boosted) return a.boosted ? -1 : 1;
    return byRecent(a, b);
  });
}

/** Builds filters from the viewer's partner preferences (non-strict by default). */
export function filtersFromPreferences(prefs: PartnerPreferences, show?: LookingFor): SearchFilters {
  return {
    ...EMPTY_FILTERS,
    show,
    ageMin: prefs.ageMin,
    ageMax: prefs.ageMax,
    heightMin: prefs.heightMin,
    heightMax: prefs.heightMax,
    maritalStatus: [...prefs.maritalStatus],
    education: [...prefs.education],
    profession: [...prefs.profession],
    countries: [...prefs.countries],
    states: [...prefs.states],
    cities: [...prefs.cities],
    motherTongues: [...prefs.motherTongues],
    relocation: prefs.relocation && prefs.relocation !== 'any' ? [prefs.relocation] : [],
  };
}

/** Number of active (non-default) filters — used for the chip bar and badge. */
export function activeFilterCount(f: SearchFilters): number {
  let n = 0;
  const arrays: (keyof SearchFilters)[] = [
    'maritalStatus', 'countries', 'states', 'districts', 'cities', 'motherTongues', 'education', 'profession',
    'employmentType', 'maslak', 'familyType', 'familyValues', 'relocation',
  ];
  for (const k of arrays) n += (f[k] as string[]).length;
  if (f.ageMin != null || f.ageMax != null) n++;
  if (f.heightMin != null || f.heightMax != null) n++;
  if (f.incomeMin) n++;
  if (f.keyword) n++;
  if (f.locality) n++;
  if (f.boostedOnly) n++;
  if (f.recentDays) n++;
  if (f.shortlistedOnly) n++;
  return n;
}
