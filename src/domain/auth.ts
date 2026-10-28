/**
 * OTP registration + 4-digit PIN login (Mini PRD, 2026-10-28).
 *
 * Security model (same in the demo backend and the Supabase design, Architecture.md §16):
 *  - OTP proves the number: first registration, a new phone, Forgot PIN, and setting up a PIN on an
 *    account that existed before PINs. Nothing else sends an OTP.
 *  - A PIN is never enough on its own: PIN login also needs this phone's device key (a random secret
 *    created when the number was verified on it, kept in the Keychain/Keystore). A stolen PIN is
 *    useless on another phone, and a stolen phone still needs the PIN.
 *  - The PIN is stored only as a salted, slow hash. Wrong PINs are counted on the SERVER per account:
 *    a short lock after 5, and after 10 in a day only Forgot PIN (OTP) unlocks it.
 *  - Sessions are server records (a random token; only its hash is stored). They last until logout,
 *    revocation, a PIN reset (other phones are signed out), an admin suspension, or 180 idle days.
 */

export const PIN_LENGTH = 4;
/** Wrong PINs in a row before a temporary lock. */
export const PIN_SOFT_LIMIT = 5;
export const PIN_SOFT_LOCK_MS = 15 * 60 * 1000;
/** Wrong PINs within 24 h before only an OTP reset can unlock the account. */
export const PIN_HARD_LIMIT = 10;
/** Setting/resetting a PIN with an OTP must happen soon after that OTP was verified. */
export const PIN_OTP_WINDOW_MS = 10 * 60 * 1000;
/** A session nobody has used for this long expires (security policy; normal use keeps it alive). */
export const SESSION_IDLE_MS = 180 * 86400 * 1000;

/** PINs anyone would guess first. Rejected when a PIN is created. */
const WEAK = new Set(['1234', '4321', '0123', '3210', '1122', '1212', '6969', '1010', '2580', '0852', '1004', '2000', '2020', '2024', '2025', '2026']);

/** Null when the PIN is acceptable, else an i18n key. */
export function pinProblem(pin: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return 'pin.mustBe4';
  if (/^(\d)\1+$/.test(pin) || WEAK.has(pin)) return 'pin.tooEasy';
  const d = pin.split('').map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return 'pin.tooEasy';
  return null;
}

/** Digits only, at most 4 — handles typing, paste ("12 34"), and autofill. */
export const cleanPin = (v: string) => v.replace(/\D/g, '').slice(0, PIN_LENGTH);

export interface PinAttemptState {
  /** Consecutive wrong PINs since the last success. */
  streak: number;
  /** Wrong-PIN timestamps (ms) in the last 24 h. */
  recent: number[];
  lockedUntil?: number;
  /** Too many wrong PINs: only Forgot PIN (OTP) unlocks. */
  hardLocked?: boolean;
}

/** Pure lockout rule shared by the demo backend and tests. */
export function afterWrongPin(s: PinAttemptState, now: number): PinAttemptState {
  const recent = [...s.recent.filter((t) => now - t < 86400000), now];
  const streak = s.streak + 1;
  if (recent.length >= PIN_HARD_LIMIT) return { streak, recent, hardLocked: true };
  return { streak, recent, lockedUntil: streak % PIN_SOFT_LIMIT === 0 ? now + PIN_SOFT_LOCK_MS : s.lockedUntil };
}

export const attemptsLeft = (s: PinAttemptState) => (s.hardLocked ? 0 : PIN_SOFT_LIMIT - (s.streak % PIN_SOFT_LIMIT));
