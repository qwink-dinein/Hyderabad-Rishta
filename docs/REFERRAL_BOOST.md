# Referral-based free Boosts — implementation report (2 Nov 2026)

## 1. Existing Boost architecture (unchanged)
- Plans (7/14/30 days, per bride/groom: free / paid / disabled) live in `pricing_config.config.boostPlans`; admin edits them in **Pricing & boosts**.
- `start_boost(plan)` creates a `boost` order (free → applied at once; paid → pending until payment) and `apply_boost(order)` sets `profiles.boost_started_at / boost_until / boost_notices`.
- Guards: one Boost at a time (`orders_boost_guard`, `apply_boost`), orders must match a configured plan (`orders_boost_terms`).
- Featured placement, rotation, ending notices and expiry all read `profiles.boost_until`. Online payment is not live yet (paid orders stay pending).

## 2. Files
New: `supabase/migrations/20261203000000_referral_boost.sql`, `supabase/tests/99_referral_boost.test.sql`, `src/domain/referral.ts`, `src/services/referralCapture.ts`, `src/components/referral/ReferralCards.tsx`, `src/components/referral/adminText.ts`, `src/app/refer/index.tsx`, `src/app/refer/use.tsx`, `src/app/r/[code].tsx`, `src/app/admin/referrals/index.tsx`, `src/app/admin/referrals/[id].tsx`, `__tests__/referral.test.ts`, `e2e/referral.js`.

Changed (additions only): `boost.tsx` (Referral mode panel; paid plans hidden only in Referral mode), `home.tsx` (banner, welcome gift), `dashboard.tsx` (Refer & Earn card), welcome screens (invited note), `start/phone.tsx` (code field), `start/code.tsx` + `LoginFlow.tsx` (attach code after OTP), `start/live.tsx` (invite line), `index.tsx` (`?ref=` links), admin home + pricing (link), backend interface + demo + Supabase adapter, push copy, notification texts, i18n (en / ur / Roman Urdu / te).

## 3. Database (one migration, additive)
`referral_settings` (mode paid|referral, enabled, reward_days, invitee_reward, review), `referral_codes` (one per account, unique), `referral_phone_ledger` (hashed numbers ever registered), `referrals` (one per invited account, lifecycle, flags), `referral_rewards` (unique per referral + role). RLS on, no table access from the app; everything goes through the functions below.

## 4. Functions
Public: `get_referral_settings`, `record_referral_visit`, `check_referral_code`. Member: `claim_referral`, `get_my_referral`, `use_referral_boost`. Admin: `admin_referral_overview`, `admin_list_referrals`, `admin_decide_referral`, `admin_revoke_referral_reward`, `admin_referral_settings_update`. Internal: `referral_evaluate` (trigger on profile save/publish/approval), `referral_issue` (rewards, exactly once), `referral_profile_full` (server copy of the 100% bar), `referral_flags`.

## 5. Lifecycle
Link/code → new account claims it after OTP (once; ≤3 days; never self, admin-added or a number that had an account) → **Registered / Profile incomplete** → biodata 100% and live (approved when approval is on) → **Pending approval** (team check if `review` is on or anything is flagged) → **Approved – Boost earned**: one free Boost for the referrer and, if on, one for the invited family → used whenever they choose. Team can reject (no reward) or revoke a reward (reason required; a running free Boost ends; paid Boosts never touched).

## 6. Admin
Admin → **Referrals & free Boosts**: Paid Boost / Referral Boost, programme on/off, free Boost length (default 7), welcome Boost for the invited family, team check; numbers (referred, approved, conversion, free Boosts given/used, paid Boosts, link visits, flagged); list with search and filters; review screen with checks, history, approve / reject / revoke with an audited reason. Switching mode never changes Boosts already bought, earned or running.

## 7. Member journey
Boost screen (Referral mode) → Refer & Earn (code, link when `EXPO_PUBLIC_SITE_URL` is set, WhatsApp, Share, counts, families as initial + stage) → family opens link → welcome note → code kept at sign-up → after approval both get a free Boost → "Use a free Boost" (dates shown, one at a time). Paid mode: the existing screen, plus a small "you have N free Boosts" row only when the member has some.

## 8. Security and anti-fraud
Server decides everything (completion, approval, eligibility); rewards are idempotent (unique constraint + row locks); codes cannot change after sign-up; self-referral and returning numbers refused; admin-added accounts refused; same phone / many approvals in 7 days / open report → team check (never an automatic refusal); referrers never see numbers, names, photos or biodata; push texts carry no names; all admin actions audited.

## 9. Tests
SQL: `99_referral_boost.test.sql` (codes, privacy, every refusal, incomplete vs complete, team check, double approval, review off, no cap, mode switches, use, one-at-a-time, revoke, overview) + all 28 suites. Unit: 10 referral tests + all 394. E2E: `e2e/referral.js` (both modes in the real screens, link → sign-up → referrer view → admin), Boost, onboarding, languages, crawl of every screen × role × 4 languages.

## 10. Known limits
- No domain yet: until `EXPO_PUBLIC_SITE_URL` is set, members share the **code** (the link row is hidden). Android "install from link" attribution (Play Install Referrer) needs the Play listing; the code covers it meanwhile.
- Live database: migration not applied yet (needs the owner's go-ahead).
- Payments are not live, so "Paid Boost" mode still ends at "payment not open yet" exactly as before.
