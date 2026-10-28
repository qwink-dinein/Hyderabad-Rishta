// GENERATED from src/domain/phone.ts by scripts/sync-shared.js — do not edit here.
/**
 * One mobile number = one account. Every way of typing the same number collapses to one form:
 * spaces/dashes dropped, "+091"→"+91", trunk zeros dropped ("09000…"→"9000…"), a repeated country
 * code removed ("+91 91 9000…"). India (+91) must be a 10-digit mobile starting 6–9. Returns null if invalid.
 */
export function normalizePhone(countryCode: string, phone: string): { countryCode: string; phone: string } | null {
  const m = /^\+?0*([1-9]\d{0,2})$/.exec(String(countryCode ?? '').replace(/[\s()-]/g, ''));
  if (!m) return null;
  const cc = m[1];
  let num = String(phone ?? '').replace(/[\s().-]/g, '');
  if (num.startsWith('+')) {
    if (!num.startsWith(`+${cc}`)) return null;
    num = num.slice(cc.length + 1);
  }
  num = num.replace(/^0+/, '');
  if (!/^\d+$/.test(num)) return null;
  if (cc === '91') {
    if (num.length === 12 && num.startsWith('91')) num = num.slice(2);
    if (!/^[6-9]\d{9}$/.test(num)) return null;
  } else if (num.length < 6 || cc.length + num.length > 15) return null;
  return { countryCode: `+${cc}`, phone: num };
}
