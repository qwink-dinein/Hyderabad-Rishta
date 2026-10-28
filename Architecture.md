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

## 7. Testing strategy
| Layer | Tooling | What |
|---|---|---|
| Domain | Jest | age, formatting, validation (Other fields, min age, ranges), privacy projection, search semantics, pricing copy matrix, metrics |
| Backend contract | Jest + DemoBackend + fake clock | OTP limits/expiry, publish workflow, paid/failed/free orders, price-change immutability, boosts, requests/consent, blocking, admin authZ, announcements analytics & scheduling, deletion |
| i18n | Jest | UR/TE key coverage + placeholder parity |
| Database | psql + Postgres 16 | RLS isolation, column grants, projection privacy, consent flow, admin audit |
| E2E | Playwright (web export) | landing/lang/RTL, login, discover/filters/profile, requests/consent, dashboard, wizard → publish → approve → custom-value search, admin guard |

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
1. **Exactly one master** — unique partial index `one_master`; transfer and recovery swap roles atomically.
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
