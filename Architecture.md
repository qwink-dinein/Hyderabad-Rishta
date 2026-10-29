# Architecture — Hyderabad Rishta

> Living document — update whenever a structural decision changes. Last updated: 2026-10-28.
> See also: [PRD.md](PRD.md) · [Tasks.md](Tasks.md) · [Phases.md](Phases.md) · [design.md](design.md) · [Memory.md](Memory.md)

## 1. System overview

```
┌─────────────────────────── Expo app (one TypeScript codebase) ───────────────────────────┐
│  iOS · Android · Web (React Native Web)                                                   │
│                                                                                           │
│  src/app/**            Expo Router screens (file-based routes, code-split on web)         │
│  src/components/**     UI kit (Text/Button/forms/feedback/layout) + domain components     │
│  src/hooks/queries.ts  TanStack Query: cache, optimistic updates, invalidation            │
│  src/state/*           Zustand: session (user, lang), discovery filters                   │
│  src/i18n/*            i18next: en (source) / ur (RTL) / te, per-key fallback             │
│  src/domain/*          PURE business logic — privacy projection, search, pricing,         │
│                        validation (zod), metrics. Framework-free, 100% unit-tested.       │
│  src/services/backend.ts   `Backend` interface (the API contract)                         │
│      ├─ demo/DemoBackend    offline “server” on AsyncStorage/localStorage (default)       │
│      └─ supabase/*          Supabase client (adapter = Phase 2)                           │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                                   │ anon key + user JWT only
                                   ▼
┌──────────────────────────── Supabase (production) ───────────────────────────────────────┐
│ Auth (phone OTP via SMS provider) · Postgres + RLS · Storage (private bucket) ·          │
│ RPCs (SECURITY DEFINER): search_profiles, get_profile, send_request, respond_request,    │
│   set_consent, open_notification, admin_* · Edge Functions: payments webhook, push fan-out,│
│   signed photo URLs, scheduled announcements                                              │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Why a `Backend` interface + demo implementation?
- The app is fully usable **offline on localhost, the web build and Expo Go** with zero credentials.
- The demo backend enforces the *same* rules as the database (auth, ownership, admin role, privacy
  projection, consent, rate limits) so UI behaviour is realistic and the rules are unit-tested.
- Swapping to Supabase is a single adapter behind the same interface; screens don't change.
- Everything simulated is labelled in the UI (OTP, payments, push) — PRD §3, §8, §17.

## 2. Folder structure

```
src/
  app/                    routes
    _layout.tsx           providers, fonts, language restore, RTL direction, toasts, dialogs
    index.tsx             landing (carousel, CTAs, language selector)
    login.tsx             phone + OTP
    biodata/index.tsx     7-step wizard        biodata/preview.tsx  preview & publish
    (tabs)/               discover · shortlist · requests · notifications · dashboard
    filters.tsx           filter modal         profile/[id].tsx     profile details
    request/[id].tsx      compose request      settings.tsx         account & privacy
    legal/[doc].tsx       privacy/terms drafts
    admin/                overview · profiles · pricing · announcements · reports · users · orders · audit
  components/             ProfileCard, ProfileDetails, HeroCarousel, PhotoPicker, Checkout, LanguageSwitcher, ui/*
  domain/                 types, options, format, privacy, search, pricing, validation, metrics
  data/seed.ts            32 fictional profiles (deterministic)
  services/               backend.ts (contract), demo/demoBackend.ts, storage.ts, supabase/client.ts
  hooks/                  queries.ts, useOptions.ts
  state/                  session.ts, filters.ts
  i18n/                   en.ts, ur.ts, te.ts, index.ts
  theme/                  tokens.ts, fonts.ts
supabase/migrations/      SQL schema + RLS + RPCs
supabase/tests/           SQL RLS/privacy tests (scripts/test-db.sh)
__tests__/                Jest: domain, backend journeys, i18n coverage
```

## 3. Key design decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Single privacy gatekeeper** `projectProfile()` (TS) / `project_profile()` (SQL) | All other-member biodata passes through one function → hidden fields are never serialised (PRD §9.3). Tested in both layers. |
| D2 | Other members' `profiles` rows are **not selectable** via RLS; discovery uses SECURITY DEFINER RPCs | Field-level privacy can't be expressed in RLS alone; RPC returns the projection. |
| D3 | Discovery responses **never** contain contact details, even when consented | Contact is shown only on the profile view / requests screen. |
| D4 | Filters on optional fields pass profiles with missing data unless `strictOptional` | PRD §9.2. Filters run on the *projected* profile, so private values can't be probed by filtering. |
| D5 | Consent is per request, per scope (photos / phone / full biodata), only valid while request is `accepted` | PRD §12. Consent changes are audit events. |
| D6 | Pricing = one config row; `pricingCopy()` generates copy; orders snapshot terms | PRD §8: no hardcoded prices, original terms preserved, no auto-renew. |
| D7 | Announcement “view” = user opens it; bulk mark-all-read is **not** a view; push reported as `not_configured` until a provider exists | PRD §14 honesty requirements. |
| D8 | Age from DOB only; min age 18 (bride) / 21 (groom) | Indian law; configurable per market. |
| D9 | Language switch = `i18n.changeLanguage` + root `direction` style (no reload) | PRD §4 immediate switch. Web also sets `<html dir/lang>`. |
| D10 | Script fonts lazy-loaded per language | First load ~1.3 MB fonts instead of ~3.8 MB. |
| D11 | Expo Router file routes; admin & tabs guarded in layouts **and** on the backend | UI guards are UX only (PRD §15). |

## 4. Data model (Supabase)
See `supabase/migrations/20261028000000_init.sql`. Tables: `app_users`, `profiles` (biodata JSONB + generated, indexed search columns), `shortlists`, `contact_requests` (unique open request per pair), `consents`, `blocks`, `reports`, `view_events`, `pricing_config` (singleton), `pricing_history`, `orders`, `announcements`, `announcement_deliveries`, `notifications`, `audit_events`. Storage bucket `profile-photos` (private, owner-folder policies).

Column-level grants stop users changing `role`, profile `status`, `boost_until`, etc. — those move only through RPCs.

## 5. Security checklist
- [x] RLS on every table; tested (`scripts/test-db.sh`).
- [x] No service-role key in the client (`.env.example` warns; only `EXPO_PUBLIC_*` anon values).
- [x] Admin RPCs check `is_admin()`; recipient-level report access is audited.
- [x] Phone numbers masked in admin lists.
- [x] Rate limits: OTP resend cooldown 30 s, max 3 resends / 10 min, 5 verify attempts; 20 requests/day.
- [x] Two-way blocking; reports; deactivate; hard delete with cascade.
- [ ] Phase 2: real SMS OTP (Supabase Auth + MSG91/Twilio), CAPTCHA on OTP request, signed photo URLs, payment webhook signature verification, Sentry.

## 6. Performance notes
- Web: routes are code-split (shared entry chunk ≈1.1 MB minified, before gzip; each screen 2–30 KB); script fonts lazy-loaded.
- Lists: `FlatList` with `initialNumToRender`, `windowSize`, `removeClippedSubviews`; memoised cards/callbacks; 10/page infinite query.
- Shortlist toggle is optimistic; queries `staleTime` 15–30 s; no refetch on focus; notifications poll every 60 s.
- Filter screen debounces the live match count (250 ms).
- Images via `expo-image` with memory+disk cache.
- DB: generated columns + B-tree/GIN indexes for discovery; `limit ≤ 50`.

## 11. Admin console: profile IDs, search, alerts, relation badges
- **Profile IDs:** demo `db.nextCode` counter / SQL `profile_code_seq` sequence → `HR-<n>`, unique and immutable (a trigger blocks changes). Sequences never reuse numbers, so an ID always means one member.
- **Relation:** `relationWith()` (demo) / `relation_with()` (SQL) returns the latest request between the viewer and the profile, in either direction, as `{status, direction, at}`. It is attached in `searchProfiles`, `getShortlist` and `getProfile`. The UI maps it with `relationBadge()` and `declinedRecently()` (`src/domain/connections.ts`). It never carries contact data.
- **Search:** `adminSearch(q)` / `admin_search(text)` (SECURITY DEFINER, `is_admin()`). Matching depends on the query: `HR-123…` matches the code prefix; digits-only matches the phone and writes `admin.search_phone` to the audit log (last 4 digits only); anything else matches name, city, locality or code. At most 50 rows, always masked. `adminGetMember(userId)` adds the profile, interests, reports filed by and about the member, and orders.
- **Alerts:** `alertAdmins(kind, params, deepLink)` / `alert_admins()` insert a `notifications` row of type `admin_alert` for every active admin. In SQL they are fired by triggers: `reports` insert, `orders` status → paid/failed, `profiles` status → pending, `app_users` hard delete (member self-deletion only, not a purge from Trash), and security actions in `audit_events`. The English copy for the console is in `src/domain/adminAlerts.ts`.
- **Migration:** `20261031000000_admin_console.sql`; tests: `supabase/tests/40_admin_console.test.sql`.

## 13. Boost guarantee & push pipeline
```
any action ─► notify() / INSERT notifications ─► trigger enqueue_push ─► push_outbox (queued | skipped:reason)
                                                     │ prefs · inactive · ≤12/h (account exempt) · per device
pg_cron 1/min ─► edge fn push-dispatch ─► claim_push_batch (FOR UPDATE SKIP LOCKED, device-owner re-check)
                     │ render text (supabase/functions/_shared/push.ts ⇐ synced copy of src/domain/push.ts)
                     ├─► Expo /push/send (100/req) ─► push_result: sent | retry 30·2ⁿ s (≤5) | DeviceNotRegistered → token deleted
                     └─► Expo /push/getReceipts (≥15 min) ─► push_receipt: delivered | failed
app ─► PushBridge: on sign-in re-bind token · taps → deep link + mark read · badge = unread · in-app arrival banner
```
- **Featured:** `getFeatured()` / `get_featured()` decide eligibility with `isFeaturable()`, apply the type rule and blocks, and use a daily rotation (FNV-1a hash in the app, md5 in SQL). They write one `boost_impressions` row per viewer, profile and day. Dashboard reach = unique viewers since `boost_started_at`.
- **Boost lifecycle:** `apply_boost(order)` (service only, idempotent per order; ~~extensions keep the start date~~ since V3 it **refuses while a boost is active**, see §17) and `run_boost_jobs()` (pg_cron) with `boost_notices` markers, so each notice is sent exactly once.
- **Client:** `src/services/push.ts` (expo-notifications, Android channel "default" with PRIVATE lock-screen visibility, projectId from EAS). `src/components/PushBridge.tsx` and `src/components/PushSettings.tsx`.
- **Limits:**
  - Expo Go on Android cannot receive remote push (SDK 53+), so it needs a development build. Web is in-app only.
  - Real delivery needs an EAS projectId, FCM (Android) and APNs (iOS) credentials, and the `push-dispatch` function deployed with `PUSH_CRON_SECRET`.
  - The demo records what would be sent (`not_configured`).
- **Migration:** `20261101000000_boost_and_push.sql`. Tests: `supabase/tests/50_boost_push.test.sql`, `__tests__/boostPush.test.ts`, `e2e/boostpush.js`.

## 12. UI layer (Design PRD v1.0)
- **Theme:** `src/theme/tokens.ts` (colours, spacing, radius, shadow, `motion` timings) and `src/theme/fonts.ts` (Lora + Inter base; Urdu and Telugu loaded on demand).
- **Art:** `src/components/art/Illustrations.tsx` (BrandMark, HeroScene, DomeArt, CornerFlourish), pure react-native-svg with no image downloads.
- **Navigation:** `(tabs)` = home, discover, shortlist, requests, dashboard (labelled "Profile"). `/notifications`, `/language`, `/legal/help` are stack screens.
- **Feedback:** `src/services/feedback.ts`. A zustand store persisted in AsyncStorage (`hr.prefs.feedback`), expo-haptics, and expo-audio players created lazily. All calls are fire-and-forget and swallow errors.
- **Motion:** RN `Animated` with the native driver plus `useReducedMotion()`. No Reanimated dependency was added.
- **No logic changes:** components call the same hooks and backend methods as V1. The card's Express Interest reuses the profile screen's checks via `?express=1`.

## 7. Testing strategy
| Layer | Tooling | What |
|---|---|---|
| Domain | Jest | age, formatting, validation (Other fields, min age, ranges), privacy projection, search semantics, pricing copy matrix, metrics |
| Backend contract | Jest + DemoBackend + fake clock | OTP limits/expiry, publish workflow, paid/failed/free orders, price-change immutability, boosts, requests/consent, blocking, admin authZ, announcements analytics & scheduling, deletion |
| i18n | Jest | UR/TE key coverage + placeholder parity |
| Database | psql + Postgres 16 | RLS isolation, column grants, projection privacy, consent flow, admin audit |
| Security | Jest + psql | `__tests__/attacks.test.ts` (20 app-rule attacks), `supabase/tests/60_attacks.test.sql` (73 DB attacks), `dataSize.test.ts` (store stays bounded) |
| Auth | Jest + psql + Playwright | `pinLogin.test.ts` (20), `pinLoginEdge.test.ts` (15), `oneBiodata.test.ts` (22), SQL `80_one_biodata` (17), `90_pin_login` (37), e2e `pin.js`, `onebiodata.js` |
| Boost & motion | Jest + psql + Playwright | `boostTab.test.ts`, `boostPlans.test.ts`, SQL `95_boost_tab`, `96_one_boost`, `98_boost_plans`, e2e `boost.js`, `transitions.js` (samples frames) |
| Totals at V3 | | Jest 214 / 13 suites · SQL 11 suites (13 migrations) · e2e 12 suites / 85 steps. All e2e logins go through `e2e/auth.js` (handles PIN screens) |
| E2E | Playwright (web export) | `console.js`: relation badges, report → admin bell → alerts deep link → search by ID → member page → pause, masked phone search; plus landing/lang/RTL, login, discover/filters/profile, requests/consent, dashboard, wizard → publish → approve → custom-value search, admin guard |

## 8. Environments
| Env | Backend | How |
|---|---|---|
| Local / Expo Go / web dev | Demo (offline) | `npm start` / `npm run web` |
| Staging | Supabase project (staging) | set `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` (after Phase 2 adapter) |
| Production | Supabase (prod) + EAS builds | `eas build`, `eas submit`, `eas update` |

### Expo Go vs development builds
Everything in the MVP runs in **Expo Go** (no custom native modules). A **development build** will be required for: remote push notifications on Android (Expo Go SDK 53+ removed it), Razorpay/Stripe native SDKs, and SMS auto-read of OTP on Android.

## 9. Admin governance (master, sub-admins, Trash, recovery)

### Roles & powers
| Capability | Member | Sub-admin | Master |
|---|---|---|---|
| Approve / reject / pause / resume / delete profiles, remove photos | – | ✅ | ✅ |
| One-click **manual approval ON/OFF**, approve all pending | – | ✅ | ✅ |
| Suspend / reactivate / delete **members** | – | ✅ | ✅ |
| Suspend / delete **sub-admins** | – | ❌ | ✅ |
| Act on the **master** account | – | ❌ | ❌ (only transfer/recovery) |
| Delete requests, reports, announcements; cancel pending orders | – | ✅ | ✅ |
| View Trash | – | ✅ | ✅ |
| Restore / erase from Trash | – | ❌ | ✅ |
| Add / remove sub-admins (max 10) | – | ❌ | ✅ |
| Transfer master role (fresh OTP required) | – | ❌ | ✅ |
| Recovery codes, backup phone, cancel a recovery | – | ❌ | ✅ |
| Delete audit log or payment records | ❌ | ❌ | ❌ (append-only, enforced by DB triggers) |

Role is re-checked on **every** request, so demotion/suspension/deletion takes effect on the next call.

### Invariants (enforced in both DemoBackend and Postgres)
1. **At most two masters** (owner decision 2026-10-29) — trigger `app_users_max_two_masters` (advisory lock; replaced the unique index `one_master`). Masters cannot manage each other; transfer swaps the caller with a sub-admin; recovery demotes every other master (`20261116000000_two_masters`).
2. Nobody can act on themselves or on the master; only the master acts on sub-admins (`assert_can_manage`).
3. Admin deletes are **soft** (Trash, 30-day window, then auto-erased). Member self-deletion is immediate (privacy right).
4. `audit_events` cannot be updated/deleted; `orders` cannot be deleted (erased members' orders are detached, not removed).
5. Admin **suspension** survives re-login; a member's **self**-deactivation is undone by logging in.

### Lost-phone recovery (master)
```
Master loses phone
   │  opens app on any phone → "Master admin: lost your phone?"
   ▼
Enter phone in hand → OTP proves possession  +  one recovery code (bcrypt-hashed, single-use)
   │
   ├─ phone == verified backup phone ──► master role moves immediately
   │
   └─ any other phone ──► 72-hour time-lock; all admins alerted; real master can CANCEL
                           └─ not cancelled → completes automatically (pg_cron job)
After any recovery: old master → member; all codes + backup phone cleared → new master must set up again.
```
- Guessing is rate-limited (5 failures/hour, global) and audited; only one recovery can be in flight.
- Step-up: generating codes and transferring master need a fresh OTP (DB: session `iat` < 5 min).
- **Break-glass** (phone + codes + backup all lost): `break_glass_set_master(cc, phone, ticket)` — not callable from the app; run in the Supabase SQL editor by the technical owner after out-of-band identity checks (two people, ticket logged). Audited.

Tests: `__tests__/governance.test.ts` (20), `supabase/tests/20_governance.test.sql`, `e2e/admin.js`.

## 10. Connections: interest, phone offers, poke

```
Express Interest ──► ContactRequest(pending, expiresAt = now + requestExpiryDays, pokes = [])
      │                    └── optional PhoneOffer(withInterest, offered, consent text + time)
      │
Recipient ── Accept ──► request accepted ── withInterest offer still 'offered'? ──► offer accepted → number visible to recipient only
         └─ Decline ──► request declined, offer expired, nothing revealed
After acceptance: either side ── Share My Number ──► PhoneOffer(offered) ── other accepts ──► revealed (one direction only)
Sender ── Withdraw offer (only while 'offered') / Withdraw interest (pending) / Poke (rules below)
Block ──► every pending/accepted request between the pair → 'blocked'; open offers withdrawn; revealed numbers hidden again
Job ──► pending past expiresAt → 'expired' (offers expire, sender notified)
```
- **Single source of truth for reveal:** `scopesFor().phone` (demo) / `consent_scopes().phone` (SQL) = an *accepted* offer from owner → viewer on an *accepted* request. The old consent toggle can no longer reveal a number.
- **Races:** SQL uses `SELECT … FOR UPDATE` on the request/offer rows; the demo backend runs each call atomically. Whoever commits first wins; the loser gets `invalid_state`.
- **Idempotency:** client sends a key per screen visit; `(user, key)` is unique; repeats return the original row.
- **Poke rules:** `pokeEligibility()` — sender only · pending & unexpired · ≥ `pokeWaitHours` · one per request · ≤ `pokeMaxPer7Days` per recipient (rolling, across requests) · `allowReminders` opt-out. Pokes are anonymous and never change status.
- **Privacy:** notifications carry names and an `offered` flag, never numbers; analytics carry ids/booleans only; admins see masked numbers; revealed numbers render only in `ContactActions`.
- **Re-sending:** allowed after expiry or withdrawal; blocked for 30 days after a decline.

## 14. Security hardening & data retention (2026-10-28, "break it and fix it")

Every rule below has a regression test that tries the attack and must fail to get through.

**Database (`20261102000000_security_hardening.sql`, test `60_attacks.test.sql`: 73 attacks blocked).**
- Deny-by-default `EXECUTE`: all functions revoked from `public/anon/authenticated`; only an explicit allow-list (search, profile, interests, offers, push settings, admin/master RPCs) is granted. Closed: anonymous calls to `display_name_of`, exposed crypto helpers.
- Shortlists only for profiles the member can see (`can_view_profile`); no updates.
- Biodata ≤ 32 KB; photos must be the owner's own storage paths (`<uid>/<id>.jpg|png|webp`), never free URLs.
- Reports: column-level insert (status can't be forged), known reasons, one open report per pair, 10/day.
- Length caps: push token ≤ 200, idempotency key ≤ 100, message ≤ 4000, push prefs ≤ 1 KB.
- Deep links on notifications/announcements must be in-app paths; announcement images https only.
- Test harness no longer over-grants table privileges, so tests see real Supabase defaults.

**App backend rules (`src/domain/security.ts`, test `__tests__/attacks.test.ts`).** 12 of 20 attack tests got through before the fix; all are now blocked: oversized/garbage biodata, svg/script/remote-tracker photos, unknown report reasons, self-reports, report-bombing, self-blocking, ghost-profile blocks, giant idempotency keys and push tokens, unknown languages, non-boolean consent, unbounded search page size, announcement edits that forged status/author, off-app links and http images in announcements. Ownership checks on requests, offers, notifications, orders and admin actions already held.

**Client.** Every notification/push tap goes through `safeDeepLink()` (a push payload is untrusted input). Photos: originals up to **5 MB** (JPG/PNG/WEBP/HEIC; svg/gif/pdf refused) are resized to ≤ 1600 px JPEG on the phone (`src/services/photos.ts`, expo-image-manipulator), which also strips EXIF/GPS; at most 1.5 MB is stored per photo.

**Data size.**
- Demo store prunes data nobody reads back: inbox keeps the newest 200 per member, idempotency keys expire after 24 h, expired OTPs are dropped, analytics keep 2000 events, and boost impressions are kept for 180 days. A flooded store went from 8.5 MB to about 0.4 MB (`__tests__/dataSize.test.ts`).
- Server: `run_retention()` (daily via pg_cron) applies the same limits, with 30 days for finished push-log rows and 400 days for analytics (`70_retention.test.sql`).
- Lifetime records are never pruned: views, audit log, orders and reports.

**Bundle.** The Supabase SDK is no longer bundled in demo builds. The flag now lives in `services/supabase/config.ts`. That cut web JS from 4.08 MB to 3.80 MB (−276 KB raw, −67 KB gzip). The Urdu and Telugu fonts already load only when that language is chosen.

## 15. One mobile number = one account = one biodata (2026-10-28)

The owner's rule: a mobile number can only ever have one biodata. A fresh biodata is possible only after the member **deletes their account** and signs up again.

| Layer | How it is enforced |
|---|---|
| **Number** | `normalizePhone()` (`src/domain/security.ts`) turns every spelling into one form. Spaces and dashes are removed, `+091` becomes `+91`, the leading `0` is dropped, and a repeated `91` is removed. Indian numbers must be 10 digits starting with 6–9. Logins, sub-admin invites, backup phone and recovery all use it. Accounts are matched on the full `+<cc><number>`. |
| **Account** | DB: check constraint `phone_canonical` plus a unique index on `country_code ‖ phone`. This means "+1 2025550123" and "+12 025550123" (the same E.164 number) can't both exist. Members can't change their number: there is no update grant. |
| **Biodata** | DB: `profiles.user_id` is unique, and a soft-deleted biodata still holds the slot. The `profiles_one_per_number` trigger refuses a second biodata. Members can't move a biodata to another account (`user_id` is not updatable). App: `saveDraft` only ever edits the one biodata, including under double taps. |
| **Removed by the team** | When an admin deletes a biodata, the account gets `profile_removed_at`. No new biodata is allowed while it is in Trash, nor after it is purged. The member sees a "Biodata removed" notice that links to Settings. A master **restore** clears the mark and brings back the original. |
| **Fresh start** | Only **Delete account** (Settings) removes the account row. The number is then free for one new account and one new biodata, with a new HR- number (codes are never reused). An account an admin deleted can't sign in again with any spelling of its number. |

Tests: `__tests__/oneBiodata.test.ts` (22), `supabase/tests/80_one_biodata.test.sql` (17 checks), `e2e/onebiodata.js`. Without the migration, the DB accepted `+91 09555500001` as a second account for an existing number.

Not covered: one *person* using two *different* SIMs. A number can't prove identity. Admin duplicate-detection (same name + date of birth) is a possible Phase 2 item.

## 16. OTP registration + 4-digit PIN login (Mini PRD, 2026-10-28)

**Goal:** fewer OTPs (cost) and easy return logins, with members staying signed in until they log out.

**When an OTP is sent:** only for
- first registration;
- a new phone;
- Forgot PIN;
- setting up a PIN on an account from before PINs.

Normal returning login never sends one.

**Security model**

| Piece | Demo backend (runs today) | Supabase (production design) |
|---|---|---|
| Session | Random 256-bit token in the phone's secure storage; the server keeps only its SHA-256. Survives restarts. Revoked by logout, PIN reset/change (other phones), suspension, admin deletion, account deletion, master recovery, or 180 idle days. | Supabase Auth session (refresh token in SecureStore). The `pin-login` function issues it. `set_pin` and the suspension trigger delete `auth.sessions` rows. |
| Device key | Created when an OTP succeeds on this phone (`hr.auth` in Keychain/Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, never restored from backups). The server stores its SHA-256. | `trust_device()` (needs an OTP in the JWT `amr` from the last 10 min) → `trusted_devices`. |
| PIN | Salted, iterated SHA-256 (`slowHash`). Weak PINs refused (`pinProblem`). | bcrypt (`crypt(..., gen_salt('bf', 10))`). The same weak-PIN rule is in SQL `pin_problem`. |
| PIN login | `pinLogin()` needs the number, a trusted device key and the PIN. An unknown number or untrusted phone returns `device_not_trusted` (no account probing). | `pin-login` Edge Function → `pin_login_check()` (service role only). Approved logins get a session via a one-time password that is set and then destroyed immediately. |
| Lockout (server-side) | 5 wrong in a row → 15 min lock; 10 in 24 h → only Forgot PIN (OTP) unlocks. Counters are saved even when the call fails, so restarts don't reset them. | Same rules in `pin_attempt()`. It never raises on a wrong PIN, so counters are committed. |
| Set / reset / change | Allowed right after an OTP (one PIN change per OTP, within 10 min) or with the current PIN. A wrong current PIN counts toward the lock. A reset or change signs out every other phone. | `set_pin()` with `otp_used_at`, the same rules, and deletes other `auth.sessions`. |
| Members can't read | — | `login_pins`, `pin_failures`, `trusted_devices`: RLS on, no policies, grants revoked. |

**Flows (app)**

**Registration:** number → OTP → `/pin` (create, then confirm) → biodata.
- The create step shows: "Create a 4-digit PIN for quick and easy login next time. You won't need an OTP every time."

**Returning user on this phone:** `/login` opens in PIN mode. It shows the registered number, 4 cells, Log in, Forgot PIN? and Use a different number.

**New phone:** the PIN is refused with "verify this phone once" → OTP → straight in. There is no PIN setup and no biodata redo.

**Forgot PIN:** OTP to the registered number → `/pin?mode=reset` → logged in, and other phones are signed out.

**Settings → Login PIN:**
- **Set up PIN** (older accounts): OTP first, then create.
- **Change PIN:** current PIN, then new, then confirm.

**Migration:** accounts and logins from before PINs are kept. The old store is upgraded in place, never reseeded. A member signed in before the update stays signed in, and sets a PIN after their next OTP or from Settings.

**Web:** browsers have no secure enclave, so the web build keeps the token and device key in local storage. That's fine for the demo/preview. The phone apps use Keychain/Keystore (`src/services/secureStorage.ts`).

**Tests:**
- `__tests__/pinLogin.test.ts` (20)
- `__tests__/pinLoginEdge.test.ts` (15)
- `supabase/tests/90_pin_login.test.sql` (37 checks)
- `e2e/pin.js` (12 steps)
- The shared e2e login (`e2e/auth.js`) handles the PIN screens for all other suites.

**Still to do with the Supabase adapter (Phase 2, T-068):**
- The app's Supabase client calls `trust_device` after `verifyOtp`.
- It calls the `pin-login` function for PIN login.
- It stores the session with SecureStore.
- Enable phone + password sign-in in Supabase Auth (needed for issuing sessions).

## 17. Boost centre tab, reminders, one boost at a time (2026-10-28)
- **Navigation:** `(tabs)` = home · discover · **boost** · requests · dashboard.
  - The Boost tab uses a custom `tabBarButton` (`BoostTabButton`, a raised circle that reads `aria-selected` from React Navigation 7).
  - `/shortlist` moved out of `(tabs)` to a stack screen (a hidden tab with `href:null` would break direct URLs).
- **State:** `boostNudge(profile, boostDisabled)` → `no_profile | not_published | active | disabled | ready`. `ready` drives the tab dot and halo, the Home `BoostReminder` card (AsyncStorage snooze 3 days) and the Boost screen.
- **Weekly reminder:** `boostReminderDue()` (demo `processScheduled`, SQL `run_boost_jobs`).
  - Not within 2 days of publishing, nor within 7 days of a boost ending; never while boosting is disabled.
  - Stored in `profiles.boost_reminded_at`. Push category `announcements`, so members can switch it off and the hourly cap applies.
  - All boost notices deep-link to `/boost` (SQL trigger rewrites old `/dashboard` links).
- **One boost at a time:**
  - Demo `startBoost` throws `boost_active` while a boost is active and reuses the one pending boost order.
  - `completePayment` cancels a stray second order before charging, and `applyBoost` never extends.
  - SQL: unique index `orders_one_open_boost` (one pending boost order per profile), `orders_boost_guard` (no boost order while active), and `apply_boost` raises `boost_active`; the payment webhook must refund in that case.
- **Migrations:** `20261106000000_boost_tab.sql`, `20261107000000_one_boost_at_a_time.sql`.
- **Screen transitions:** `src/navigation/transitions.tsx` (stack options per platform/RTL/Reduce Motion, tab shift, web `screenLayout` fade+rise).

## 18. Production QA and security round 2 (2026-10-28, "become a tester … try to break the security")
- **QA tooling (web build, Playwright):**
  - `e2e/crawl.js` visits every screen as 5 roles (visitor, new member, member, master, sub-admin) × EN/UR × 360/320 px. It flags crashes, console errors, error screens, horizontal overflow, controls with no accessible name and touch targets under 24 px. Report: `e2e/screenshots/crawl/report.json`.
  - `e2e/clickthrough.js` presses the remaining buttons like a member would (13 flows, one fresh browser each).
  - `e2e/csp.js` runs the app under the production security headers and fails on any CSP violation, a missing header, framing or `unsafe-eval`.
- **App-wide fixes from QA:**
  - Selected/checked/disabled state uses `aria-*` props (react-native-web ignores `accessibilityState`).
  - The admin console is always English + LTR (`UiLang` in `src/i18n/uiLang.tsx`). Text direction follows its own script (`strongDir` in `Text.tsx`). Dates are localized (`formatDate(iso, lang)`).
  - Switches are one accessible control (`SwitchVisual`), so RTL doesn't detach the knob.
  - A server-revoked session (suspended, removed, signed out elsewhere) ends cleanly: the query/mutation error handler plus a re-check on app foreground clear the cache and go to `/login`. A crash screen (`ErrorBoundary` in `src/app/_layout.tsx`) replaces the white screen.
  - Filters → Discover always lands on Discover (`dismissTo`). The block list shows the real profile ID + name (`getBlockedProfiles`).
- **Security round 2:**
  - **OTP guessing across resends:** each new code used to reset the 5-guess counter. Now there is also a per-number cap of 10 wrong codes per hour that survives resends (`MAX_OTP_FAILS_PER_HOUR`). While the cap is hit, no new code is sent and even the right code is refused. In production, Supabase Auth's OTP rate limits apply in addition; `supabase/config.toml` sets `[auth.rate_limit]` (`sms_sent`, `token_verifications`, `sign_in_sign_ups`).
  - **Invisible spoofing characters:** `UNSAFE_TEXT` / `unsafeText` / `stripUnsafe` in `src/domain/security.ts` cover bidi overrides/isolates, zero-width space, word joiner, BOM and control codes. ZWNJ/ZWJ and LRM/RLM stay allowed because Urdu and Telugu need them.
    - Biodata fields are refused (`v.badChars`).
    - Interest messages and report details are cleaned.
    - Announcements are refused.
    - SQL twin: `20261108000000_text_safety.sql` (`text_is_safe`, `biodata_text_safe` CHECK `not valid`, strip triggers on `contact_requests.message` and `reports.details`).
  - **Web security headers:** `public/_headers` (copied to `dist/`; Netlify and Cloudflare Pages read it).
    - CSP: `script-src 'self'`, no eval, `frame-ancestors 'none'`, `connect-src` limited to self and `*.supabase.co`.
    - Also nosniff, `X-Frame-Options: DENY`, a strict referrer policy, a Permissions-Policy (camera/mic/geo off), COOP and HSTS.
    - zod runs `jitless` so no runtime code generation is needed.
    - For Vercel/nginx, copy the same header values. `e2e/serve.js` applies them in every browser test.
  - **App permissions:** the photo picker no longer adds camera/microphone permissions (blocked in the Android manifest; the app only picks from the library). `android.allowBackup: false` keeps cached member data out of cloud backups. `ios.config.usesNonExemptEncryption: false` is set for App Store export compliance.
  - **Redirect params:** `login?next=` is a closed set (`biodata` / `discover`); `pin?next=` goes through `safeDeepLink` (in-app paths only). No open redirects.
  - **npm audit:** 16 findings (deepmerge in `@expo/config`, zod 3 in `@expo/cli`, jest). All are build-time tools, not in the shipped app. `npm audit fix --force` would downgrade Expo to SDK 51, so don't use it; take Expo patch updates (`npx expo install --fix`) instead.
- **Tests:**
  - Jest: `attacks.test.ts` gains the OTP-resend brute force, spoofing characters and announcement tests (218 total).
  - SQL: `97_text_safety.test.sql` (12 suites).
  - e2e: `crawl`, `clickthrough`, `csp`.

## 19. Boost options, My Boost, Home cards and Profile tab (2026-10-29, owner Mini PRD)
- **Pricing model:** `PricingConfig.boostPlans: BoostPlan[]` = `{id, days, fee: {bride, groom}, enabled, popular}` (`src/domain/types.ts`).
  - `resolvePricing(cfg, type).plans` lists the options a member can buy, shortest first; `boost` / `boostDays` are the default option's values.
  - `validatePricing` requires 1–6 options with unique ids (`[a-z0-9_-]{1,20}`) and unique durations of 1–90 days, sane fees and at most one Popular.
  - `syncBoostSummary` keeps the legacy `boost` / `boostDays` fields equal to the default option on every save. `withBoostPlans` upgrades configs saved before options existed (demo `load()` backfill; no schema bump).
- **Buying:** `startBoost(planId?)` takes the price and length from the live config only (an unknown or switched-off option → `fee_disabled`). Order `terms = {pricingVersion, boostDays, planId, autoRenew:false}`. A repeat request for the same paid option returns the same open order; another option cancels it and creates one. A free option is applied at once. `boost_active` rules from §17 still apply.
- **SQL** (`20261109000000_boost_plans.sql`):
  - seeds `config.boostPlans`; CHECK `boost_plans_ok(config)`
  - `boost_plan_terms(profile, plan)` returns the server price for the profile's type (service role only)
  - trigger `orders_boost_terms`: every new boost order must match its option's amount, length and free/paid status, with no auto-renew
  - trigger `pricing_boost_summary` keeps `boost_days` in sync
  - view, shortlist and payment notices link to `/activity`
  - The payment Edge Function (Phase 2) must create orders from `boost_plan_terms`.
- **Analytics:** `dashboardMetrics` adds `boostState`, `boostDays`, `boostViews`, `previousViews`, `boostWindow` and `previousWindow` (`boostComparison` in `src/domain/metrics.ts`). "Before" exists only if the profile was published for the whole same-length window before the boost; owner views are always excluded.
- **Completion:** `profileCompletion(biodata)` (`src/domain/completion.ts`) uses weighted items: basic 3, about 1, location 2, career 2, religion 1, practice 1, family 2, preferences 2, privacy 1. It returns the percentage and the first missing item's wizard step, and the profile counts as complete at 100 % (`PROFILE_COMPLETE_AT`).
- **UI:**
  - `src/components/HomeCards.tsx` (`CompletionCard`, `ActivityStats`, `BoostPromoCard`), `ProgressRing.tsx` and `src/hooks/useBoostStatus.ts`
  - screens `src/app/boost.tsx` (options + My Boost) and `src/app/activity.tsx`
  - the Profile tab list in `src/app/(tabs)/dashboard.tsx`; the Shortlist tab is `src/app/(tabs)/shortlist.tsx`
  - Removed: `BoostTabButton`, `BoostPanel`, `BoostReminder`.
- **Tests:**
  - Jest: `boostPlans.test.ts` (options, prices, switching, free, upgrades, honest comparison).
  - SQL: `98_boost_plans` (seed, server price, forged orders refused, price changes, nonsense configs).
  - e2e: `boost.js` (tabs, completion updates after saving, activity, options + checkout, My Boost, Profile rows, admin price change, free boost, ended boost, unpublished).

## 20. Live interest state, Requests badge, notification banners (2026-10-29)
- **Interest sent is shown at once:** `useSendRequest` re-fetches `requestWith(id)` and `profile(id)` before resolving (`refreshAfterInterest` in `src/hooks/queries.ts`). It also invalidates search, featured, shortlist, requests, notifications and dashboard, so every card's relation badge updates.
  - The profile footer shows an "Interest sent" / "Connected" / "Sent you interest" pill (`testID interest-sent`) instead of the button.
  - Nothing is offered while the pair's status is still loading.
  - `/request/[id]` shows "already expressed interest" when an active request exists, and a `duplicate` error from the server is treated as "already sent", never as a failure.
  - The server rules are unchanged: one active request per pair, idempotency key, SQL `send_request`.
- **Requests tab badge:** `pendingReceivedCount(requests)` (`src/domain/connections.ts`) counts received interests that are pending and not expired. It feeds `tabBarBadge` (red, 99+ cap) and an accessible label ("Requests, N new interests"). `useRequests` and `useNotifications` refresh every 30 s and on app focus.
- **Banners:** the in-app banner (`PushBridge`) queues up to 5 new notifications and shows them one after another (4.5 s each), so a paid boost shows "Payment confirmed" then "Your boost is active".
  - `request_accepted` carries `numberShared: '1'` when the accepted interest included the sender's number → "…accepted your interest. They can now see the number you shared." (demo `respondToRequest`; SQL trigger `notifications_accept_detail` in `20261110000000_notification_details.sql`).
- **Tests:** Jest `notifyDetails.test.ts`; SQL `99_notification_details`; e2e `livestate.js`.

## 21. Team-added members (2026-10-29)
- **Data:** `User.createdBy` (admin id) and `claimedAt` (the owner's first OTP sign-in); `Profile.createdByAdminId` and `ownerReviewedAt` (the owner's first save).
- **Demo backend** (`demoBackend.ts`, "team-added members"):
  - `adminCheckPhone` (normalised; `existingUserId` when taken)
  - `adminCreateMember` (account + draft; `phone_taken` if any account has the number)
  - `adminSaveMemberBiodata` / `adminPublishMember` (only while unclaimed; publish needs a complete biodata, goes live directly, sends `team_created`)
  - `adminGetMemberDraft`
  - `verifyOtp` sets `claimedAt`; `saveDraft` by the owner sets `ownerReviewedAt`
  - Sub-admins have the same powers (`this.admin()`).
- **Production:**
  1. The admin app calls the Edge Function `admin-create-member` (`supabase/functions/admin-create-member/`, core in `create.ts`) with the admin's JWT. It verifies `is_admin()` as the caller, normalises the phone, and creates the Supabase Auth user for that phone (`phone_confirm` false) via the Auth admin API. It then calls `admin_create_member()` (service role only), which inserts `app_users` (same id, `created_by`) plus the draft profile. If the database refuses, the Auth user this call created is deleted (an existing one is never touched).
  2. Later edits and publishing go through the RPCs `admin_save_member_biodata` and `admin_publish_member` (`is_admin()`, unclaimed only).
  3. When the owner signs in with phone OTP, Supabase Auth matches the same user by phone, so the session is that account. The client calls `claim_account()` once after OTP sign-in. **The Phase 2 adapter must do this and must never create a second `app_users` row**; the unique phone stops it anyway.
  4. Trigger `profiles_owner_reviewed` sets `owner_reviewed_at` on the owner's first biodata save. `harden_profile_insert` clears the team flags on member inserts.
  - Migration `20261111000000_team_members.sql`.
- **UI:**
  - `src/components/BiodataWizard.tsx` is the shared 7-step form: the member's `/biodata` and the admin's `/admin/member-biodata` use it. It follows the area language, so it is English in the console.
  - `/admin/add-member`, `/admin/member-review`
  - Member page badges and actions; Users badges; Home `TeamCreatedNote`.
- **Tests:**
  - Jest: `teamMembers.test.ts`, `adminCreateMemberEdge.test.ts`
  - SQL: `99_team_members`
  - e2e: `teammember.js`, end to end (admin adds 9999999999 → publishes → duplicate refused → sub-admin adds → owner logs in with OTP → same account and biodata → review clears the note → admin sees "claimed").

## 22. Expert-team simulation and scale (2026-10-29)
- **Owner ask:** "build an expert team… an admin, multiple users… expresses interests, pays for boost, deletes their profile… find the issues and fix… improve performance".
- **Simulation** (`__tests__/simulation.test.ts`): one shared server store and one phone per person (its own secure storage: session token, trusted device, PIN). The cast is the master, the sub-admin, 14 seed members, newcomers who register over time, and the owners of team-added numbers, who claim their accounts with OTP.
  - **Members:** browse, shortlist, express interest (also checking that it shows at once and that a retry is the same request), accept/decline/withdraw/poke, offer and accept numbers, consent, boost and pay (success, failure, abandoned checkout), edit, pause, block/report, log out and in (PIN or OTP), deactivate, delete (and sometimes re-register).
  - **Team:** moderate, resolve reports, change boost prices and options, add and publish members, suspend/delete/restore accounts, housekeeping.
  - **After every action** the whole database is checked: one number = one account; one live biodata per account; codes never reused; no orphan requests, offers or shortlists; never two open requests per pair; a shared number only on an accepted request; one open boost order per profile; honest amounts; every running boost backed by a paid or free order; no live session for removed accounts.
  - **Also checked:** search never shows a number, a non-live, same-side or blocked profile.
  - **Failures:** an unexpected exception (anything but `AppError`) counts as a bug.
  - **Runs:** `SIM_STEPS`, `SIM_SEEDS`, `SIM_REPORT` (timings per operation and the refusal mix).
- **Fixes from the pass:**
  - `me()` hashed the session token once per user row on every request (O(users)).
  - My Orders, Shortlist ids and Blocked re-ran `me()` per row.
  - Discover and Featured rescanned requests, consents, blocks, users and the viewer's own profile for every candidate (quadratic). They now use `viewerContext()` (indexes built once, same answers).
  - The weekly boost-reminder pass looked up users per profile.
  - At 2,000 members: search 239 → 50 ms, Featured 60 → 38 ms, Requests 24 → 13 ms, Home dashboard 17 → 10 ms, My Orders 17 → 8 ms (`__tests__/scale.test.ts` guards correctness and bounds).
- **SQL:** `20261112000000_hot_path_indexes.sql` indexes the foreign keys that member screens and RLS policies filter by (requests by sender/recipient, consents, blocks, shortlists, orders, offers, reports, views, impressions, deliveries).

## 23. WhatsApp login codes via Waplify (2026-10-29)
- **Flow:** Supabase phone OTP → **Send SMS hook** → Edge Function `send-whatsapp-otp` → Waplify `POST /api/v1/messages/send` (Authentication template `hr_login_otp`, `body_data` keys from `WAPLIFY_CODE_KEYS`, default `1`). Supabase keeps generating, expiring (600 s), rate-limiting (60 s between sends) and verifying codes.
- **Security:** Standard Webhooks HMAC-SHA256 check on `webhook-id.timestamp.body` with `SEND_SMS_HOOK_SECRET`, 5-minute replay window, constant-time compare; the Waplify key is a Supabase secret only; logs carry status, Waplify error code, request id and the last 4 digits — never the code.
- **Errors to members:** 429 → "try again in N seconds" (Retry-After); 400 → "could not send to this number on WhatsApp"; key/template/5xx → generic retry (setup problems are not the member's).
- **App:** login text says WhatsApp (EN/UR/TE); after the 60 s countdown `auth.whatsappHint` explains the number must use WhatsApp. Demo backend resend cooldown is 60 s to match.
- **Reviewers:** `[auth.sms.test_otp]` 919000000001 = 123456 (no message sent).
- Owner guide: `docs/whatsapp-otp-setup.md`. Tests: `__tests__/whatsappOtp.test.ts`.
