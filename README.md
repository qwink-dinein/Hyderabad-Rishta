# Hyderabad Rishta

A premium, privacy-first Muslim matrimony app for **iOS, Android and Web**, built with React Native + Expo (SDK 58), TypeScript and Supabase. Supports **English, اردو (RTL) and తెలుగు**.

> 📄 Docs: [PRD](PRD.md) · [Architecture](Architecture.md) · [Tasks](Tasks.md) · [Phases](Phases.md) · [Design](design.md) · [Memory](Memory.md) · [Checkpoints](CHECKPOINTS.md) (latest: **V3**)

## Quick start (localhost)

Requirements: **Node.js 20+** (LTS), Git. For phones: the **Expo Go** app (App Store / Play Store).

```bash
git clone -b claude/sharp-bell-xxyxmj https://github.com/qwink-dinein/Hyderabad-Rishta.git
cd Hyderabad-Rishta
npm install
```

| Goal | Command |
|---|---|
| Preview in your browser (localhost) | `npm run web` → opens http://localhost:8081 |
| Preview on your phone (same Wi-Fi) | `npm start` → scan the QR with Expo Go (Android) or the Camera app (iPhone) |
| Phone on a different network | `npm run tunnel` |
| Production web build (static) | `npm run export:web` → deploy the `dist/` folder to any static host (Vercel, Netlify, Cloudflare Pages) with SPA fallback to `index.html` |
| Single-file web preview (hosted) | `SINGLE_BUNDLE=1 npx expo export --platform web --output-dir dist-single && node scripts/pack-web.js dist-single preview.html` |
| Typecheck | `npm run typecheck` |
| Unit + integration tests | `npm test` |
| Database tests (11 suites) | `PGHOST=… PGUSER=postgres ./scripts/test-db.sh` |
| Browser e2e (12 suites) | `npx expo export --platform web && node e2e/serve.js "$(pwd)/dist" 8081`, then `node e2e/<suite>.js` (see `e2e/README.md`) |

### Demo logins (no SMS is sent — code is always `123456`)
| Account | Mobile |
|---|---|
| Member with a published profile & incoming requests | `9000000001` |
| Master admin | `9000000000` |
| Sub-admin | `9000000009` |
| Bride with an active boost | `9000000102` |
| Pending approval / draft biodata | `9000000130` / `9000000131` |
| New user (goes straight to biodata) | any other valid mobile number |

After the first OTP you create a **4-digit PIN** (simple ones like 1234 are refused). After logging out, the same number opens with just the PIN; *Forgot PIN?* sends a new OTP. The full list of test numbers is in `Memory.md`.

All profiles are **fictional demo data**. Payments are **simulated** and clearly labelled. Reset any time from *Settings → Reset demo data*.

## What's inside
- Landing page with accessible carousel and language selector
- Mobile + OTP registration, then **4-digit PIN login** (no OTP for returning users on the same phone; Forgot PIN via OTP; server-side lockout); stays signed in until logout
- **One mobile number = one account = one biodata**
- 7-step biodata wizard with optional photos (≤3, originals up to 5 MB, compressed on the phone), “Other → please specify”, save & continue, preview
- Publication workflow (Draft → Pending → Published / Paused / Rejected) with admin approval
- Admin-configurable pricing (free / paid / disabled per bride/groom), boosts, order summary, no auto-renew
- Discovery with detailed filters, removable chips, live counts, infinite scroll, boosted label
- Tabs: Home · Discover · **Boost** (raised centre, with gentle reminders; one boost at a time) · Requests · Profile. Shortlist via the heart on Discover and Home
- Express Interest, consent-based phone-number offers, Poke; **separate consent** to share photos / full biodata
- Smooth screen transitions (native slide, tab shift, web fade; respects Reduce Motion)
- Phone notifications for every profile action (generic lock-screen text by default)
- Report & block, deactivate & delete account
- Dashboard with recorded metrics (views, unique viewers, shortlists, requests, boost)
- Notification centre + admin announcements with honest readership analytics
- Admin console: moderation, users, pricing (+history), announcements, reports, orders, audit log

## Backend modes
| Mode | When | Notes |
|---|---|---|
| **Demo** (default) | localhost, Expo Go, web preview, tests | Offline, data stored on the device/browser. Enforces the same rules as the database. |
| **Supabase** | staging/production (Phase 2) | Apply `supabase/migrations/*.sql`, then set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` (see `.env.example`). **Never** put the service-role key in the app. |

## Expo Go vs development build
Everything in this MVP runs in Expo Go. A development build (`npx expo run:android|ios` or `eas build --profile development`) will be needed for: remote push notifications (Android), native payment SDKs, and SMS OTP auto-read.

## Project structure
See [Architecture.md §2](Architecture.md#2-folder-structure).
