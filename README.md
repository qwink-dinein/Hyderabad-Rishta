# Hyderabad Rishta

A premium, privacy-first Muslim matrimony app for **iOS, Android and Web**, built with React Native + Expo (SDK 58), TypeScript and Supabase. Supports **English, اردو (RTL) and తెలుగు**.

> 📄 Docs: [PRD](PRD.md) · [Architecture](Architecture.md) · [Tasks](Tasks.md) · [Phases](Phases.md) · [Design](design.md) · [Memory](Memory.md)

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
| Database RLS tests | `PGHOST=… PGUSER=postgres ./scripts/test-db.sh` |

### Demo logins (no SMS is sent — code is always `123456`)
| Account | Mobile |
|---|---|
| Member with a published profile & incoming requests | `9000000001` |
| Admin console | `9000000000` |
| New user (goes straight to biodata) | any other number |

All profiles are **fictional demo data**. Payments are **simulated** and clearly labelled. Reset any time from *Settings → Reset demo data*.

## What's inside
- Landing page with accessible carousel and language selector
- Mobile + OTP login (country codes, resend cooldown, attempt limits)
- 7-step biodata wizard with optional photos (≤3), “Other → please specify”, save & continue, preview
- Publication workflow (Draft → Pending → Published / Paused / Rejected) with admin approval
- Admin-configurable pricing (free / paid / disabled per bride/groom), boosts, order summary, no auto-renew
- Discovery with detailed filters, removable chips, live counts, infinite scroll, boosted label
- Shortlist, contact requests with message preview, **separate consent** to share photos / phone / full biodata
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
