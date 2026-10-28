/** Pure formatting / calculation helpers (unit-tested in __tests__/domain.test.ts). */

/** Age in whole years from an ISO date (YYYY-MM-DD). Returns NaN for invalid input. */
export function ageFromDob(dob: string, now: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? '');
  if (!m) return NaN;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (birth.getUTCFullYear() !== y || birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return NaN;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

/** 165 → 5′ 5″ (165 cm) */
export function formatHeight(cm: number, withCm = true): string {
  if (!cm || Number.isNaN(cm)) return '—';
  const totalIn = Math.round(cm / 2.54);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  return withCm ? `${ft}′ ${inch}″ (${cm} cm)` : `${ft}′ ${inch}″`;
}

export function formatMoney(amount: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${amount.toLocaleString('en-IN')}`;
}

const DATE_LOCALES = { en: 'en-GB', ur: 'ur-PK', te: 'te-IN' } as const;
let dateLang: keyof typeof DATE_LOCALES = 'en';
/** Called when the app language changes, so dates read naturally inside Urdu/Telugu sentences. */
export function setDateLanguage(lang: keyof typeof DATE_LOCALES) {
  dateLang = lang;
}

/** "27 Oct 2026" / "27 اکتوبر، 2026" / "27, అక్టో 2026". Pass `lang` to pin it (the admin console uses 'en'). */
export function formatDate(iso?: string, lang: keyof typeof DATE_LOCALES = dateLang): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const opts = { day: 'numeric', month: 'short', year: 'numeric' } as const;
  try {
    return d.toLocaleDateString(DATE_LOCALES[lang], opts);
  } catch {
    return d.toLocaleDateString('en-GB', opts); // runtimes without that locale's data
  }
}

export function displayNameFor(fullName: string, pref: 'full' | 'first' | 'initials'): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (pref === 'full') return parts.join(' ');
  if (pref === 'first') return parts[0];
  return parts.map((p) => `${p[0].toUpperCase()}.`).join(' ');
}


export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '••••';
  return `${'•'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}

export function uid(prefix = ''): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${prefix}${t}${rnd}`;
}
