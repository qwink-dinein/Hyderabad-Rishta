import en from '@/i18n/en';
import te from '@/i18n/te';
import ur from '@/i18n/ur';
import urLatn from '@/i18n/urLatn';

/** Keys intentionally inherited from English (language names, numerals-only placeholders, month abbreviations). */
const ALLOWED_FALLBACK = [/^lang\.(en|ur|ur-Latn|te)$/, /^auth\.phonePlaceholder$/, /^opt\.months\./, /^err\.blocked$/, /^wizard\.leaveTitle$/, /^preview\.statusHelp\.none$/];

function flatten(obj: object, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(acc, flatten(v, key));
    else acc[key] = String(v);
    return acc;
  }, {});
}

const base = flatten(en);
const placeholders = (s: string) => (s.match(/{{\s*\w+\s*}}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort();

describe.each([
  ['ur', flatten(ur)],
  ['ur-Latn', flatten(urLatn)],
  ['te', flatten(te)],
])('%s translations', (_lang, tr) => {
  it('cover every user-facing key', () => {
    const missing = Object.keys(base).filter((k) => !(k in tr) && !ALLOWED_FALLBACK.some((r) => r.test(k)));
    expect(missing).toEqual([]);
  });
  it('have no keys that do not exist in English', () => {
    expect(Object.keys(tr).filter((k) => !(k in base))).toEqual([]);
  });
  it('keep the same interpolation placeholders', () => {
    const broken = Object.keys(tr).filter((k) => JSON.stringify(placeholders(tr[k])) !== JSON.stringify(placeholders(base[k])));
    expect(broken).toEqual([]);
  });
});

describe('Roman Urdu is its own language', () => {
  it('never falls back to Urdu script — a missing key shows English', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const i18n = require('i18next').createInstance();
    await i18n.init({
      resources: { en: { translation: { only: 'English text' } }, ur: { translation: { only: 'اردو متن' } }, 'ur-Latn': { translation: {} } },
      lng: 'ur-Latn', fallbackLng: 'en', load: 'currentOnly',
    });
    expect(i18n.t('only')).toBe('English text');
  });
  it('is written in English letters, not Urdu script, and is not a copy of English', () => {
    const tr = flatten(urLatn);
    const arabicScript = Object.entries(tr).filter(([, v]) => /[؀-ۿ]/.test(v));
    expect(arabicScript).toEqual([]);
    const same = Object.keys(tr).filter((k) => tr[k] === base[k] && /\s/.test(base[k]) && !/^(\{\{|Hyderabad Rishta|Assalamu)/.test(base[k]));
    // Familiar English product words (Profile views, Log in, Partner preferences…) stay on purpose.
    expect(same.length).toBeLessThan(70);
  });
});
