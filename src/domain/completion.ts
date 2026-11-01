import type { Biodata } from './types';
import { emptyBiodata, STEP_KEYS, STEP_SCHEMAS, stepErrors } from './validation';

/**
 * Profile completion (owner PRD 2026-10-29), computed from the biodata the member actually filled in.
 * Photos and sensitive optional details (income, employer, contact) never count against them.
 */
export type CompletionKey = 'basic' | 'about' | 'location' | 'career' | 'religion' | 'practice' | 'family' | 'preferences' | 'privacy';

interface Item {
  key: CompletionKey;
  /** Biodata wizard step that holds this item. */
  step: number;
  weight: number;
  done: (b: Biodata) => boolean;
}

const filled = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : v != null);

const ITEMS: Item[] = [
  { key: 'basic', step: 0, weight: 3, done: (b) => STEP_SCHEMAS[0].safeParse(b.basic).success },
  { key: 'about', step: 0, weight: 1, done: (b) => (b.basic.aboutMe ?? '').trim().length >= 20 },
  { key: 'location', step: 1, weight: 2, done: (b) => STEP_SCHEMAS[1].safeParse(b.location).success },
  { key: 'career', step: 2, weight: 2, done: (b) => STEP_SCHEMAS[2].safeParse(b.career).success },
  { key: 'religion', step: 3, weight: 1, done: (b) => STEP_SCHEMAS[3].safeParse(b.religion).success && filled(b.religion.maslak) },
  { key: 'practice', step: 3, weight: 1, done: (b) => filled(b.religion.namaz) },
  { key: 'family', step: 4, weight: 2, done: (b) => STEP_SCHEMAS[4].safeParse(b.family).success && filled(b.family.familyType) && (filled(b.family.fatherOccupation) || filled(b.family.motherOccupation)) },
  { key: 'preferences', step: 5, weight: 2, done: (b) => STEP_SCHEMAS[5].safeParse(b.preferences).success && b.preferences.ageMin != null && b.preferences.ageMax != null },
  { key: 'privacy', step: 6, weight: 1, done: (b) => STEP_SCHEMAS[6].safeParse(b.privacy).success },
];

/** The profile counts as complete at this percentage (all listed items). */
export const PROFILE_COMPLETE_AT = 100;

export interface Completion {
  percent: number;
  complete: boolean;
  /** First missing item, in wizard order — where "Complete profile" takes the member. */
  next?: { key: CompletionKey; step: number };
  missing: CompletionKey[];
}

/** Required fields per step, counted on an empty biodata (the fixed denominator). */
let baseRequired: Set<string>[] | undefined;
const requiredBase = () =>
  (baseRequired ??= STEP_KEYS.map((k, i) => new Set(Object.keys(stepErrors(i, emptyBiodata()[k as keyof Biodata])).map((f) => f.split('.')[0]))));

/**
 * How much of the required information is filled, field by field (0–1). Conditional fields that become
 * required (e.g. number of children once "divorced" is chosen) join the count while they apply.
 */
export function requiredProgress(b: Biodata): number {
  const base = requiredBase();
  let total = 0;
  let left = 0;
  STEP_KEYS.forEach((k, i) => {
    let missing: Set<string>;
    try {
      missing = new Set(Object.keys(stepErrors(i, b[k as keyof Biodata])).map((f) => f.split('.')[0]));
    } catch {
      missing = new Set(base[i]);
    }
    const extra = [...missing].filter((f) => !base[i].has(f)).length;
    total += base[i].size + extra;
    left += missing.size;
  });
  return total ? Math.max(0, total - left) / total : 1;
}

/** Required information counts 85 % (field by field, so the number moves as you type); recommended extras 15 %. */
const REQUIRED_SHARE = 0.85;

export function profileCompletion(b: Biodata | undefined | null): Completion {
  if (!b) return { percent: 0, complete: false, next: { key: 'basic', step: 0 }, missing: ITEMS.map((i) => i.key) };
  let total = 0;
  let got = 0;
  const missing: Item[] = [];
  for (const it of ITEMS) {
    total += it.weight;
    let ok = false;
    try {
      ok = it.done(b);
    } catch {
      ok = false; // a malformed section simply counts as not done
    }
    if (ok) got += it.weight;
    else missing.push(it);
  }
  // Floor (not round): never show 100 % while something is still missing.
  const raw = REQUIRED_SHARE * requiredProgress(b) + (1 - REQUIRED_SHARE) * (got / total);
  const percent = missing.length ? Math.min(99, Math.floor(raw * 100)) : 100;
  return { percent, complete: percent >= PROFILE_COMPLETE_AT, next: missing[0] && { key: missing[0].key, step: missing[0].step }, missing: missing.map((m) => m.key) };
}
