# Memory — project context for future sessions

> Read this first when resuming work. Append decisions, gotchas and state; never delete history (strike through instead).
> Last updated: 2026-10-28

## Snapshot
- **What:** Hyderabad Rishta — Muslim matrimony app (PRD v1.1 in `PRD.md`). Owner: mukarramjahmm.
- **Repo:** `qwink-dinein/Hyderabad-Rishta`, working branch `claude/sharp-bell-xxyxmj`.
- **State:** Phase 1 complete — full MVP on an offline **demo backend**; Supabase schema ready but not connected. See `Phases.md`.
- **Run:** `npm install` → `npm run web` (browser) or `npm start` (scan QR with Expo Go). Details in `README.md`.

## Demo credentials (demo backend only)
| Who | Phone | OTP |
|---|---|---|
| Member with published groom profile (has incoming requests) | `+91 9000000001` | `123456` |
| Admin | `+91 9000000000` | `123456` |
| Seed brides/grooms | `+91 90000001NN` (NN = 00–31) | `123456` |
| New user | any other number | `123456` |
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
| 2026-10-28 | Named the design doc `design.md` (owner wrote “design.ms”) | Renders on GitHub; mention if owner prefers otherwise. |

## Gotchas
- Expo SDK 58: import `Tabs` from `expo-router/js-tabs` (root export is deprecated). Routes live in `src/app/`.
- `npx expo install` needs `EXPO_OFFLINE=1` in this sandbox (api.expo.dev is blocked by network policy).
- RN 0.88 refs: use `React.ComponentRef<typeof TextInput>` / `ScrollView`.
- FlatList `ListHeaderComponent/ListFooterComponent` must be `undefined`, not `null` (types).
- Postgres: `text::date` is not immutable → use `iso_date()` helper in generated columns.
- In Supabase, functions get default EXECUTE grants; migration grants explicitly anyway (portable).
- Jest needs the AsyncStorage mock (`jest.setup.js`) and `moduleNameMapper` for `@/`.
- Test logins in Playwright must `waitForURL` after verify — navigating early aborts the login.
- Sandbox perms: Postgres test cluster runs as `nobody`; parent dirs need `o+x`.

## Environment limits observed (cloud session)
- Network policy blocks `api.expo.dev`, `exp.host`, ngrok, `docs.expo.dev` → no Expo tunnel from the cloud; run locally to scan with Expo Go.
- ~~GitHub push required re-linking the remote (scaffold overwrote `.git`)~~ — fixed 2026-10-28 with owner approval; branch pushed.

## Hosted web preview
- Private Artifact: https://claude.ai/artifact/Vx3XTLdLJVSgcVY9hkmxuH (single self-contained HTML, demo backend).
- Rebuild: `SINGLE_BUNDLE=1 EXPO_OFFLINE=1 npx expo export --platform web --output-dir dist-single && node scripts/pack-web.js dist-single <out>.html`, then republish to the same URL.
- `app.config.js` turns off web route code-splitting only when `SINGLE_BUNDLE=1`; `+not-found` redirects unknown paths to `/`.

## Next session — start here
1. Check `Tasks.md` Phase 2; ask owner about Supabase project + SMS + Razorpay accounts.
2. Keep all six docs updated as you work.
