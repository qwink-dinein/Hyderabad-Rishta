// Core of the pin-login Edge Function (pure, unit-tested in __tests__/pinLoginEdge.test.ts).
// Returning login without an OTP: number + this phone's device key + 4-digit PIN. The database
// decides (pin_login_check: trusted device, lockout, suspension); only then is a session issued.
import { normalizePhone } from '../_shared/phone.ts';

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
export interface LoginDeps {
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** Issues a normal Supabase Auth session for this user (see index.ts). */
  mintSession(userId: string, phoneE164: string): Promise<Session>;
}
export interface LoginResult {
  status: number;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS: Record<string, number> = {
  validation: 400,
  device_not_trusted: 401,
  invalid_pin: 401,
  pin_not_set: 401,
  pin_locked: 423,
  account_removed: 403,
  account_suspended: 403,
};

export async function pinLogin(deps: LoginDeps, input: unknown): Promise<LoginResult> {
  const b = (input ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  const pin = str('pin');
  const deviceId = str('deviceId');
  const deviceSecret = str('deviceSecret');
  const phone = normalizePhone(str('countryCode'), str('phone'));
  if (!phone || !/^\d{4}$/.test(pin) || !UUID.test(deviceId) || deviceSecret.length < 32 || deviceSecret.length > 200) {
    return { status: 400, body: { error: 'validation' } };
  }
  const r = (await deps.rpc('pin_login_check', {
    p_country_code: phone.countryCode,
    p_phone: phone.phone,
    p_device_id: deviceId,
    p_device_secret: deviceSecret,
    p_pin: pin,
  })) as { ok?: boolean; error?: string; user_id?: string; phone?: string; attempts_left?: number; retry_at?: string; reset?: boolean } | null;
  if (!r?.ok || !r.user_id) {
    const error = r?.error ?? 'invalid_pin';
    return { status: STATUS[error] ?? 401, body: { error, attemptsLeft: r?.attempts_left, retryAt: r?.retry_at, reset: r?.reset } };
  }
  const session = await deps.mintSession(r.user_id, r.phone ?? `${phone.countryCode}${phone.phone}`);
  return { status: 200, body: { session } };
}
