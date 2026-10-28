# Delivery Phases — Hyderabad Rishta

> Living document. Last updated: 2026-10-28. Current phase: **Phase 1 complete → Phase 2 next**.

## Phase 0 — Foundations ✅
Expo SDK 58 + TypeScript + Expo Router, design tokens, fonts, i18n (EN/UR/TE + RTL), test tooling.

## Phase 1 — Full MVP on the demo backend ✅ (this delivery)
Every PRD journey works end-to-end offline on web, iOS and Android (Expo Go):
landing & carousel · OTP login (demo) · 7-step biodata with photos & “Other” fields · preview/publish workflow ·
dynamic pricing & simulated checkout · boosts · discovery with full filters/chips/pagination · profile details ·
shortlist · contact requests + separate consent · report/block · dashboard metrics · notifications ·
admin console (moderation, pricing + audit, announcements + honest analytics, reports, users, orders, audit log) ·
Supabase schema with RLS (tested on Postgres 16) · 52 Jest tests · Playwright E2E · 32 fictional seed profiles.

**Since Phase 1:** governance (master/sub-admins/Trash/recovery), interest + consent-based phone offers + poke, and the admin console (profile IDs, member search, alerts bell, relation badges on cards). 106 Jest tests, 4 SQL suites, 5 Playwright suites, lint clean.

**Design phase (after V1):** premium redesign per Design PRD v1.0. Phases 1–5 were done in one pass: tokens and type, landing, auth and navigation; biodata, cards and details; discovery and connection; notifications, settings and dashboard; motion, sound, a11y and regression. All existing tests still pass.

**Since V2 (checkpoint V3):** security pass with attack suites; 5 MB photo uploads compressed on the phone; data-retention limits; one number = one account = one biodata; OTP registration plus 4-digit PIN login; smooth screen transitions; Boost as the raised centre tab with reminders; one boost at a time. Totals: 214 Jest tests, 11 SQL suites, 12 Playwright suites (85 steps), lint clean. See `CHECKPOINTS.md`.

**Exit criteria met:** typecheck clean, all tests green, web export builds, E2E journeys pass with zero console errors.

## Phase 2 — Production backend (est. 2–3 weeks)
1. Create Supabase staging + prod projects; apply migration; seed script for the 32 demo profiles (staging only).
2. `SupabaseBackend` adapter implementing `Backend` (RPCs + RLS) and a toggle in `services/index.ts`. It includes PIN login: call `trust_device` after OTP, call the `pin-login` Edge Function for returning logins, keep the session in SecureStore, and enable phone + password sign-in in Supabase Auth (needed for issuing sessions).
3. Phone OTP via Supabase Auth + **MSG91** (India DLT-registered template) or Twilio Verify; CAPTCHA (hCaptcha/Turnstile) on OTP request.
4. Photos → private Storage bucket; edge function issues 10-min signed URLs only when `project_profile()` allows. Client-side resize is already done (≤1600 px JPEG, ≤1.5 MB, originals up to 5 MB).
5. Payments → **Razorpay** (UPI-first) order creation + webhook (signature-verified) in an Edge Function; order status from the webhook only. If `apply_boost` refuses with `boost_active` (a second boost paid during an active one), the webhook refunds it.
6. Push → Expo push tokens table + Edge Function fan-out + receipts → `announcement_deliveries.push_status` (development build required on Android).
7. `pg_cron`: `run_boost_jobs()` every 5 min (boost notices and weekly reminders), `run_retention()` daily, `push-dispatch` every minute, scheduled announcements.
8. Sentry (crash + performance), structured logs in Edge Functions.
9. Native-speaker review of Urdu & Telugu; lawyer review of privacy policy & terms (DPDP Act 2023).
10. EAS: `development`, `preview`, `production` profiles; store listings.

## Phase 3 — Launch hardening (est. 1–2 weeks)
Load test discovery RPC (10k profiles), accessibility audit (TalkBack/VoiceOver), pen-test of RLS/RPCs, beta with 20–50 Hyderabad families, analytics dashboards for PRD §21 metrics.

## Phase 4 — Growth (data-driven, post-launch)
Only after measuring real usage (PRD MVP principle). Candidates ranked in **Recommendations** below.

---

## Recommendations (architect's view)

### A. User-friendliness
1. **WhatsApp-shareable biodata card** — one-tap export of a privacy-safe biodata image/PDF with a deep link back to the app. This meets families where they already are (the thing we're replacing) and drives organic installs.
2. **Guardian/co-manager access** — let a parent and the candidate both manage one profile (invite by phone). Very common in this market; currently out of scope as “complex hierarchies”, so start with a simple 2-person version.
3. **Biodata import** — paste an existing WhatsApp text biodata → auto-fill the wizard (a simple parser first; AI later). Cuts the 5-minute form to 1 minute.
4. **Saved searches + “new matches” digest** — weekly in-app/push digest of new profiles matching saved filters; brings users back without spam.
5. **Profile completeness meter** with gentle nudges (“Add native place — families search by it”).
6. **Voice input** for About Me in Urdu/Telugu (OS dictation) — reduces typing friction for elders.
7. **Offline-first drafts** — the wizard already saves per step; add local autosave on every field change.
8. **Accessibility for elders** — a “Larger text” toggle beyond OS settings; high-contrast mode.

### B. Revenue (no dark patterns, no auto-renew — consistent with PRD)
1. **Keep publishing free at launch** (liquidity first), monetise **visibility**: boosts (already built) with 3/7/15-day tiers.
2. **Contact-unlock credits** — e.g. ₹199 for 5 extra requests beyond a free daily quota. Transparent one-time packs.
3. **Featured placement by city** (“Spotlight in Hyderabad”) — limited slots, fair rotation, clearly labelled.
4. **Assisted service (“Rishta concierge”)** — a paid human matchmaker tier for families (₹2–5k one-time). High margin, high trust; fits the community culture.
5. **Premium biodata templates / printable PDF** — beautiful, multilingual, one-time purchase.
6. **Partnerships** — verified-vendor directory (qazi, nikah halls, caterers, mehendi) with listing fees; no user data shared.
7. **Referral credits** — give a free boost for each family that publishes via your invite link.
8. **Diaspora pricing** — Gulf/US/UK users pay in local currency at higher price points (separate config rows).

### C. Trust & safety (protects revenue)
1. Optional **selfie liveness check** later (not an “ID verified” badge — PRD removed that), used only internally for fraud scoring.
2. Auto-flag messages asking for money; rate-limit new accounts more strictly for 7 days.
3. Show “Profile managed by family” clearly (already shown) — reduces catfishing concerns.
