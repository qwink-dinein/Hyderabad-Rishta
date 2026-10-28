import en from '@/i18n/en';
import te from '@/i18n/te';
import ur from '@/i18n/ur';

/** Keys intentionally inherited from English (language names, numerals-only placeholders, month abbreviations). */
const ALLOWED_FALLBACK = [/^lang\.(en|ur|te)$/, /^auth\.phonePlaceholder$/, /^opt\.months\./, /^err\.blocked$/, /^wizard\.leaveTitle$/, /^preview\.statusHelp\.none$/];

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
