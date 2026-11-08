# final_version10 — saved release (2026-11-08)

This file records exactly what "final_version10" is and how to get back to it. The GitHub branch
`final_version10` points at the commit that contains this file. Nobody pushes to it: later work goes on other
branches, so `final_version10` keeps pointing at this version. (Earlier saves: `final_v1`, `final_v2`,
`final_version6`.)

## What changed since final_version6
- **Premium design system** (Royal Burgundy × Champagne Gold × Warm Ivory; Playfair Display, Inter, Montserrat)
  across the app and the website — `docs/design/premium-design-system.md`.
- **Landing screen redesign** (app) and **website on the same design**, store badges in place of every
  sign-up button, Android badge downloads the tester APK, Instagram/WhatsApp channel buttons, FAQ and app data
  for AI search, fits every phone width.
- **Hero background video** (website home + app landing): muted ~7 s loop of three wedding clips under a
  burgundy veil, poster first, reduced-motion / data-saver aware; on the website the loop is fetched and played
  from a `blob:` URL so iPhone Safari plays it (the host ignores Range requests). App: `expo-video`.
- **New hero copy, Mogra brush headline:** "Bringing Hyderabad's Muslim Families Closer, *One Rishta at a
  Time.*" with "Hyderabadi's Own Muslim Matrimony App" (Urdu, Roman Urdu, Telugu translated). Greeting removed;
  "Your number stays private" moved below the fold (website: privacy section; app: above "Why families choose").
- **Website hosted** on Cloudflare Workers at https://hyderabadrishta.com (auto-deploys from branch
  `claude/sharp-bell-xxyxmj`, `wrangler.jsonc`).
- **Live data reset** for the 15-member tester round (admins and settings kept; copy in schema
  `backup_20261108`).
- **muzzappdesigns** redesign concepts saved for later (`docs/design/muzzappdesigns/`).

## Verified at save time
| Check | Result |
|---|---|
| Typecheck, lint | clean |
| Unit tests (Jest) | 395 passed (5 live tests skipped offline) |
| Website build + `website/check.mjs` | passed (27 pages, 25 sitemap URLs) |
| Live website | serves this commit's site: new hero, video plays (desktop + phone widths), Android badge → build a1a6c0c6 |
| Live database vs this commit | 40 of 41 migrations applied (latest `free_boost_referral_only`); `20261127000000_reminders_sms` not applied, by design — unchanged since final_version6 |

### Live backend at save time (Supabase project `hlthzrznuztapfsloxkm`)
- **Edge Functions** (unchanged since final_version6):

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
| `tmp-clear-photos` | 2 | leftover stub (returns 410) — safe to delete |

- **Settings:** referral mode on (free Boost only through referrals), Boost plans hidden from members.
- **Data:** tester-round state — admins only, profile codes from HR-10001. Pre-reset copy: schema
  `backup_20261108`.

### Builds at save time
- **Android APK (live tester build):** EAS build `a1a6c0c6-f885-4074-a5e8-fe117c27cb3e` from commit `2c33091`
  — https://expo.dev/artifacts/eas/rKEvqRs2nmGx4kv34FkMU0pjKogU7IU51Uj_yiOSj_Q.apk (link expires on Expo after
  ~30 days; rebuild from this branch any time). It still shows the greeting and the privacy pill on the landing
  screen; this branch (from `be2e327`) has them removed — the next build carries that.
- **EAS free Android builds are used up until 2026-12-01.**

## How to get back to final_version10

### The code (always possible)
```bash
git fetch origin final_version10
git checkout -b restore-from-final_version10 origin/final_version10
npm ci
npx tsc --noEmit && npx expo lint && npx jest
```
An EAS build from this branch is this version: `npx eas-cli@latest build --platform android --profile preview`
(APK) or `--profile production` (Play Store).

### The website
Push this branch's tree to the Cloudflare deploy branch (`claude/sharp-bell-xxyxmj`), or set Cloudflare's
production branch to `final_version10` and redeploy. Build: `node website/build.mjs`, deploy `npx wrangler deploy`.

### The live backend
It only changes when someone applies a migration or deploys a function. To return it to final_version10:
1. **Edge Functions:** redeploy each function above from the `final_version10` checkout
   (`supabase/functions/<name>` with `_shared/`), with the JWT setting shown.
2. **Database:** anything applied after `free_boost_referral_only` is later work — undo it with a new migration
   that re-creates the final_version10 versions of changed functions from these migration files. Never delete
   migration history rows.
3. **Settings** (referral mode, Boost prices) are data: restore them in the admin console.
4. **Members' data** (accounts, biodatas, photos) is not in git: use Supabase backups.

### Safety notes
- Never push to `final_version10`; create `final_version11`… for later releases.
- Lock it on GitHub: Settings → Rules → Rulesets → New branch ruleset → target `final_*` → restrict updates
  and deletions. The commit ID also works forever: `git log -1 origin/final_version10`.
