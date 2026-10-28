# Tasks — Hyderabad Rishta

> Living backlog. Update status as work lands. Last updated: 2026-10-28.
> Status: ✅ done · 🔄 in progress · ⏳ todo · 🚫 blocked (reason)

## Phase 0–1 (delivered)
| ID | Task | Status |
|---|---|---|
| T-001 | Expo SDK 58 + TS + Expo Router scaffold, path alias `@/` | ✅ |
| T-002 | Design tokens, fonts (EN/UR/TE), lazy script-font loading | ✅ |
| T-003 | i18n EN/UR/TE, instant switch, RTL direction, persistence, fallback | ✅ |
| T-004 | Domain model & option lists (education/profession/locations…) | ✅ |
| T-005 | Privacy projection (single gatekeeper) + tests | ✅ |
| T-006 | Search/filter semantics (optional ≠ excluded, strict mode, custom values) + tests | ✅ |
| T-007 | Dynamic pricing resolver + generated copy + validation + tests | ✅ |
| T-008 | Zod schemas per wizard step (Other → specify, min age, ranges) + tests | ✅ |
| T-009 | DemoBackend (auth/OTP limits, profiles, orders, requests, consent, notifications, admin, audit) | ✅ |
| T-010 | 32 fictional seed profiles + demo member + demo admin | ✅ |
| T-011 | UI kit: Text, Button, Field, TextField, ChipGroup, Select (search + custom), Toggle, Range, Banner, Toast, Confirm | ✅ |
| T-012 | Landing page + accessible carousel (reduced motion) | ✅ |
| T-013 | OTP login (country codes, resend cooldown, attempts) | ✅ |
| T-014 | Biodata wizard (7 steps, progress, save & continue, photos) | ✅ |
| T-015 | Preview & publish (+ simulated checkout for paid mode) | ✅ |
| T-016 | Discover (chips, counts, sort, infinite list, desktop grid) | ✅ |
| T-017 | Filters modal (dependent locations, multi-select, live count) | ✅ |
| T-018 | Profile details + report + block | ✅ |
| T-019 | Shortlist (optimistic) | ✅ |
| T-020 | Contact requests + preview + consent editor | ✅ |
| T-021 | Notifications centre (unread, mark all, deep links, announcements) | ✅ |
| T-022 | Dashboard metrics, boost, pause/resume, orders | ✅ |
| T-023 | Settings: language, blocked list, logout, deactivate, delete, demo reset | ✅ |
| T-024 | Admin: overview, profile review, pricing (+history), announcements (+analytics, recipient report), reports, users, orders, audit | ✅ |
| T-025 | Supabase migration: schema, RLS, column grants, RPCs, storage policies | ✅ |
| T-026 | SQL RLS/privacy test suite + `scripts/test-db.sh` | ✅ |
| T-027 | i18n coverage test (UR/TE keys + placeholder parity) | ✅ |
| T-028 | Playwright E2E smoke + full journey on web export (`e2e/`) | ✅ |
| T-029 | Docs: PRD, Architecture, Tasks, Phases, design, Memory, README | ✅ |
| T-030 | Draft privacy policy & terms screens | ✅ (draft) |
| T-031 | Owner feedback: "number of children" (required unless never married) | ✅ |
| T-032 | Owner feedback: maslak dropdown + dependent sub-maslak (Sunni: Hanafi/Shafi'i/…; Shia: Ithna Ashari/Bohra/…), searchable filter | ✅ |
| T-034 | Admin full rights: approve/pause/resume/delete profiles, remove photos, delete users/requests/reports/announcements, cancel orders | ✅ |
| T-035 | One-click manual-approval switch + approve-all | ✅ |
| T-036 | Master + sub-admins (max 10), transfer with step-up OTP, single-master DB constraint | ✅ |
| T-037 | Master lost-phone recovery: hashed one-time codes, verified backup phone, 72 h time-lock + cancel, break-glass | ✅ |
| T-038 | Trash (soft delete, 30-day auto-erase, master restore/erase); append-only audit & orders | ✅ |
| T-039 | Bug: admin-suspended accounts were reactivated by logging in | ✅ fixed |
| T-040 | Photo picker: three always-visible labelled slots (Main photo, Photo 2, Photo 3) + 0/3 counter | ✅ |
| T-041 | Express Interest + “How would you like to connect?” (intro / offer number with consent) | ✅ |
| T-042 | Phone offers with own lifecycle; reciprocal Share My Number; Call/Copy/SMS | ✅ |
| T-043 | Poke with 48 h wait, 1/request, 2/person/7 days, opt-out | ✅ |
| T-044 | Expiry (admin-configurable), Blocked status, 30-day re-send cooldown after decline | ✅ |
| T-045 | Idempotent creates, race-safe accept/withdraw (row locks), analytics without numbers, admin connection metrics | ✅ |
| T-046 | Relation badges on profile cards (Connected · Interest sent · Sent you interest · Declined your interest · You declined · Expired · Withdrawn); profile screen hides Express Interest during the decline cool-down and explains why | ✅ |
| T-047 | Sequential, immutable profile IDs `HR-10001…` (never reused); shown on cards, profile, and every admin list (profiles, users, requests, reports, orders, announcement recipients, audit targets, trash) as a tap-to-open chip | ✅ |
| T-048 | Admin search (`/admin/search`, also on the dashboard) by profile ID, name, city or phone digits — phone look-ups audited, results masked; member page (`/admin/member/[id]`) with every action in one place | ✅ |
| T-049 | Admin bell with unread count → `/admin/alerts`: reports, payments (paid/failed), profiles waiting for approval, self-deleted accounts, admin-team/master security changes; deep links; mark read / all | ✅ |
| T-050 | Lint set up (`expo lint`, eslint-config-expo) and all errors fixed (React Compiler purity/refs/set-state-in-effect, unescaped entities) | ✅ |
| T-051 | Premium redesign (Design PRD v1.0): tokens (PRD palette), Lora + Inter, original arch/lantern/Charminar artwork, landing hero carousel + trust strip + lower sections + Help page | ✅ |
| T-052 | Registration UX: language step (first time only), login "Enter your mobile number"/"Welcome back", 6-box OTP with paste/autofill, masked number, mm:ss resend countdown | ✅ |
| T-053 | Navigation: Home · Discover · Shortlist · Requests · Profile tabs; bell with unread badge in every tab header; notifications as a stack route | ✅ |
| T-054 | New Home tab (status card, new-interest shortcut, featured rail, recently published) built only on existing queries | ✅ |
| T-055 | ProfileCard v2 (4:5 photo, icon metadata, contextual Express Interest, heart animation, skeleton), elegant photo placeholder | ✅ |
| T-056 | PhotoPicker v2 (large main + 2 stacked), OptionList for "created for", segmented wizard progress, animated "Other" reveal | ✅ |
| T-057 | Profile details gallery + fact chips; connect screen avatar header; request inbox segmented control, avatars, poke bell swing | ✅ |
| T-058 | Sound effects (off by default, original chimes) + haptics with Settings toggles; animated success toast | ✅ |
| T-059 | Boost guarantee: Featured for all eligible viewers regardless of filters, fair rotation, impressions/reach proof, ending/ended notices, paused-boost warning, insert hardening (no self-granted boosts) | ✅ |
| T-060 | Switch accessibility on web (`aria-checked`) — found by the push e2e | ✅ |
| T-033 | Bug: "Send contact request" greyed out — button now always tappable with clear guidance; edits keep a live profile live; demo starts with approval off | ✅ |

## Phase 2 (next)
| ID | Task | Status |
|---|---|---|
| T-101 | Create Supabase staging project, apply migration, staging seed | ⏳ needs owner approval (costs/billing) |
| T-102 | `SupabaseBackend` adapter + contract tests run against both backends | ⏳ |
| T-103 | Real phone OTP (Supabase Auth + MSG91 DLT / Twilio Verify) + CAPTCHA | ⏳ needs provider account |
| T-104 | Private photo storage, client resize/WebP, signed-URL edge function | ⏳ |
| T-105 | GitHub Actions CI (typecheck, jest, db tests, e2e) | ⏳ |
| T-106 | Razorpay order + webhook edge function; remove simulation in prod | ⏳ needs Razorpay keys |
| T-107 | Expo push: tokens, fan-out outbox, dispatcher with retries + receipts, prefs, device ownership, delivery analytics | ✅ code + tests · ⏳ live delivery needs EAS projectId, FCM/APNs keys, dev build |
| T-108 | `pg_cron`: scheduled announcements, boost expiry notifications | ⏳ |
| T-109 | Sentry + structured logging | ⏳ |
| T-110 | Native-speaker review: Urdu & Telugu strings | ⏳ |
| T-111 | Lawyer review: privacy policy & terms (DPDP Act 2023) | ⏳ |
| T-112 | Admin-managed option lists (education/profession) table + UI | ⏳ |
| T-113 | Admin console translations (currently English-only) | ⏳ low priority |
| T-114 | EAS build profiles + app icons/splash in brand colours | ⏳ |
| T-115 | Replace carousel line-art with licensed photography (optional) | ⏳ |
| T-117 | Edge Functions for Supabase: OTP to backup phone → `set_master_backup_phone`; `auth.admin.signOut` on delete/suspend; schedule `run_governance_jobs` with pg_cron | ⏳ |
| T-118 | SMS + email alert to the master's primary AND backup phone when a recovery starts | ⏳ |
| T-119 | Push for every profile action (interest/offer/poke/views/shortlists/approvals/boost/payment/safety), generic lock-screen text | ✅ |
| T-120 | Admin alerts by SMS/email/push for urgent items (failed payments, reports, recovery started) | ⏳ needs providers |
| T-121 | Wire `SupabaseBackend.adminSearch/adminGetMember` to the `admin_search` RPC + member queries | ⏳ (with T-102) |
| T-122 | Licensed, consented photography for the hero (optional; vector art ships today) | ⏳ owner decision |
| T-123 | Filters: jump-to-section tabs (Basic / Education / Location / Religion) like the reference | ⏳ nice-to-have |
| T-124 | `eas init` (projectId), FCM service-account + APNs key upload, `eas build --profile development`, deploy `push-dispatch`, enable pg_cron jobs | ⏳ needs owner accounts |
| T-116 | Post-edit moderation queue (re-review edited live profiles without hiding them) | ⏳ |

## Known issues / tech debt
| ID | Item | Severity |
|---|---|---|
| K-1 | Demo backend stores photos as data URIs in localStorage on web (~5 MB quota) — fine for demo, replaced by Storage in T-104 | low |
| K-2 | Fine-grained optional filters run after the SQL coarse filter in production design → pagination counts approximate for exotic filter combos; move all filters into SQL in T-102 | medium |
| K-3 | `Select` modal lists are not virtualised beyond FlatList defaults (fine for ≤ 200 options) | low |
| K-4 | Toast may linger briefly after navigation | cosmetic |
