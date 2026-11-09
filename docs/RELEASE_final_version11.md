# final_version11 — saved release (2026-11-09)

This file records exactly what "final_version11" is and how to get back to it. The GitHub branch
`final_version11` points at the commit that contains this file. Nobody pushes to it: later work goes on other
branches, so `final_version11` keeps pointing at this version. (Earlier saves: `final_v1`, `final_v2`,
`final_version6`, `final_version10` — see `docs/RELEASE_final_version10.md`.)

## What changed since final_version10
- **Lavender palette** (deep violet `#3F2F48`, cream `#F4EEE8`, soft champagne buttons `#D8C49A`) across the
  app, the website, the logo, app icons and the website phone mock-ups — `docs/design/lavender-palette.md`.
- **"Wedding card" typography** on app and website: Cormorant Garamond headings, Great Vibes accent, Lato body.
  Hero: "Bringing Hyderabad's Muslim Families Closer…" then *One Rishta at a Time.* on one line on every phone.
- **Photo on Request:** one static blurred placeholder with a lock (`assets/placeholders/photo-on-request.webp`)
  replaces the bride/groom illustrations, for locked photos and for profiles without photos.
- **Phone-number visibility (consent-based):** members choose "Everyone" or "Only people I consent to" for
  their number (`privacy.phoneVisibility`). Admin → Pricing → "Privacy for new members" sets the starting
  choice per side (default: grooms photo + number public, brides both private). Never overrides a member's
  own choice; existing members stay private. Migration `20261206000000_phone_visibility`.
- **Wording:** "You choose who sees your number" on the website, store listing, app and privacy policy.
- **Admin pricing save** now keeps the Boost/Featured switches (bug fix).
- **SEO:** IndexNow key file; website phone mock-up no longer cut off.

## Verified at save time
| Check | Result |
|---|---|
| Unit tests (Jest) | 400 passed |
| Database test suites (local Postgres) | 31 passed |
| Website build + `website/check.mjs` | passed |
| Live website https://hyderabadrishta.com | serves this version (deploy branch `claude/sharp-bell-xxyxmj` @ `e9981d5`) |
| Live database vs this commit | 41 migrations applied, latest `20261206000000_phone_visibility`; `20261127000000_reminders_sms` not applied, by design |

### Live backend at save time (Supabase project `hlthzrznuztapfsloxkm`)
Edge Functions unchanged since final_version10: `send-whatsapp-otp` v5, `pin-login` v6, `admin-create-member` v4,
`photo-urls` v4, `delete-account` v5, `discover-feed` v8, `master-backup-phone` v5, `purge-deleted-accounts` v1,
`push-dispatch` v1, `tmp-clear-photos` v2 (leftover stub, safe to delete).

### Build at save time
- **Android APK (tester build):** built locally on the owner's Mac from commit `8aa3d3e` (same app code as this
  branch) — Google Drive file `1aIIxL4Rk6iwOdxpDGDp7MPn8WrbjMLZT`, linked from the website's Android badge.
- EAS free Android builds are used up until 2026-12-01; local build:
  `npx eas-cli@latest build --platform android --profile preview --local`.

## How to get back to final_version11

### The code
```bash
git fetch origin final_version11
git checkout -b restore-from-final_version11 origin/final_version11
npm ci
npx tsc --noEmit && npx expo lint && npx jest
```
Build the app from that checkout (command above) to get this exact version.

### The website
Push this branch's tree to the Cloudflare deploy branch (`claude/sharp-bell-xxyxmj`). Build: `node website/build.mjs`.

### The live backend
1. **Edge Functions:** redeploy from the `final_version11` checkout with the versions/JWT settings above.
2. **Database:** anything applied after `20261206000000_phone_visibility` is later work — undo it with a new
   migration that re-creates the final_version11 versions of changed functions. Never delete migration rows.
3. **Settings** (referral mode, Boost prices, privacy defaults) are data: restore them in the admin console.
4. **Members' data** is not in git: use Supabase backups.

### Safety notes
- Never push to `final_version11`; create `final_version12`… for later releases.
- Lock it on GitHub: Settings → Rules → Rulesets → target `final_*` → restrict updates and deletions.
