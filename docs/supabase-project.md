# Live Supabase project

| | |
|---|---|
| Organization | Hyderabad-rishta-app (`trjuminwjraajcvbuxbk`), **Free** plan |
| Project | `hyderabad-rishta` — ref **`hlthzrznuztapfsloxkm`** |
| Region | ap-south-1 (Mumbai) |
| API URL | `https://hlthzrznuztapfsloxkm.supabase.co` |
| Public (anon) key | via `get_publishable_keys` / dashboard → Settings → API (safe to ship in the app; RLS protects data) |
| Created | 2026-10-29 |

## State (2026-10-29)
- **Database:** all 20 migrations in `supabase/migrations` applied and recorded in
  `supabase_migrations.schema_migrations` (so `supabase db push` only sends new ones). 28 tables, RLS on all,
  private `profile-photos` bucket, pricing row seeded.
- **Advisors:** security + performance follow-ups applied (`20261113000000_advisor_hardening`,
  `20261114000000_rls_initplan`). Remaining notices are by design: member RPCs are SECURITY DEFINER and check
  the caller inside (covered by `supabase/tests/60_attacks.test.sql`); private tables with RLS and no
  policies are reachable only through those functions; "unused index" = no data yet.
- **Edge Functions deployed:** `send-whatsapp-otp` (no JWT; hook signature), `pin-login` (no JWT; device
  key + PIN), `admin-create-member` (JWT + is_admin). Smoke-tested live: unsigned/invalid calls refused.
  `tmp-migrate` is a retired one-off setup function that now only returns 410 — delete it in the dashboard.
- **Not yet deployed:** `push-dispatch` (needs FCM/APNs keys + pg_cron schedule).
- **App:** still runs on the demo backend until the Supabase adapter (Phase 2) lands.

## Owner dashboard steps still to do
1. Authentication → Sign In / Providers → **Phone**: enable. Also enable phone + password sign-in (used
   internally by `pin-login`; members never see a password).
2. Authentication → Hooks → **Send SMS hook** → HTTPS →
   `https://hlthzrznuztapfsloxkm.supabase.co/functions/v1/send-whatsapp-otp` → generate secret.
3. Edge Functions → Secrets: `SEND_SMS_HOOK_SECRET`, `WAPLIFY_API_KEY`, `WAPLIFY_TEMPLATE_NAME`
   (`hr_login_otp`), `WAPLIFY_CODE_KEYS` (`1`). See `docs/whatsapp-otp-setup.md`.
4. Authentication → Phone → Test phone numbers: `919000000001` = `123456` (store reviewers).
5. Before launch: upgrade the organization to **Pro** (daily backups, no pausing).
