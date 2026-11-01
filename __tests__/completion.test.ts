import { buildSeed } from '@/data/seed';
import { profileCompletion, requiredProgress } from '@/domain/completion';
import type { Biodata } from '@/domain/types';
import { emptyBiodata, firstInvalidStep } from '@/domain/validation';

/** Biodata progress (owner request 2026-11-01): the % moves field by field and never lies about 100 %. */
describe('profile completion', () => {
  const full = (): Biodata => JSON.parse(JSON.stringify(buildSeed().profiles.find((p) => p.status === 'published')!.biodata));

  it('starts near 0 % and rises with every required field filled', () => {
    const b = emptyBiodata();
    const seen: number[] = [profileCompletion(b).percent];
    expect(seen[0]).toBeLessThan(10); // only the privacy defaults are pre-filled
    const steps: [keyof Biodata['basic'], unknown][] = [['createdFor', 'self'], ['lookingFor', 'bride'], ['fullName', 'Arif Hussain'], ['dob', '1995-04-02'], ['heightCm', 172]];
    for (const [k, v] of steps) {
      (b.basic as unknown as Record<string, unknown>)[k] = v;
      seen.push(profileCompletion(b).percent);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });

  it('a publishable biodata with optional extras missing is high but not 100 %', () => {
    const b = full();
    expect(firstInvalidStep(b)).toBe(-1);
    expect(requiredProgress(b)).toBe(1);
    b.basic.aboutMe = '';
    const c = profileCompletion(b);
    expect(c.percent).toBeGreaterThanOrEqual(85);
    expect(c.percent).toBeLessThan(100);
    expect(c.missing).toContain('about');
  });

  it('shows 100 % only when nothing is missing', () => {
    const b = full();
    const c = profileCompletion(b);
    if (c.missing.length) expect(c.percent).toBeLessThan(100);
    else expect(c.percent).toBe(100);
  });

  it('a field that becomes required (children after "divorced") joins the count', () => {
    const b = full();
    const before = requiredProgress(b);
    b.basic.maritalStatus = 'divorced';
    delete (b.basic as unknown as Record<string, unknown>).children;
    expect(requiredProgress(b)).toBeLessThanOrEqual(before);
  });
});
