# final_version6 — saved release (2026-11-07)

This file records exactly what "final_version6" is and how to get back to it. The GitHub branch
`final_version6` points at the commit that contains this file. Nobody pushes to it: later work goes on other
branches, so `final_version6` keeps pointing at this version. (Earlier saves: `final_v1`, `final_v2`.)

## What changed since final_v2
- **Onboarding redesign:** see matches first, one-number sign-up, 7 answers to go live, one question per screen,
  bride/groom on its own screen, own age and home asked (not the partner's), fits small Android phones.
- **Discover and profiles:** Filters in a row above the cards, more details on profile cards, search 2.5× faster.
- **Connections:** shared number and photos easy to find after acceptance; numbers show for both when both
  press Share my number; own photo adjust screen.
- **Languages:** Roman Urdu added (shown as "Urdu") — English, Urdu, Roman Urdu, Telugu.
- **Brand and legal:** owner's logo on every icon and in the app; final privacy policy and terms; support
  email `mukarramjahmm@gmail.com`.
- **Referral free Boosts:** member and admin screens; referral mode shows no plans; free Boost needs own
  biodata 100%; domain `hyderabadrishta.com` links, invitation page, Android App Links.
- **Free Boosts only through referrals (7 Nov):** a Boost plan is never free (app, admin pricing, demo, and the
  database refuses free boost orders in any mode); Referral mode is the default and live.
- **Boost sold everywhere (7 Nov):** Home Boost card near the top (two steps: 100% profile, refer a family;
  "Your Boost is live" while one runs), "Your profile could be here" tile in Featured, banner on Discover,
  Requests, Shortlist, Profile, Activity and Notifications.
- **Website:** public site, crawler policy and store listings in `website/` and `store/` (not hosted yet).
- **Developer tooling:** graphify code map for every session (`.claude/hooks/session-start.sh`, `CLAUDE.md`).
- **Admin:** deleted accounts — who deleted and the full profile for 30 days.
- **Not in final_version6 (planned next):** paid checkout (payment provider), hosting the website on
  Cloudflare Pages, bulk import of sample biodatas, WhatsApp onboarding reminders + SMS backup (migration
  written, not applied — see below), a new Android build with everything above.

## Verified at save time
| Check | Result |
|---|---|
| Typecheck, lint | clean (0 errors, 2 known warnings) |
| Unit tests (Jest) | 395 passed (5 live tests skipped offline) |
| Database suites (`scripts/test-db.sh`) | 29 / 29 passed, incl. `99_free_boost_referral_only` |
| Web end-to-end suites | boost, boostvisibility, referral, home, smoke, states, clickthrough passed; crawl of every screen × role × 4 languages: 0 high, 0 medium issues |
| Live database vs this commit | 40 of 41 migrations applied (latest `free_boost_referral_only`); every public function identical to a database built from this commit's migrations, ignoring comments and spacing (8 differ only by comments); `20261127000000_reminders_sms` not applied (5 functions absent live), by design |

### Live backend at save time (Supabase project `hlthzrznuztapfsloxkm`)
- **Referral settings:** mode `referral`, programme on, free Boost 7 days, welcome Boost for the invited family
  on, team check on.
- **Boost plans in pricing:** 7 / 14 / 30 days, all priced "Free" for both sides — hidden from members (a Boost
  plan is never free). Set real prices before switching to Paid Boost mode.
- **Edge Functions:**

| Function | Version | JWT check |
|---|---|---|
| `send-whatsapp-otp` | 5 | off (signed Auth hook) |
| `pin-login` | 6 | off |
| `admin-create-member` | 4 | on |
| `photo-urls` | 4 | on |
| `delete-account` | 5 | on |
| `discover-feed` | 8 | on |
| `master-backup-phone` | 5 | on |
| `purge-deleted-accounts` | 1 | off (job secret) |
| `push-dispatch` | 1 | off (job secret) |

### Builds and previews at save time
- Android APK (EAS `preview`, live backend): build `f4e7f28b-b5df-4243-9d60-4755fcc9e65f` — made earlier on
  7 Nov, before "free Boosts only through referrals" and "Boost sold everywhere". Make a new build from this
  branch to get this version on phones.
- Web preview (demo data): https://claude.ai/artifact/YK9mg5vQzR19CEfoaX4bSJ (version 31).

## How to get back to final_version6

### The code (always possible)
```bash
git fetch origin final_version6
git checkout -b restore-from-final_version6 origin/final_version6
npm ci
npx tsc --noEmit && npx expo lint && npx jest
```
An EAS build from this branch is this version: `npx eas-cli@latest build --platform android --profile preview`
(APK) or `--profile production` (Play Store).

### The live backend
It only changes when someone applies a migration or deploys a function. To return it to final_version6 later:
1. **Edge Functions:** redeploy each function above from the `final_version6` checkout
   (`supabase/functions/<name>` with `_shared/`), with the JWT setting shown.
2. **Database:** anything applied after `free_boost_referral_only` is later work — undo it with a new migration
   that re-creates the final_version6 versions of changed functions from these migration files. Never delete
   migration history rows. Check with `md5(pg_get_functiondef(oid))` (ignoring comments) against a database
   built by `scripts/test-db.sh` from the checkout.
3. **Settings:** referral mode and Boost prices above are data; restore them in Admin → Referrals & free
   Boosts and Admin → Pricing.
4. **Members' data** (accounts, biodatas, photos) is not in git: use Supabase backups.

### Safety notes
- Never push to `final_version6`; create `final_version7`… for later releases.
- Lock it on GitHub: Settings → Rules → Rulesets → New branch ruleset → target `final_*` → restrict updates and
  deletions. The commit ID below also works forever, even if the branch were deleted:
  `git checkout <commit>` (the commit that adds this file — see `git log -1 origin/final_version6`).
