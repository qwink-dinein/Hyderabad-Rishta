# Memory — project context for future sessions

> **Read this file first; it is written so you don't need to re-read the code or past chats.** Append decisions, gotchas and state; never delete history (strike through instead).
> Last updated: 2026-10-29 (V4 checkpoint)

## Start here (V4 state in one screen)
- **What:** Hyderabad Rishta, a Muslim matrimony app. Owner: mukarramjahmm.
  - Specs: `PRD.md` (product), `design.md` (UI/motion), `Architecture.md` (§9 governance, §10 interests, §11–13 boost/push/UI, §14 security, §15 one-number rule, §16 PIN login, §17 boost tab, §18 QA + security round 2, §19 boost options + Home/Profile redesign, §20 live interest state + badge, §21 team-added members), `Tasks.md` (T-numbers), `Phases.md`, `CHECKPOINTS.md`.
- **Repo / branch:** `qwink-dinein/Hyderabad-Rishta` · `claude/sharp-bell-xxyxmj`. Commit and push there; never open a PR unless asked.
- **Stack:** Expo SDK 58 · RN · TypeScript · Expo Router (`src/app/`) · TanStack Query · zustand · i18next (EN / UR RTL / TE) · zod.
  - The app runs on the offline **DemoBackend** (`src/services/demo/demoBackend.ts`, `SCHEMA_VERSION = 8`).
  - Supabase SQL (17 migrations), Edge Functions (`push-dispatch`, `pin-login`, `admin-create-member`) and tests are ready but **not connected**: the client adapter is Phase 2.
- **Checkpoints (never move or delete):**
  - **V4 = LATEST = `520bf085e80ac2cdc60264eb58065abfc1ade309`** ("Checkpoint V4: team…"; code identical to `d5e7817`).
  - **V3** = `dafa2120243b1bf067e78de03602e0c4fc4efd96` (code = `ae8776f`).
  - **V2** = `774ea9f34f3ebe0babe44520b297af610262c5fb`.
  - **V1** = `4636968089a30394f9c9ca594b1a06783c1c4775`.
  - Tags can't be pushed (403); recreate locally (`git tag -a v3 <id> -m V3`). Restore commands are in `CHECKPOINTS.md`.
- **Preview artifact:** https://claude.ai/artifact/YK9mg5vQzR19CEfoaX4bSJ (republish with `url` + `files {app.html}`; see "Hosted web preview" below).

### Features at V4 (where they live)
| Area | What | Key files |
|---|---|---|
| Auth | OTP for registration/new phone/Forgot PIN, then **4-digit PIN** login. Server sessions in secure storage (`hr.auth`); device key + PIN; lockout 5 → 15 min, 10/day → OTP reset only | `src/domain/auth.ts`, `src/app/login.tsx`, `src/app/pin.tsx`, `src/components/ui/CodeInput.tsx`, `src/services/secureStorage.ts`, SQL `20261105000000_pin_login.sql`, `supabase/functions/pin-login/` |
| Identity | **One number = one account = one biodata**: `normalizePhone()`, unique E.164, `profileRemovedAt` mark; only Delete account frees a number | `src/domain/phone.ts`, SQL `20261104000000_one_biodata_per_number.sql` |
| Navigation | Tabs: Home · Discover · Shortlist · Requests · Profile (2026-10-29; floating Boost removed). `/boost`, `/activity`, `/notifications` are stack screens | `src/app/(tabs)/_layout.tsx`, `src/components/TabHeader.tsx` |
| Motion | Native slide (Urdu mirrored), tab shift, web fade+rise, Reduce Motion fade | `src/navigation/transitions.tsx` |
| Boost | Guaranteed Featured slot. **Admin-priced options** (`boostPlans`: 7/14/30 days, bride/groom fees, enable, popular); price always from the server config; free skips payment. **One boost at a time**. My Boost with honest before/during views. Home card (3-day snooze) + weekly `boost_reminder` | `src/domain/pricing.ts`, `src/domain/featured.ts`, `src/domain/metrics.ts` (`boostComparison`), `src/app/boost.tsx`, `src/components/HomeCards.tsx`, `src/hooks/useBoostStatus.ts`, `src/app/admin/pricing.tsx`, SQL `…one_boost_at_a_time.sql`, `…boost_plans.sql` (Architecture §19) |
| Team-added members | Admin/sub-admin add members for any number (no OTP); owner claims on OTP login; one number = one account (Architecture §21) | `src/app/admin/add-member.tsx`, `member-biodata.tsx`, `member-review.tsx`, `src/components/BiodataWizard.tsx`, SQL `…team_members.sql`, `supabase/functions/admin-create-member/` |
| Home / Profile | Real completion ring (`src/domain/completion.ts`), activity counts, Profile tab list, `/activity` (metrics + payments) | `src/app/(tabs)/home.tsx`, `src/app/(tabs)/dashboard.tsx`, `src/app/activity.tsx` |
| Push | Every profile action → in-app + phone; generic lock-screen text; categories; 12/h cap | `src/domain/push.ts` (→ generated `supabase/functions/_shared/push.ts`), `src/services/push.ts`, `PushBridge.tsx` |
| Security | Deny-by-default RPCs, input caps, attack suites (73 SQL, 26 app), safe deep links, OTP 10-wrong/hour cap across resends, spoofing-character filter (`unsafeText`), web CSP/headers (`public/_headers`), no camera/mic permissions, `allowBackup:false` | `src/domain/security.ts`, SQL `…security_hardening.sql`, `…text_safety.sql`, `__tests__/attacks.test.ts`, `supabase/tests/60_attacks.test.sql`, `97_text_safety.test.sql`, `e2e/csp.js` |
| QA | Crawler (every screen × 5 roles × EN/UR × 360/320 px), click-through (13 flows), revoked-session handler + crash screen in `src/app/_layout.tsx`, admin forced EN/LTR (`src/i18n/uiLang.tsx`) | `e2e/crawl.js`, `e2e/clickthrough.js` |
| Photos | Up to 5 MB originals → ≤1600 px JPEG on device (EXIF stripped); svg/gif/pdf refused | `src/services/photos.ts`, `src/components/PhotoPicker.tsx` |
| Data size | Demo prune + SQL `run_retention()`; Supabase SDK out of demo bundle | `demoBackend.ts prune()`, SQL `…retention.sql` |
| Admin | Master/sub-admins, Trash, recovery, member search/page, alerts bell, pricing, announcements, audit | `src/app/admin/*` |

### Rules that must keep holding (each has tests)
- One number → one account → one biodata. Phones always go through `normalizePhone()`.
- OTP is sent only for registration, a new phone, Forgot PIN, or a first PIN. A PIN never works without the device key.
- PIN, session token and device key are stored only as hashes on the server. A wrong PIN must be **persisted even when the call throws**: `run()` persists in `finally`, and SQL `pin_attempt` never raises.
- No boosting while a boost is active, and boosts never stack.
- A notification/push link is only ever opened through `safeDeepLink()`.
- Every new input gets a cap in `security.ts` plus an attack test. Every new RPC is added to an explicit grant (execute is deny-by-default).
- **Never bump the demo `SCHEMA_VERSION`**: it reseeds and wipes accounts. Backfill new fields in `load()` instead.
- UI-only requests must not change behaviour (owner rule from V1→V2).
- Free text goes through `unsafeText` (refuse) or `stripUnsafe` (clean); keep ZWNJ/ZWJ allowed (Urdu/Telugu).
- Selected/checked state: pass `aria-selected` / `aria-checked` / `aria-disabled` (react-native-web ignores `accessibilityState`).
- The web build must run under `public/_headers` CSP with no eval (`e2e/csp.js`); zod is `jitless`.

### Commands (all must pass before declaring done)
```bash
npx tsc --noEmit && npx tsc -p supabase/functions/tsconfig.json
EXPO_OFFLINE=1 npx expo lint            # 0 errors; 2 known i18next warnings
npx jest                                # all suites incl. simulation (400 steps × 2 seeds) and scale
SIM_STEPS=3000 SIM_SEEDS=5 SIM_REPORT=1 npx jest simulation   # long expert-team hunt (background); prints timings and refusals
pg_ctlcluster 16 main start; su postgres -c "cd /home/user/Hyderabad-Rishta && ./scripts/test-db.sh"   # 15 PASSED lines (one per test file)
EXPO_OFFLINE=1 npx expo export --platform web && node e2e/serve.js "$(pwd)/dist" 8081 &   # then:
for s in smoke journey admin interest console boostpush home photos onebiodata pin transitions boost personas livestate explore teammember badgecount clickthrough csp crawl; do node e2e/$s.js; done   # 20 suites; crawl must report 0 high issues
node scripts/sync-shared.js            # after editing src/domain/push.ts or src/domain/phone.ts
```
- e2e suites sign in through `e2e/auth.js` (`loginWithOtp`), which also creates the test PIN **4827** when asked.
- Run long e2e loops in the background: the owner rejected long foreground runs twice.

### Older snapshot notes (history)
- Premium UI redesign after V1: Design PRD v1.0, UI only. The reference image is in `docs/design/reference-ui.jpg`.
- **CHECKPOINT V2 = commit `774ea9f34f3ebe0babe44520b297af610262c5fb`** (tag `v2` locally).
- **CHECKPOINT V1 = commit `4636968089a30394f9c9ca594b1a06783c1c4775`** (tag `v1` locally).
- Run: `npm install`, then `npm run web` (browser) or `npm start` (scan the QR with Expo Go). Details in `README.md`.

## Demo credentials (demo backend only)
| Who | Phone | OTP |
|---|---|---|
| Member with published groom profile (has incoming requests) | `+91 9000000001` | `123456` |
| Admin | `+91 9000000000` | `123456` |
| Seed brides/grooms | `+91 90000001NN` (NN = 00–31) | `123456` |
| Sub-admin | `+91 9000000009` | `123456` |
| Bride with an active boost (Fatima, HR-10003) | `+91 9000000102` | `123456` |
| Pending approval (HR-10031) / draft (HR-10032) | `+91 9000000130` / `+91 9000000131` | `123456` |
| New user | any other valid Indian mobile (6–9…) | `123456` |
- After the first OTP the app asks for a 4-digit PIN. Weak ones like 1234 or 0000 are refused; e2e uses **4827**. After logout, the same browser opens with PIN login.
- 9000000001 (Imran): Ayesha r_1 (interest + number offer), Zainab r_2 (accepted, number shared), Mariam r_3 (sent 3 days ago, Poke available). Not boosted, so Boost reminders show.
- Boost pricing in the demo: brides free, grooms ₹499 (simulated checkout).
Reset everything: Settings → “Reset demo data”.

## Decisions log
| Date | Decision | Why |
|---|---|---|
| 2026-10-28 | Ship a `Backend` interface with an offline `DemoBackend` first | Cloud session can't reach Supabase/Expo/ngrok; owner needs a previewable app now. Same rules as SQL. |
| 2026-10-28 | Single privacy projection function (TS + SQL mirror) | PRD §9.3; one place to audit. |
| 2026-10-28 | Discovery never returns contact details, even with consent | Strict reading of PRD §9.3; found by a failing test. |
| 2026-10-28 | Min marriage age 18 bride / 21 groom | Indian law; adjust in `domain/validation.ts`. |
| 2026-10-28 | Carousel uses original vector art, not stock photos | Licensing/consent; PRD forbids fabricated content. |
| 2026-10-28 | Admin console English-only | Internal tool; tracked as T-113. |
| 2026-10-28 | Urdu uses a single Nastaliq weight; script fonts lazy-load | Bundle size (−2.5 MB on first load). |
| 2026-10-28 | Demo seed has `requireApproval: false`; production SQL default stays `true` | Owner couldn't send requests: new/edited profiles sat in "pending" with nobody to approve. |
| 2026-10-28 | Editing a live profile no longer sends it back to pending | Hiding a member mid-conversation is hostile; moderation of edits → T-116. |
| 2026-10-28 | Maslak = sunni/shia/just_muslim/other/prefer_not + `subMaslak` (schools) | Owner request; old top-level ahle_hadith/deobandi/barelvi moved under Sunni. Demo DB schema v4 (old local data reseeds). |
| 2026-10-28 | `children` required when marital status ≠ never married | Owner request. |
| 2026-10-28 | Roles: `user` / `admin` (sub-admin) / `master` (exactly one) | Owner request; see Architecture §9. Demo: master 9000000000, sub-admin 9000000009. |
| 2026-10-28 | Admin deletes are soft (Trash 30 days); audit + orders append-only | Mistakes must be recoverable; financial/legal records are never deletable. |
| 2026-10-28 | Master recovery = code + OTP; backup phone instant, new phone 72 h time-lock | Single stolen code can't silently take over. Demo DB schema v5. |
| 2026-10-28 | Phone numbers revealed ONLY via accepted PhoneOffers (not the consent toggle) | Feature PRD v1.0; consent toggle now covers photos/full biodata only. Demo DB schema v6. |
| 2026-10-28 | 30-day cooldown before re-sending interest after a decline | Anti-harassment; not in the PRD — flagged for owner review. |
| 2026-10-28 | Demo seed: r_1 (incoming + number offer), r_2 (accepted, number shared), r_3 (sent 3 days ago → Poke available) | So the owner can review every state with 9000000001 immediately. |
| 2026-10-28 | Profile IDs are sequential `HR-10001…`, immutable and never reused; seed p_N → HR-(10001+N) | Owner asked to show the ID everywhere to admins; a hash code wasn't searchable. Demo DB schema v7. |
| 2026-10-28 | Admin search runs on submit, not per keystroke; phone searches audited | Every keystroke of a phone search would flood the audit log. |
| 2026-10-28 | Admin alerts reuse `notifications` (type `admin_alert`, params.kind) | One inbox, RLS already in place; the bell counts only admin_alert. |
| 2026-10-28 | Card badge shows the latest request between the pair, either direction | Owner: "show accepted / connected / rejected so they won't re-send". |
| 2026-10-28 | Redesign keeps V1 behaviour; only presentation/navigation changed | Owner: "Only do the UI/UX changes, you must not touch any existing functionality". |
| 2026-10-28 | Members land on **Home** after login (was Discover); "Find your match" still goes to Discover | PRD §10 adds a Home tab. |
| 2026-10-28 | Card "Express Interest" opens the profile with `?express=1`, which continues to the connect screen only if the profile screen's existing checks pass | One source of truth for eligibility messages. |
| 2026-10-28 | Vector art instead of photos for the hero | No licensed imagery available; PRD forbids unlicensed or fake imagery. |
| 2026-10-28 | Gold small text uses `goldDeep #8A6A30`, not PRD `#A98543` | `#A98543` is 3.1:1 on ivory and fails AA for small text; it's still used for icons and large text. |
| 2026-10-28 | Sound OFF by default, haptics ON (both toggleable) | PRD §13. |
| 2026-10-28 | Boost = guaranteed Featured slot for every eligible viewer (people looking for that type), ignoring their filters; main results stay filter-honest | Owner: "boosted … visible to all other users". Same-type viewers excluded (matrimony rule). |
| 2026-10-28 | Push for every profile action; views anonymous + batched 6 h; shortlist once per person; names hidden on lock screen by default | Owner: "push notification whenever someone does any action on their profiles" + family-phone privacy. |
| 2026-10-28 | Account/safety/payment/boost pushes can't be muted in-app; others have category switches; 12/h cap | Anti-spam without hiding critical notices. |
| 2026-10-28 | Demo backend schema v8 (push devices/outbox, impressions) | Old demo data resets once. |
| 2026-10-28 | Named the design doc `design.md` (owner wrote “design.ms”) | Renders on GitHub; mention if owner prefers otherwise. |
| 2026-10-28 | Security pass: deny-by-default RPC grants, input caps, attack suites | Owner: "break it and fix it". Architecture §14. |
| 2026-10-28 | Photos: accept originals ≤5 MB, compress on device to ≤1600 px JPEG (≤1.5 MB stored) | Owner asked for 5 MB uploads; storage and bandwidth stay small; EXIF/GPS removed. |
| 2026-10-28 | One number = one account = one biodata; an admin-removed biodata blocks new ones until account deletion | Owner: "airtight". After an admin deletes a whole account, the number frees after the 30-day Trash purge (asked owner whether to ban permanently; no answer yet). |
| 2026-10-28 | PIN login needs a trusted device key + PIN; lockout 5/15 min, 10/day → OTP; sessions expire after 180 idle days; admins use PIN too | Mini PRD: cut OTP cost, stay signed in; a PIN alone is never enough. |
| 2026-10-28 | Weak PINs refused (1234, 0000, sequences, repeats, years) | Prevent guessing; not explicitly in the PRD. |
| 2026-10-28 | Screen transitions centralised in `src/navigation/transitions.tsx` | Owner: "smooth transitions whenever the app moves to the next screen". |
| 2026-10-28 | Boost replaced the Shortlist tab (centre, raised); Shortlist moved to the Discover heart + Home row | Owner: "replace one with Boost in the middle … blend the replaced one smartly". |
| 2026-10-28 | Boost reminders: red dot + halo, Home card (3-day snooze), weekly notification (not within 2 days of publish or 7 days after a boost; promotional category) | Owner: "keep reminding if they haven't boosted". |
| 2026-10-28 | One boost at a time; boosts no longer extend | Owner: "must not allow them to boost again if the current boost is in progress". |
| 2026-10-28 | Checkpoint V3 pinned at the "Checkpoint V3" docs commit (code = `ae8776f`) | Owner: "checkpoint this as V3". |
| 2026-10-29 | Expert-team pass: a simulated community runs on one shared server with rule checks after every action; demo hot paths made linear; SQL hot-path indexes | Owner: "build an expert team … admin, multiple users … find the issues and fix … improve performance". Orders outliving erased members is intended (financial record; SQL `on delete set null`). |
| 2026-10-29 | Completion card only while < 100 %; Boost card always on Home (no snooze); preview footer = Home + Edit/Publish; siblings = one group | Owner tweaks after V4. |
| 2026-10-29 | Team-added members: admins and sub-admins add members without OTP; the owner gets the account on first OTP login; team edits stop once claimed; published directly (team = approver, no fee) | Owner: "admin and sub admin manually add any number of profiles without needing any otp… later someone with the same number login… show them the profile admin created". |
| 2026-10-29 | Interest state airtight + Requests tab badge + queued banners + "number now visible" notice (Architecture §20) | Owner: "make this functionality airtight", "request option in tab should show 1,2,3". |
| 2026-10-29 | Mini PRD: boost options 7/14/30 priced by admin (initial ₹100/200/350; bride 7-day free), My Boost, Home completion/activity/Boost cards, Profile list, tabs Home·Discover·Shortlist·Requests·Profile | Owner: "Give admin the configurable price options" + Mini PRD. Never promise views/matches; no fake stats. |
| 2026-10-29 | No-photo profiles show the owner's Hyderabadi bride/groom portraits (`assets/personas/*.webp`, in `ProfilePhoto`), by the profile's type. Two vector versions were rejected first ("very bad") — use the supplied artwork, don't redraw | Owner spec "Default Hyderabadi Bride & Groom Illustrations". |
| 2026-10-28 | QA rounds 1–2 (crawler + click-through) and security round 2 (OTP cap, spoofing chars, CSP headers, permissions) | Owner: "become a tester … test every button … try to break the security and fix it". |
| 2026-10-28 | npm audit findings left as-is (build-time Expo CLI/jest only); never `npm audit fix --force` (downgrades to SDK 51) | Not shipped in the app bundle. |

## Gotchas
- Demo backend hot paths: never call `this.me(db)` / `currentSession()` inside a `.filter`/`.find` callback (each call hashes the token) and never do a per-profile table scan in lists — build lookups once (`viewerContext()`). `__tests__/scale.test.ts` (2,000 members) guards this.
- Simulation: each persona is its own `DemoBackend` (own `secure` KV) over one shared `memoryKV`; reset the instance's in-memory copy before every call so it reads the shared server state.
- Expo SDK 58: import `Tabs` from `expo-router/js-tabs` (root export is deprecated). Routes live in `src/app/`.
- `npx expo install` needs `EXPO_OFFLINE=1` in this sandbox (api.expo.dev is blocked by network policy).
- RN 0.88 refs: use `React.ComponentRef<typeof TextInput>` / `ScrollView`.
- FlatList `ListHeaderComponent/ListFooterComponent` must be `undefined`, not `null` (types).
- Postgres: `text::date` is not immutable → use `iso_date()` helper in generated columns.
- In Supabase, functions get default EXECUTE grants; migration grants explicitly anyway (portable).
- Jest needs the AsyncStorage mock (`jest.setup.js`) and `moduleNameMapper` for `@/`.
- Test logins in Playwright must `waitForURL` after verify — navigating early aborts the login.
- After a container restart Postgres is down: `pg_ctlcluster 16 main start`, then `su postgres -c ./scripts/test-db.sh`.
- `expo lint` installs eslint + eslint-config-expo on first run (adds `eslint.config.js`).
- Expo Go **Android** has no remote push since SDK 53 (expo-notifications warns) → development build required; local notifications (Settings → Send a test notification) work in Expo Go.
- `supabase/functions/_shared/push.ts` is GENERATED: run `node scripts/sync-shared.js` after editing `src/domain/push.ts` (a Jest test fails on drift).
- `href: null` on a js-tabs screen breaks direct URL access, so hidden screens live outside `(tabs)` (e.g. `src/app/notifications.tsx`).
- react-native-web `Switch` needs `activeThumbColor` (web-only prop) or it shows a teal thumb.
- Sandbox perms: Postgres test cluster runs as `nobody`; parent dirs need `o+x`.
- SQL tests must NOT grant table privileges broadly (masks column-level revokes). New RPCs need adding to the allow-list in `20261102000000_security_hardening.sql` style (execute is deny-by-default).
- Any new input field: add a cap in `src/domain/security.ts` + an attack test. Notification links → `safeDeepLink()`.
- Report reasons are the closed set in `src/domain/options.ts` (`fake`, not `fake_profile`).
- Owner rule: ONE number = ONE account = ONE biodata. Always pass phones through `normalizePhone()`; never create a profile if any profile row exists for the user or `profileRemovedAt` is set. Only Delete account frees a number (Architecture §15).
- PIN login (Architecture §16): OTP only for registration / new phone / Forgot PIN / first PIN. Never bump the demo SCHEMA_VERSION (it reseeds = wipes accounts) — backfill in `load()` instead. e2e suites log in through `e2e/auth.js` (handles PIN screens; test PIN 4827). Demo login state lives in secure KV `hr.auth`, not the db.

- The biodata form is ONE component (`src/components/BiodataWizard.tsx`) used by members and admins; change questions there only.
- Any LTR fragment (price, phone) interpolated into a translated sentence goes through `bidiIsolate()` (`src/domain/format.ts`), or Urdu shows "100₹".
- No Prettier config in the repo: never run `prettier --write` (it reformats whole files to 80 columns).
- Don't `pkill -f e2e/serve.js` inside a compound shell command: the pattern matches the shell itself and kills it (exit 144). Start the server with a separate background command.
- Playwright: language/sort/tab controls are `role=radio`; "View all" is a link; use `waitForURL(..., { waitUntil: 'commit' })`.

## Environment limits observed (cloud session)
- Network policy blocks `api.expo.dev`, `exp.host`, ngrok, `docs.expo.dev` → no Expo tunnel from the cloud; run locally to scan with Expo Go.
- ~~GitHub push required re-linking the remote (scaffold overwrote `.git`)~~ — fixed 2026-10-28 with owner approval; branch pushed.

## Hosted web preview
- Private Artifact (current): https://claude.ai/artifact/YK9mg5vQzR19CEfoaX4bSJ — earlier versions: https://claude.ai/artifact/Vx3XTLdLJVSgcVY9hkmxuH (single self-contained HTML, demo backend). Republish with `url` to keep the link.
- Rebuild: `SINGLE_BUNDLE=1 EXPO_OFFLINE=1 npx expo export --platform web --output-dir dist-single && node scripts/pack-web.js dist-single <out>.html`, then republish to the same URL.
- `app.config.js` turns off web route code-splitting only when `SINGLE_BUNDLE=1`; `+not-found` redirects unknown paths to `/`.
- **The preview is two files:** `index.html` (phone-frame shell: device picker, jump-to-screen, demo logins, PIN note) and `app.html` (the packed app, built with `--standalone`).
  - The shell isn't in the repo. Get it back with Artifact `read` (url above) and save it as `index.html`.
  - Rebuild `app.html` with `node scripts/pack-web.js dist-single <dir>/app.html --standalone`.
  - Publish with `url` + `files: {"app.html": …}`. If the publish is refused, read `app.html` first (`read` with `path`).
- A duplicate artifact https://claude.ai/artifact/Pyd1ttmH9LJ82zgYQwuLDD was created by mistake. Ask the owner before deleting it.

## Next session — start here
1. Read "Start here" above. Only open the files named in the features table for the area you're changing.
2. Open questions for the owner:
   - permanently ban numbers of admin-deleted accounts?
   - flag duplicate people across numbers (T-067)?
   - delete the duplicate preview artifact https://claude.ai/artifact/Pyd1ttmH9LJ82zgYQwuLDD?
3. Phase 2 (`Tasks.md`, `Phases.md`) needs owner accounts:
   - Supabase project, then the client adapter (incl. `trust_device` + `pin-login` + SecureStore session; enable phone+password auth)
   - SMS provider for OTP
   - Razorpay (webhook must refund when `apply_boost` refuses with `boost_active`)
   - EAS projectId + FCM/APNs for push
   - pg_cron: `run_boost_jobs` every 5 min, `run_retention` daily, `push-dispatch` every minute
4. Keep all docs updated (PRD, design, Architecture, Tasks, Phases, README, CHECKPOINTS, Memory) with every change.
