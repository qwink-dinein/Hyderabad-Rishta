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

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function displayNameFor(fullName: string, pref: 'full' | 'first' | 'initials'): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (pref === 'full') return parts.join(' ');
  if (pref === 'first') return parts[0];
  return parts.map((p) => `${p[0].toUpperCase()}.`).join(' ');
}

/** Privacy-safe identifier shown instead of a name, e.g. "HR-4F2A". */
export function profileCode(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `HR-${h.toString(16).toUpperCase().slice(0, 4).padStart(4, '0')}`;
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
