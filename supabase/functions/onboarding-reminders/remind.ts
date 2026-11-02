// Core of the onboarding-reminders Edge Function (pure, testable in Jest). Owner request 2026-11-01/02:
// someone who verified their number but has not finished their biodata gets at most TWO WhatsApp
// reminders — about an hour after they stopped, and once more the next day — never at night, never after
// the biodata is finished. The database decides who is due (claim_onboarding_reminders, which also
// counts each reminder before it is sent, so no one is ever messaged twice for the same slot); this file
// only sends through Waplify with a Meta-approved Utility template and reports the outcome.
import { toWaplifyPhone, type SendDeps } from '../send-whatsapp-otp/send.ts';

export interface ReminderConfig {
  apiKey: string;
  /** Approved Utility template per language; English is the fallback. */
  templates: { en: string; ur?: string; te?: string };
  /** body_data key that receives the name ({{1}} in the template). */
  nameKey?: string;
  baseUrl?: string;
}

export interface DueReminder {
  user_id: string;
  phone: string;
  name: string | null;
  lang: string | null;
  n: number;
}

export interface ReminderDeps extends SendDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
}

/** Quiet hours: only 09:00–20:30 India time (UTC+5:30). */
export function withinSendingHours(now: Date): boolean {
  const ist = (now.getUTCHours() * 60 + now.getUTCMinutes() + 330) % 1440;
  return ist >= 9 * 60 && ist <= 20 * 60 + 30;
}

export const reminderConfigured = (c: ReminderConfig) => !!(c.apiKey && c.templates.en);

/** First name for the template ("Imran"), or a neutral phrase when the biodata has no name yet. */
export function displayName(name: string | null | undefined, lang?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{M}'.-]/gu, '').slice(0, 30);
  if (first) return first;
  return lang === 'ur' ? 'آپ کے گھر والے' : lang === 'ur-Latn' ? 'aap ke ghar wale' : lang === 'te' ? 'మీ కుటుంబ సభ్యుడు' : 'your family member';
}

export async function runOnce(cfg: ReminderConfig, deps: ReminderDeps, now = new Date(), batch = 50) {
  if (!reminderConfigured(cfg)) return { skipped: 'not configured', sent: 0, failed: 0 };
  if (!withinSendingHours(now)) return { skipped: 'quiet hours', sent: 0, failed: 0 };
  const due = ((await deps.rpc('claim_onboarding_reminders', { p_limit: batch })) as DueReminder[] | null) ?? [];
  let sent = 0;
  let failed = 0;
  for (const r of due) {
    const phone = toWaplifyPhone(r.phone);
    const template = (r.lang === 'ur' && cfg.templates.ur) || (r.lang === 'te' && cfg.templates.te) || cfg.templates.en;
    let ok = false;
    let error = '';
    if (phone) {
      try {
        const res = await deps.fetch(`${cfg.baseUrl ?? 'https://server.waplify.io'}/api/v1/messages/send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_name: template, contact_phone: phone, contact_name: displayName(r.name, 'en'), body_data: { [cfg.nameKey ?? '1']: displayName(r.name, r.lang) } }),
        });
        const out = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
        ok = res.status >= 200 && res.status < 300 && out.status === 'success';
        if (!ok) error = `${res.status} ${out.error ?? ''}`.trim();
      } catch {
        error = 'unreachable';
      }
    } else error = 'bad phone';
    // Never log the full number or the name.
    if (!ok) deps.log?.(`reminder failed ${error} to=…${(phone ?? '').slice(-4)}`);
    await deps.rpc('onboarding_reminder_result', { p_user: r.user_id, p_ok: ok, p_error: ok ? null : error.slice(0, 120) });
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}
