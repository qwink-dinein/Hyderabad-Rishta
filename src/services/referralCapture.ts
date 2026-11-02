import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeReferralCode } from '@/domain/referral';
import { AppError, type Backend } from './backend';

/**
 * The invitation code a family arrived with (link …/r/CODE or …?ref=CODE, or typed at sign-up), kept on this
 * phone until the new account is created and the server attaches it. The server decides eligibility; a code
 * the server refuses for good is forgotten so it is never retried.
 */
const KEY = 'hr.ref';
const MAX_AGE_MS = 30 * 86400000;

export async function savePendingReferral(code: string | null | undefined): Promise<string | null> {
  const c = normalizeReferralCode(code);
  try {
    if (c) await AsyncStorage.setItem(KEY, JSON.stringify({ code: c, at: Date.now() }));
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the field on the sign-up screen still works for this session
  }
  return c;
}

export async function getPendingReferral(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: string; at?: number };
    if (!v.code || !v.at || Date.now() - v.at > MAX_AGE_MS) return null;
    return normalizeReferralCode(v.code);
  } catch {
    return null;
  }
}

export async function clearPendingReferral() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

const FINAL: string[] = ['referral_invalid', 'referral_self', 'referral_locked', 'referral_not_eligible', 'referral_closed'];

/**
 * Right after an OTP sign-in: attach the pending code (if any). Never blocks or fails the sign-in — returns
 * the refusal code (for a gentle notice) or null. Existing accounts are refused by the server ('locked').
 */
export async function claimPendingReferral(backend: Pick<Backend, 'claimReferral'>, isNew: boolean): Promise<string | null> {
  const code = await getPendingReferral();
  if (!code) return null;
  if (!isNew) {
    await clearPendingReferral(); // an existing member opened someone's link: nothing to attach
    return null;
  }
  try {
    await backend.claimReferral(code);
    await clearPendingReferral();
    return null;
  } catch (e) {
    const c = e instanceof AppError ? e.code : 'network';
    if (FINAL.includes(c)) await clearPendingReferral();
    return c;
  }
}
