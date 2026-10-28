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

## Phase 2 (next)
| ID | Task | Status |
|---|---|---|
| T-101 | Create Supabase staging project, apply migration, staging seed | ⏳ needs owner approval (costs/billing) |
| T-102 | `SupabaseBackend` adapter + contract tests run against both backends | ⏳ |
| T-103 | Real phone OTP (Supabase Auth + MSG91 DLT / Twilio Verify) + CAPTCHA | ⏳ needs provider account |
| T-104 | Private photo storage, client resize/WebP, signed-URL edge function | ⏳ |
| T-105 | GitHub Actions CI (typecheck, jest, db tests, e2e) | ⏳ |
| T-106 | Razorpay order + webhook edge function; remove simulation in prod | ⏳ needs Razorpay keys |
| T-107 | Expo push tokens + fan-out + receipts → delivery analytics | ⏳ needs dev build |
| T-108 | `pg_cron`: scheduled announcements, boost expiry notifications | ⏳ |
| T-109 | Sentry + structured logging | ⏳ |
| T-110 | Native-speaker review: Urdu & Telugu strings | ⏳ |
| T-111 | Lawyer review: privacy policy & terms (DPDP Act 2023) | ⏳ |
| T-112 | Admin-managed option lists (education/profession) table + UI | ⏳ |
| T-113 | Admin console translations (currently English-only) | ⏳ low priority |
| T-114 | EAS build profiles + app icons/splash in brand colours | ⏳ |
| T-115 | Replace carousel line-art with licensed photography (optional) | ⏳ |

## Known issues / tech debt
| ID | Item | Severity |
|---|---|---|
| K-1 | Demo backend stores photos as data URIs in localStorage on web (~5 MB quota) — fine for demo, replaced by Storage in T-104 | low |
| K-2 | Fine-grained optional filters run after the SQL coarse filter in production design → pagination counts approximate for exotic filter combos; move all filters into SQL in T-102 | medium |
| K-3 | `Select` modal lists are not virtualised beyond FlatList defaults (fine for ≤ 200 options) | low |
| K-4 | Toast may linger briefly after navigation | cosmetic |
