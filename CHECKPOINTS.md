# Checkpoints — Hyderabad Rishta

> Known-good snapshots of the app. Each one is a git tag on GitHub, so it survives this machine and any future session.
> If something breaks later, compare against or roll back to a checkpoint (commands below).

## V1 — tag `v1` (2026-10-28) ✅ owner-approved baseline

**Where:** git tag `v1` on branch `claude/sharp-bell-xxyxmj`, repo `qwink-dinein/Hyderabad-Rishta`.
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
| (tag `v1`) | Adds this checkpoint file — app code identical to `45ad535` |
| `45ad535` | Memory: current preview link |
| `4b248e2` | Admin console: profile IDs, member search, alerts bell; relation badges |
| `117417b` | Express Interest, consent-based phone offers and Poke; three-slot photo picker |

### How to get back to V1
```bash
git fetch origin --tags
git diff v1 -- <path>                 # see what changed since V1 (whole repo: git diff v1)
git checkout v1 -- <path>             # restore one file/folder to V1, then commit
git revert --no-edit v1..HEAD         # undo everything after V1 as new commits (safe, keeps history)
git checkout -b restore-v1 v1         # or: inspect V1 on its own branch
```
Then reinstall and verify: `npm install` → `npx tsc --noEmit` → `npx jest` → `npm run web`.
The demo database is versioned (`SCHEMA_VERSION = 7` in `demoBackend.ts`); a different version resets local demo data automatically.
