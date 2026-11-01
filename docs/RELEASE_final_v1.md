# final_v1 — saved release (2026-11-01)

This file records exactly what "final_v1" is and how to get back to it. The git tag `final_v1` points at the
commit that contains this file. Tags are fixed: later work on any branch never changes what `final_v1` points to.

## What final_v1 contains
- **App:** the full Expo app (iOS, Android, web) — biodata, Discover with persistent rotation, Home/Discover
  sections, Featured with fair exposure, Boost (7/14/30, free or paid terms), interests, number sharing,
  shortlist, block/report, notifications, PIN login, WhatsApp login codes, admin console, master team and
  recovery, EN/UR/TE.
- **Backend (live Supabase project `hlthzrznuztapfsloxkm`, ap-south-1):** 30 migrations, 7 Edge Functions,
  6 scheduled jobs, all verified identical to this commit (below).
- **Not in final_v1 (planned next):** paid checkout (payment provider), phone push sending (FCM/APNs keys),
  store listing and legal documents.

## Verified at save time
| Check | Result |
|---|---|
| Typecheck (app + functions), lint | clean (0 errors, 2 known warnings) |
| Unit tests (Jest) | 302 passed |
| Database suites (`scripts/test-db.sh`) | 21 / 21 passed |
| Web end-to-end suites | 22 / 22 passed (last full run on the Boost Visibility build; later changes were server-side and covered by the live test) |
| Live end-to-end test against the real project | 5 / 5 passed |
| Real WhatsApp code to the owner's phone | delivered immediately |
| Live database vs this commit | all 30 migrations applied in order; all 160 public functions byte-identical (md5 of each definition) to the tested database; 31 tables; 32 security policies |

### Live Edge Functions at save time
Deployed from this commit's `supabase/functions/` (shared helpers bundled with each).
| Function | JWT check | Purpose |
|---|---|---|
| `send-whatsapp-otp` | off (signed Auth hook) | delivers login codes on WhatsApp (Waplify, template with Copy-code button) |
| `pin-login` | off (device key + PIN) | returning login without a code |
| `admin-create-member` | on | team adds a member's biodata |
| `photo-urls` | on | short-lived signed photo links |
| `delete-account` | on | member deletes their account and photos |
| `discover-feed` | on | Discover rotation feed and Home/Discover sections |
| `master-backup-phone` | on | master's backup phone with its own WhatsApp code |

### Scheduled jobs at save time
`hr-boost-jobs` (*/5), `hr-connection-jobs` (*/10), `hr-governance-jobs` (*/5), `hr-announcement-jobs` (*/5),
`hr-retention` (daily 21:17 UTC), `hr-feed-retention` (daily 21:41 UTC).

### Live settings stored as data (not code)
- Pricing (`pricing_config`, version 1): INR; publication free for both; Boost 7 days — bride free / groom ₹100
  (marked Popular), 14 days ₹200, 30 days ₹350 for both; admin approval required; interests expire after 14 days;
  reminder after 48 h, max 2 per 7 days; Discover cooldowns 3 days (seen card) / 7 days (opened profile).
  Boost/Featured switches not yet saved by an admin, so the defaults apply (Boost on, no photo rule, Featured on,
  12 cards, 3 days in any 7).
- Admin invites: 2 masters + 1 sub-admin (numbers kept only in the database, never in this repo).
- Dashboard settings and secrets (kept in Supabase, not in git): Phone provider on, Send SMS hook →
  `send-whatsapp-otp`, secrets `SEND_SMS_HOOK_SECRET`, `WAPLIFY_API_KEY`, `WAPLIFY_TEMPLATE_NAME`
  (`otp_authentiction`), `WAPLIFY_CODE_KEYS` (`1`), test numbers 919000000001/2/4 (code 123456, expiring).

## How to get back to final_v1

### The code (always possible)
```bash
git fetch origin --tags
git checkout final_v1                     # look at / build exactly this version
git switch -c restore-from-final_v1 final_v1   # or: start a new branch from it to continue work
```
Then install and check it works as saved:
```bash
npm ci
npx tsc --noEmit && npx expo lint && npx jest
```
App builds come from the same commit (`eas.json` profiles), so an EAS build of `final_v1` is this version.

### The live backend
The backend only changes when someone applies a new migration or deploys a function, so it stays at final_v1
until then. To return it to final_v1 after later changes:
1. **Edge Functions:** redeploy each function listed above from the `final_v1` checkout
   (`supabase/functions/<name>`, with `_shared/` and, for `master-backup-phone`, `send-whatsapp-otp/send.ts`).
   Use the JWT setting shown in the table.
2. **Database:** compare `supabase_migrations.schema_migrations` with `supabase/migrations/` in the checkout.
   Anything applied after `20261124000000_backup_phone_codes` belongs to later work: undo it with a new
   migration that reverses it (re-create the final_v1 versions of changed functions from these migration
   files). Never delete migration history rows. To check you are back, compare each function's
   `md5(pg_get_functiondef(oid))` with a test database built by `scripts/test-db.sh` from the checkout —
   they must all match, as they did at save time.
3. **Data** (members, biodatas, photos) is not part of git. Keep it safe with Supabase backups: upgrade to
   **Pro** before launch (daily backups); on Free there are no automatic backups.
4. **Dashboard settings and secrets** are listed above; re-enter them only if they were changed.

### Safety notes
- Never move or delete the `final_v1` tag; create `final_v2`, `final_v3`… for later releases.
- On GitHub you can protect it: Settings → Rules → Rulesets → New tag ruleset → target `final_v1` (or
  `final_*`) → block deletion and updates.
