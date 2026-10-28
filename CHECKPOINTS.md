# Checkpoints — Hyderabad Rishta

> Known-good snapshots of the app. Each is pinned by a **commit ID on GitHub** (permanent; tags can't be pushed from the session that made them), so it survives this machine and any future session.
> **Latest checkpoint: V3.** (V2 and V1 remain restorable below.)
> If something breaks later, compare against or roll back to a checkpoint (commands below).

## V3 — the commit "Checkpoint V3" / tag `v3` (2026-10-28) ✅ owner-approved — LATEST

**Where:** branch `claude/sharp-bell-xxyxmj`, repo `qwink-dinein/Hyderabad-Rishta`.
- **V3 is the commit titled "Checkpoint V3: …".** Its full ID is recorded in `Memory.md` and in the "V3 commit ID" line at the end of this section; find it any time with `git log --grep "Checkpoint V3" --format=%H -1`.
- The app code is identical to **`ae8776f`** ("One boost at a time"); the V3 commit only adds documentation.
- A local tag `v3` points at it. Pushing tags is blocked here; recreate it with `git tag -a v3 <V3 id> -m V3`.

**Preview at V3:** https://claude.ai/artifact/YK9mg5vQzR19CEfoaX4bSJ (phone-frame preview; full screen on a phone).
**Builds on V2:** everything listed under V2 and V1 still works, and is covered by the tests below.

**V3 commit ID: `dafa2120243b1bf067e78de03602e0c4fc4efd96`** (short `dafa212`).

### Verified at V3
| Check | Result |
|---|---|
| `npx tsc --noEmit` and `npx tsc -p supabase/functions/tsconfig.json` | clean |
| `npx expo lint` | 0 errors (2 harmless i18next warnings) |
| `npx jest` | **214 / 214** passing (13 suites) |
| `./scripts/test-db.sh` (Postgres 16, **13 migrations**) | **11 suites PASSED**: RLS, governance, interest, admin console, boost & push, attacks (73 blocked), retention, one-biodata (17), PIN login (37), boost tab, one-boost |
| Playwright `e2e/` | **12 suites, 85 steps**, zero console errors: smoke 14, journey 10, admin 9, interest 7, console 6, boostpush 4, home 6, photos 3, onebiodata 2, pin 12, transitions 5, boosttab 7 |

### Added since V2
**1. Security: "break it and fix it"** (Architecture §14)
- **Database:** an attack suite of 73 attacks (`supabase/tests/60_attacks.test.sql`). 14 got through before the fixes.
  - Server functions are deny-by-default, with an allow-list.
  - Members can shortlist only profiles they can see.
  - Biodata is capped at 32 KB; photos must be the owner's own storage paths.
  - Reports: column-level insert, known reasons only, one open report per pair, 10 per day.
  - Length caps on push tokens, idempotency keys, messages and push settings.
  - Notification links must be in-app paths; announcement images must be https.
- **App rules:** `__tests__/attacks.test.ts` (20 tests; 12 got through before the fixes), with shared rules in `src/domain/security.ts`.
- **Links:** `safeDeepLink()` on every notification and push tap.

**2. Photos up to 5 MB**
- JPG, PNG, WEBP and HEIC are accepted; SVG, GIF and PDF are refused.
- Photos are shrunk on the phone (`src/services/photos.ts`, expo-image-manipulator) to 1600 px or less, as a JPEG with location data removed, and stored at 1.5 MB or less.

**3. Data size and performance**
- The demo store prunes data nobody reads back: a flooded store went from 8.5 MB to about 0.4 MB.
- SQL `run_retention()` does the same daily on the server.
- The Supabase SDK is no longer bundled in the demo build (−276 KB JS).

**4. One mobile number = one account = one biodata** (Architecture §15)
- `normalizePhone()` (`src/domain/phone.ts`) treats every way of typing a number as the same number.
- DB: a canonical phone check plus a unique full-number index; one biodata per account (trigger).
- A biodata removed by an admin marks the account (`profile_removed_at`), so no fresh biodata can be started. Only **Delete account** frees the number.

**5. OTP registration + 4-digit PIN login** (Architecture §16)
- **When an OTP is sent:** only for registration, a new phone, Forgot PIN, and the first PIN on an older account.
- **Sessions:** server-side, stored in the phone's secure storage, kept across restarts. Revoked by logout, a PIN reset, suspension, deletion, or 180 idle days.
- **PIN login:** needs this phone's device key plus the PIN.
  - Lockout: 5 wrong → 15 min; 10 in a day → only an OTP reset unlocks.
  - Weak PINs are refused; the PIN is stored only as a hash.
- **Screens:** PIN login, create and confirm, Forgot PIN, change PIN in Settings.
- **Server:** SQL tables and RPCs plus the `pin-login` Edge Function.
- **Migration:** existing accounts and logins are kept.

**6. Smooth screen transitions** (`src/navigation/transitions.tsx`)
- Native slide on phones (mirrored for Urdu) and a tab shift.
- On web, a fade and rise; under Reduce Motion, a fade only.

**7. Boost as the raised centre tab** (design.md §5b)
- **Tabs:** Home · Discover · **Boost** · Requests · Profile.
- **Reminders while not boosted:** a dot and a pulsing halo on the button, a Home card ("Not now" hides it for 3 days), and a weekly `boost_reminder` notification.
- **Shortlist moved** to a heart with a count in Discover's header and a row on Home; `/shortlist` still works.
- **One boost at a time:** no boosting again while a boost runs (app, backend and SQL). There is one unpaid boost order at most, and boosts never stack or extend.

### Key commits V2 → V3
| Commit | What |
|---|---|
| `dafa212` | **V3**: Checkpoint V3, docs only; code = `ae8776f` |
| `ae8776f` | One boost at a time |
| `240d6a5` | Boost centre tab + reminders; Shortlist blended into Discover/Home |
| `b3931b7` | Smooth screen transitions |
| `9afc290` / `2108da5` / `17562ba` | PIN login: server side / UI / backend |
| `455159b` | One number = one account = one biodata |
| `10904de`, `ba56590` | Bundle trim; 5 MB photos, safe deep links, data retention |
| `a8e565e`, `83a39a6` | Security: app-rule and DB attack suites + fixes |

### How to get back to V3
```bash
git fetch origin claude/sharp-bell-xxyxmj
V3=dafa2120243b1bf067e78de03602e0c4fc4efd96   # or: git log --grep "Checkpoint V3: pin" --format=%H -1
git tag -a v3 "$V3" -m V3 2>/dev/null || true   # recreate the tag locally if missing
git diff v3 --stat                   # what changed since V3
git checkout v3 -- <path>            # restore one file/folder to V3, then commit
git revert --no-edit v3..HEAD        # undo everything after V3 as new commits (safe, keeps history)
git checkout -b restore-v3 v3        # or inspect V3 on its own branch
```
Then verify:
1. `npm install`
2. `npx tsc --noEmit`
3. `npx jest` (expect 214 passing)
4. `su postgres -c ./scripts/test-db.sh` (expect 11 PASSED lines; start Postgres first with `pg_ctlcluster 16 main start`)
5. `npx expo export --platform web`, then `node e2e/serve.js dist 8081` and the 12 e2e suites

The demo database is still `SCHEMA_VERSION = 8`. New fields are filled in place on load, so existing demo accounts are never wiped.

---

## V2 — commit `774ea9f` / tag `v2` (2026-10-28) ✅ owner-approved (superseded by V3, still restorable)

**Where:** commit **`774ea9f34f3ebe0babe44520b297af610262c5fb`** (short `774ea9f`) on branch `claude/sharp-bell-xxyxmj`, repo `qwink-dinein/Hyderabad-Rishta`. This commit ID is the permanent reference. The app code is identical to `0dc8d5f`; this commit only adds this record.
A local git tag `v2` points at it. If a later session can't see the tag, recreate it with `git tag -a v2 774ea9f -m V2`.
**Preview at V2:** https://claude.ai/artifact/YK9mg5vQzR19CEfoaX4bSJ (phone-frame preview; full screen on a phone).
**Builds on V1:** everything listed under V1 below still works in V2. It is all covered by the same tests, which still pass.

### Verified at V2
| Check | Result |
|---|---|
| `npx tsc --noEmit` (app) and `npx tsc -p supabase/functions/tsconfig.json` (edge functions) | clean |
| `npx expo lint` | 0 errors (2 harmless i18next warnings) |
| `npx jest` | 128 / 128 passing (7 suites) |
| `./scripts/test-db.sh` (Postgres 16, 7 migrations) | RLS, governance, interest, admin console, boost & push: all PASSED |
| Playwright `e2e/`: smoke, journey, admin, interest, console, boostpush, home | all pass, zero console errors |
| Width audit at 320 / 360 / 375 / 390 / 412 / 430 px on 9 screens | no horizontal overflow |

### Added since V1
**Premium redesign (Design PRD v1.0, presentation only)**
- **Visual system:** PRD colour tokens, Lora headings with Inter text, and original vector art (Charminar dusk scene, lanterns, jali, brand medallion). The reference image is in `docs/design/reference-ui.jpg`.
- **Landing page:**
  - swipeable hero carousel with autoplay that pauses on interaction, in the background and under Reduce Motion
  - three-level actions: Create biodata › Find your match › "Already registered? Log in" pill
  - compact mode, so all three fit in the first screen from 320 × 640 up
- **Sign-up:** a language step on first sign-up, "Enter your mobile number" / "Welcome back", and a 6-box OTP with paste and autofill.
- **Navigation:** tabs are Home · Discover · Shortlist · Requests · Profile, with a bell plus unread badge in every header. The new Home tab shows status, new interests, the Featured rail and recent profiles.
- **Profiles:**
  - ProfileCard v2: 4:5 photo, icon metadata, contextual Express Interest, heart animation, skeletons
  - elegant photo placeholders, a profile gallery and fact chips
- **Forms and inbox:**
  - PhotoPicker v2: one large and two small slots
  - option cards, segmented wizard progress, animated "Other" fields
  - connect screen with an avatar header; request inbox with a segmented control, avatars and the poke bell
- **Sound and haptics:** optional sounds (off by default; original chimes) and haptics with Settings switches, plus an animated success toast.

**Mobile web**
- `public/index.html`: viewport-fit cover, home-screen install meta, no tap flash or overscroll bounce.
- All inputs use 16 px text, so iOS never zooms on focus.
- Phone-frame preview: 6 devices, Fit/Actual size, Jump-to-screen, demo logins. On a real phone it opens full screen.

**Boost guarantee**
- Featured (Home rail and Discover strip) shows every active, published boost to every member looking for that profile type, whatever their filters or sort.
- It is never shown to the same type, to the owner, across a block, or while the profile is paused or the account suspended.
- Fair daily rotation; impressions and reach shown to the owner; "ending soon" and "ended" notices exactly once; a warning when a paused profile hides the boost.
- Members can't grant themselves a boost: SQL hardens profile inserts and `apply_boost` is service-only and idempotent.

**Phone notifications for every profile action**
- **Triggers:** interests, offers, pokes, views (anonymous, batched every 6 h), shortlists (once per person), approvals, boost, payment, safety, admin alerts, announcements.
- **Privacy:** lock-screen text in EN/UR/TE is generic by default; names are opt-in, and numbers and message text are never shown.
- **Controls and limits:**
  - category switches (account and safety alerts always on)
  - at most 12 optional pushes per hour
  - one phone ↔ one account, and the phone is unbound on logout
- **Server:** `push_outbox` and the `push-dispatch` edge function (claim with SKIP LOCKED, Expo send in batches of 100, retries with backoff, receipts, dead-token cleanup). The shared text module is synced and drift-tested.
- **App:**
  - expo-notifications registration, an Android channel, tap-to-open deep links, badge
  - in-app arrival banner, Settings → Phone notifications, and an opt-in card on Home
- **Live delivery still needs** (T-124): an EAS projectId, FCM and APNs credentials, a development build (Expo Go on Android can't receive push), the deployed function and the pg_cron jobs.

**Admin**
- Profile IDs, member search and member page, the alerts bell, relation badges (from V1).
- Plus boost and push health metrics on the dashboard.

**Home button everywhere**
- Home sits beside Back on all 22 non-tab screens.
- It goes to the member Home tab, the admin dashboard, or the landing page when signed out, and clears the stacked screens.
- The wizard saves the draft first; the connect screen confirms before discarding a message.

### Key commits V1 → V2
| Commit | What |
|---|---|
| `774ea9f` | **V2**: adds this record; app code identical to `0dc8d5f` |
| `0dc8d5f` | Home button on every screen |
| `5b40e69` | Airtight boosts and phone notifications |
| `8fe7510` | Visible Log in; compact hero on short phones |
| `46d8dc8` | Mobile web optimisation |
| `1174136` | Premium UI/UX redesign |

### How to get back to V2
```bash
git fetch origin claude/sharp-bell-xxyxmj
git tag -a v2 774ea9f -m V2 2>/dev/null || true   # recreate the tag locally if missing
git diff v2 --stat                    # what changed since V2
git diff v2 -- <path>                 # details for one file
git checkout v2 -- <path>             # restore one file/folder to V2, then commit
git revert --no-edit v2..HEAD         # undo everything after V2 as new commits (safe, keeps history)
git checkout -b restore-v2 v2         # or inspect V2 on its own branch
```
Then verify:
1. `npm install`
2. `npx tsc --noEmit`
3. `npx jest` (expect 128 passing)
4. `./scripts/test-db.sh` (expect 5 PASSED lines)
5. `npm run web`, then the e2e suites in `e2e/README.md`

The demo database is `SCHEMA_VERSION = 8`. A different version resets local demo data once, automatically.

---

## V1 — commit `4636968` / tag `v1` (2026-10-28) ✅ owner-approved baseline (superseded by V2, still restorable)

**Where:** commit **`4636968089a30394f9c9ca594b1a06783c1c4775`** (short `4636968`) on branch `claude/sharp-bell-xxyxmj`, repo `qwink-dinein/Hyderabad-Rishta`. This commit ID is the permanent reference.
A local git tag `v1` points at it too. Pushing tags was blocked (403) in the session that made V1, so a later session may need to recreate it: `git tag -a v1 4636968 -m V1`.
**Preview at V1:** https://claude.ai/artifact/YK9mg5vQzR19CEfoaX4bSJ (demo backend, single HTML file).
**Stack:** Expo SDK 58 · React Native · TypeScript · Expo Router (`src/app/`) · TanStack Query · zustand · i18next (EN / UR-RTL / TE) · zod · offline `DemoBackend` (schema v7) · Supabase SQL ready (6 migrations), not yet connected.

### Verified at V1
| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx expo lint` | 0 errors (2 harmless i18next warnings) |
| `npx jest` | 106 / 106 passing (6 suites) |
| `./scripts/test-db.sh` (Postgres 16) | RLS, governance, interest, admin console — all PASSED |
| Playwright `e2e/` smoke · journey · admin · interest · console | all pass, zero console errors |

### Functionality in V1
**Members**
- Landing page with an accessible carousel; language switch EN / Urdu (RTL) / Telugu.
- Mobile + OTP login (demo OTP `123456`): resend cooldown and attempt limits.
- 7-step biodata wizard: save and continue; "Other" fields; minimum age (bride 18 / groom 21).
- Biodata details:
  - "How many children" when the member is not never-married.
  - Maslak dropdown with sub-maslak.
  - Three clearly labelled photo slots (Main / Photo 2 / Photo 3).
- Preview → publish. Admin approval can be ON or OFF (one click). Paid / free / disabled pricing with simulated checkout. Boosts.
- Discover:
  - filters, chips, sort, pagination
  - privacy-projected profiles
  - **profile ID (`HR-10001…`)** on cards and profiles
  - **relation badges** on cards: Connected · Interest sent · Sent you interest · Declined your interest · You declined · Interest expired · You withdrew
- Shortlist.
- Profile page:
  - Express Interest; report; block.
  - Decline cool-down: 30 days, explained on the profile and enforced on the server.
- Express Interest with an optional introduction and an optional **phone offer**. The offer needs explicit consent, and the number is revealed only when the other person accepts the offer.
- After acceptance, either side can "Share my number"; offers can be withdrawn.
- **Poke:** available after 48 h; one per request; at most 2 to the same person per 7 days; members can opt out.
- Requests expire after a configurable number of days.
- Requests inbox (received / sent): accept, decline, withdraw, number offers both ways.
- Revealed number shown with Call / Copy / SMS.
- Notifications centre: unread count, mark read / mark all read, deep links, announcements.
- Dashboard: reach metrics, boost, pause / resume, orders.
- Settings: language, privacy, reminder opt-out, blocked list, delete account, reset demo data.

**Admin** (master `9000000000`, sub-admin `9000000009`)
- Dashboard:
  - **search box** (profile ID / name / city / phone digits)
  - **bell with unread count**
  - one-click manual-approval toggle and "Approve all"
  - metrics and connection metrics
- **Find a member** → **member page** with every action: approve, pause, request changes, delete profile, suspend / reactivate / delete account, delete interests, resolve reports, cancel pending orders, view the full biodata.
- **Alerts:** reports, payments (paid / failed), profiles waiting for approval, self-deleted accounts, admin-team / master security changes.
- Profiles moderation (including removing photos), users, contact requests, reports and safety, announcements (schedule, segments, readership, recipient report), pricing and connection settings, orders, Trash (30-day restore), audit log (append-only).
- Profile ID chip on every admin list; tapping it opens the member page.
- Governance:
  - exactly one master; sub-admins can't manage the master or other admins
  - lost-phone recovery (recovery codes + OTP; backup phone instant, new phone after a 72 h time-lock that the master can cancel)
  - master transfer
- Phone numbers are always masked for admins. Phone searches and sensitive actions are audited.

### Key commits up to V1
| Commit | What |
|---|---|
| `4636968` | **V1** — adds this checkpoint file; app code identical to `45ad535` |
| `45ad535` | Memory: current preview link |
| `4b248e2` | Admin console: profile IDs, member search, alerts bell; relation badges |
| `117417b` | Express Interest, consent-based phone offers and Poke; three-slot photo picker |

### How to get back to V1
```bash
git fetch origin claude/sharp-bell-xxyxmj
git tag -a v1 4636968 -m V1 2>/dev/null || true   # recreate the tag locally if missing
git diff v1 -- <path>                 # see what changed since V1 (whole repo: git diff v1)
git checkout v1 -- <path>             # restore one file/folder to V1, then commit
git revert --no-edit v1..HEAD         # undo everything after V1 as new commits (safe, keeps history)
git checkout -b restore-v1 v1         # or: inspect V1 on its own branch
```
Then reinstall and verify: `npm install` → `npx tsc --noEmit` → `npx jest` → `npm run web`.
The demo database is versioned (`SCHEMA_VERSION = 7` in `demoBackend.ts`); a different version resets local demo data automatically.
