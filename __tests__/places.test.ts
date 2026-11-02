import { ABROAD, INDIA } from '@/domain/places';
import { citiesOf, COUNTRIES, districtsOf, statesOf } from '@/domain/options';

describe('places for biodata and filters', () => {
  it('covers every Indian state and union territory', () => {
    expect(Object.keys(INDIA)).toHaveLength(36);
    for (const [s, p] of Object.entries(INDIA)) {
      expect(p.districts.length).toBeGreaterThan(0);
      expect(new Set(p.districts).size).toBe(p.districts.length);
      expect(new Set(p.cities).size).toBe(p.cities.length);
      expect(s.trim()).toBe(s);
    }
  });

  it('has all 33 Telangana and 26 Andhra Pradesh districts', () => {
    expect(districtsOf('India', 'Telangana')).toHaveLength(33);
    expect(districtsOf('India', 'Andhra Pradesh')).toHaveLength(26);
    expect(districtsOf('India', 'Telangana')).toEqual(expect.arrayContaining(['Hyderabad', 'Rangareddy', 'Medchal–Malkajgiri', 'Hanumakonda', 'Mulugu', 'Narayanpet']));
    expect(citiesOf('India', 'Telangana')).toEqual(expect.arrayContaining(['Hyderabad', 'Secunderabad', 'Zaheerabad', 'Bodhan', 'Kagaznagar']));
  });

  it('keeps every place name members could already have saved', () => {
    const old: [string, string, string][] = [
      ['India', 'Telangana', 'Warangal'], ['India', 'Andhra Pradesh', 'Vijayawada'], ['India', 'Karnataka', 'Bengaluru'],
      ['India', 'Maharashtra', 'Aurangabad'], ['India', 'Tamil Nadu', 'Chennai'], ['India', 'Delhi', 'New Delhi'],
      ['United Arab Emirates', 'Dubai', 'Dubai'], ['Saudi Arabia', 'Makkah', 'Jeddah'], ['Qatar', 'Doha', 'Doha'],
      ['United States', 'Texas', 'Dallas'], ['United Kingdom', 'England', 'London'], ['Canada', 'Ontario', 'Toronto'],
    ];
    for (const [c, s, city] of old) {
      expect(COUNTRIES).toContain(c);
      expect(statesOf(c)).toContain(s);
      expect(citiesOf(c, s)).toContain(city);
    }
    expect(Object.keys(ABROAD).length).toBeGreaterThanOrEqual(14);
  });
});
