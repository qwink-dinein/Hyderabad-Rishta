// Supabase Edge Function: onboarding-reminders (Deno). Called every 15 minutes by pg_cron (migration
// 20261127000000_reminders_sms.sql) with a job secret kept in Supabase Vault; verify_jwt = false because
// the caller is the database, and the secret is checked below. It can only ever send what the database
// marks as due (max 2 per member, never after the biodata is finished), so a stray call cannot spam.
// Secrets: WAPLIFY_API_KEY (already set), WAPLIFY_REMINDER_TEMPLATE (approved Utility template, English),
// optional WAPLIFY_REMINDER_TEMPLATE_UR / _TE, WAPLIFY_REMINDER_NAME_KEY (default "1"). Without the
// template nothing is sent. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
import { runOnce, type ReminderDeps } from './remind.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Response | Promise<Response>): void };
const env = (k: string) => Deno.env.get(k) ?? '';

const url = env('SUPABASE_URL');
const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
const rpc: ReminderDeps['rpc'] = async (fn, args) => {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const secret = req.headers.get('x-job-secret') ?? '';
  const ok = secret.length >= 32 && (await rpc('check_job_secret', { p_name: 'onboarding_reminders', p_secret: secret }).catch(() => false)) === true;
  if (!ok) return new Response('forbidden', { status: 403 });
  const out = await runOnce(
    {
      apiKey: env('WAPLIFY_API_KEY'),
      templates: { en: env('WAPLIFY_REMINDER_TEMPLATE'), ur: env('WAPLIFY_REMINDER_TEMPLATE_UR') || undefined, te: env('WAPLIFY_REMINDER_TEMPLATE_TE') || undefined },
      nameKey: env('WAPLIFY_REMINDER_NAME_KEY') || '1',
      baseUrl: env('WAPLIFY_BASE_URL') || undefined,
    },
    { fetch: (u, init) => fetch(u, init), log: (m) => console.log(m), rpc },
  );
  return Response.json(out);
});
