# Live Supabase project

| | |
|---|---|
| Organization | Hyderabad-rishta-app (`trjuminwjraajcvbuxbk`), **Free** plan |
| Project | `hyderabad-rishta` — ref **`hlthzrznuztapfsloxkm`** |
| Region | ap-south-1 (Mumbai) |
| API URL | `https://hlthzrznuztapfsloxkm.supabase.co` |
| Public (anon) key | via `get_publishable_keys` / dashboard → Settings → API (safe to ship in the app; RLS protects data) |
| Created | 2026-10-29 |

## State (2026-10-31)
- **Database:** every migration in `supabase/migrations` is applied and recorded in
  `supabase_migrations.schema_migrations` (latest `20261121000000_scheduled_jobs`). Each function added after
  the first setup was verified live by comparing `md5(pg_get_functiondef)` with the tested local database.
- **Server API for the app:** member functions (`20261117`, `20261118`), admin console (`20261119`), pricing
  with connection rules (`20261120`), account bootstrap + two masters (`20261115`, `20261116`).
- **Scheduled jobs (pg_cron, active):** `hr-boost-jobs` and `hr-governance-jobs` and `hr-announcement-jobs`
  every 5 min, `hr-connection-jobs` every 10 min, `hr-retention` daily 02:47 IST.
- **Edge Functions:** `send-whatsapp-otp` (hook signature), `pin-login` (device key + PIN), `admin-create-member`
  (JWT + is_admin), `photo-urls` (signs only database-approved photo paths), `delete-account` (own account;
  masters refused). `tmp-migrate` is a retired one-off (410) — delete it in the dashboard.
- **App:** `src/services/supabase/supabaseBackend.ts` implements the whole `Backend` contract on this project.
  `src/services/index.ts` uses it whenever `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` are set — `eas.json` sets
  them for development, preview and production builds; the web preview and tests stay on the demo.
- **Admins:** live invites (data only, not in this repo): 2 masters + 1 sub-admin. `ensure_account()` gives the
  role on first WhatsApp sign-in. PINs are never pre-set.
- **Not live yet:** paid checkout (payment provider), push sending (`push-dispatch` + FCM/APNs keys), master
  backup-phone verification, photos in team-added biodatas (members add them after claiming).
- **Live end-to-end test:** `__tests__/live/supabaseLive.test.ts` (skipped unless `LIVE_SUPABASE=1`) — needs the
  test phone numbers below.

## Owner dashboard steps still to do
1. Authentication → Sign In / Providers → **Phone**: enable. Also enable phone + password sign-in (used
   internally by `pin-login`; members never see a password).
2. Authentication → Hooks → **Send SMS hook** → HTTPS →
   `https://hlthzrznuztapfsloxkm.supabase.co/functions/v1/send-whatsapp-otp` → generate secret.
3. Edge Functions → Secrets: `SEND_SMS_HOOK_SECRET`, `WAPLIFY_API_KEY`, `WAPLIFY_TEMPLATE_NAME`
   (the exact Waplify template name, live: `otp_authentiction`), `WAPLIFY_CODE_KEYS` (`1`). See `docs/whatsapp-otp-setup.md`.
4. Authentication → Phone → Test phone numbers, each with code `123456`: `919000000001` (store reviewers + live
   test bride), `919000000002` (live test groom), `919000000004` (live test admin).
5. Before launch: upgrade the organization to **Pro** (daily backups, no pausing).
