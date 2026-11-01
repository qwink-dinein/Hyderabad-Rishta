// Core of the master-backup-phone Edge Function (unit-tested in __tests__/masterBackupPhone.test.ts).
// A master proves they hold a backup phone without that number ever being signed in:
//   { action: 'send', countryCode, phone }        → a 6-digit code goes to that number on WhatsApp
//   { action: 'verify', countryCode, phone, code } → right code: the backup phone is saved
// The caller is identified from their JWT; the database decides whether they are the master, applies
// the number rules and rate limits (backup_code_issue / backup_code_verify). Only an HMAC of the code,
// keyed with a server secret, is stored. The code is never logged or returned.
import { normalizePhone } from '../_shared/phone.ts';
import { sendOtp, type SendDeps, type WaplifyConfig } from '../send-whatsapp-otp/send.ts';

export interface BackupDeps {
  /** The signed-in caller's user id, or null when the token is missing or invalid. */
  caller(jwt: string | null): Promise<string | null>;
  /** Calls a service-role database function. Throws Error(message = the app error code, hint?) on failure. */
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** HMAC-SHA256 hex with the server secret. */
  hmac(message: string): Promise<string>;
  /** 6 random digits (crypto). */
  newCode(): string;
  waplify: WaplifyConfig;
  send: SendDeps;
}
export interface BackupResult {
  status: number;
  body: Record<string, unknown>;
}

const err = (status: number, error: string, extra: Record<string, unknown> = {}): BackupResult => ({ status, body: { error, ...extra } });
const STATUS: Record<string, number> = { forbidden: 403, invalid_state: 409, validation: 400, rate_limited: 429, not_found: 404, otp_expired: 410, invalid_otp: 400 };

export async function backupPhone(deps: BackupDeps, jwt: string | null, input: unknown): Promise<BackupResult> {
  const me = await deps.caller(jwt);
  if (!me) return err(401, 'unauthenticated');
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const n = normalizePhone(String(b.countryCode ?? ''), String(b.phone ?? ''));
  if (!n) return err(400, 'validation');
  const digest = (code: string) => deps.hmac(`backup:${me}:${n.countryCode}${n.phone}:${code}`);
  try {
    if (b.action === 'send') {
      const code = deps.newCode();
      await deps.rpc('backup_code_issue', { p_master: me, p_cc: n.countryCode, p_phone: n.phone, p_hash: await digest(code) });
      const sent = await sendOtp(deps.waplify, deps.send, { user: { phone: `${n.countryCode.slice(1)}${n.phone}` }, sms: { otp: code } });
      if (sent.status !== 200) {
        const e = (sent.body.error ?? {}) as { message?: string };
        return err(sent.status === 429 ? 429 : sent.status === 400 ? 400 : 503, sent.status === 429 ? 'rate_limited' : 'send_failed', { message: e.message });
      }
      return { status: 200, body: { sent: true } };
    }
    if (b.action === 'verify') {
      const code = String(b.code ?? '');
      if (!/^\d{6}$/.test(code)) return err(400, 'invalid_otp');
      const ok = await deps.rpc('backup_code_verify', { p_master: me, p_cc: n.countryCode, p_phone: n.phone, p_hash: await digest(code) });
      return ok === true ? { status: 200, body: { verified: true } } : err(400, 'invalid_otp');
    }
    return err(400, 'validation');
  } catch (e) {
    const code = String((e as Error).message ?? '').split(/[:\s]/)[0];
    const hint = (e as { hint?: string }).hint;
    if (code in STATUS) return err(STATUS[code], code, hint && /^\d+$/.test(hint) ? { retryAfter: Number(hint) } : {});
    return err(503, 'unavailable');
  }
}
