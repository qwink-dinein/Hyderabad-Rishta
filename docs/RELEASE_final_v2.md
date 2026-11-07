# final_v2 — saved release (2026-11-01)

This file records exactly what "final_v2" is and how to get back to it. The GitHub branch `final_v2` points at
the commit that contains this file. Nobody pushes to it: later work goes on other branches, so `final_v2` keeps
pointing at this version. (`final_v1` is kept the same way; see `docs/RELEASE_final_v1.md`.)

## What changed since final_v1
- **Opposite side only:** a bride only ever sees grooms and a groom only brides — Featured, New, Recommended,
  All, Home sections, search — whatever the Bride/Groom filter says. Enforced on the server (database
  `search_profiles` and the `discover-feed` function), not only in the app.
- **Login-first opening screen:** the app opens on Log in — mobile number (always blank, typed every time, so
  any member can log in from any phone) + 4-digit PIN. Forgot PIN and "Log in with WhatsApp code" under the
  button. A phone that never verified the number gets a one-time WhatsApp code automatically. Below:
  "Create your biodata →" and "Find your match" (option C). The old landing page is at /welcome (How it works).
- **Completion names the exact field:** the six recommended fields that keep a "full" biodata at 99 % (About me
  20+ characters, Maslak, Namaz, Family type, a parent's occupation, Partner age range) are listed by name on
  the Home card; tapping opens the form scrolled to that field and highlights it. In the form they say "Counts
  toward 100%". 100 % appears exactly when nothing is left.
- **Earlier today, also in v2:** Discover redesign (tabs + premium cards), screen states (offline, slow network,
  errors, no results, permissions, session expiry, success), live biodata progress per section.
- **My Boost / Home numbers:** proven to move with real activity (other members' views, shortlists, interests;
  own views, team views and refreshes within 30 minutes never count) and now refresh every 30 s on screen and
  when the app is reopened.
- **App icon:** the brand's gold emblem on the dark green (replaces Expo's placeholder), Android adaptive +
  themed (monochrome) icons, the emblem on the ivory opening screen, matching web favicon. Name under the icon:
  "Hyderabad Rishta" (iPhone shortens it on the home screen). Preview: `docs/mockups/app-icon.png`.
- **Support / privacy contact:** mukarramjahmm@gmail.com on Help & support, the privacy policy, and the
  "contact support" messages (account removed / suspended, biodata removed, safety review). EN/UR/TE.
- **Not in final_v2 (planned next):** paid checkout (payment provider), phone push sending (FCM/APNs keys),
  store listing and lawyer-reviewed legal documents.

## Verified at save time
| Check | Result |
|---|---|
| Typecheck (app + functions), lint | clean (0 errors, 2 known warnings) |
| Unit tests (Jest) | 324 passed (5 live tests skipped offline) |
| Database suites (`scripts/test-db.sh`) | 22 / 22 passed |
| Web end-to-end suites | 24 / 24 passed (full run; boost re-run after updating its wording check; smoke, home, boost, states, pin re-run on the final build) |
| Live end-to-end test against the real project | 5 / 5 passed — incl. the opposite-side check and the My Boost / Home numbers (another member's view, shortlist and interest show up; own views don't) |
| Real WhatsApp code to the owner's phone | delivered; code verified by the live server (session then signed out) |
| Live database vs this commit | 31 migrations applied (latest `20261125000000_member_side`); all 160 public functions byte-identical (md5 of each definition) to the tested database |

### Live Edge Functions at save time
| Function | Version | JWT check | Purpose |
|---|---|---|---|
| `send-whatsapp-otp` | 5 | off (signed Auth hook) | login codes on WhatsApp (Waplify, Copy-code button) |
| `pin-login` | 6 | off (device key + PIN) | returning login without a code |
| `admin-create-member` | 4 | on | team adds a member's biodata |
| `photo-urls` | 4 | on | short-lived signed photo links |
| `delete-account` | 4 | on | member deletes their account and photos |
| `discover-feed` | 7 | on | Discover feed + sections; member's own side always wins |
| `master-backup-phone` | 5 | on | master's backup phone with its own WhatsApp code |

`discover-feed` v7 was deployed with types stripped (same logic as `supabase/functions/discover-feed` and its
`_shared/` helpers in this commit); redeploying from source gives the same behaviour.

### Unchanged since final_v1
Scheduled jobs (6), pricing settings, admin invites (2 masters + 1 sub-admin, numbers only in the database),
dashboard settings and secrets — all as listed in `docs/RELEASE_final_v1.md`.

## How to get back to final_v2

### The code (always possible)
```bash
git fetch origin final_v2
git checkout -b restore-from-final_v2 origin/final_v2
npm ci
npx tsc --noEmit && npx expo lint && npx jest
```
An EAS build from this branch is this version (`eas.json` profiles).

### The live backend
It only changes when someone applies a migration or deploys a function. To return it to final_v2 later:
1. **Edge Functions:** redeploy each function above from the `final_v2` checkout (`supabase/functions/<name>`
   with `_shared/`; for `master-backup-phone` also `send-whatsapp-otp/send.ts`), with the JWT setting shown.
2. **Database:** anything applied after `20261125000000_member_side` is later work — undo it with a new
   migration that re-creates the final_v2 versions of changed functions from these migration files. Never
   delete migration history rows. Check with `md5(pg_get_functiondef(oid))` against a test database built by
   `scripts/test-db.sh` from the checkout — all must match, as they did at save time.
3. **Data** (members, biodatas, photos) is not in git: use Supabase backups (Pro plan before launch).
4. **Dashboard settings and secrets:** see `docs/RELEASE_final_v1.md`; re-enter only if changed.

### Safety notes
- Never push to `final_v2`; create `final_v3`… for later releases.
- On GitHub you can lock it: Settings → Rules → Rulesets → New branch ruleset → target `final_*` → restrict
  updates and deletions.
