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
- GitHub push from this session required re-linking the remote (scaffold overwrote `.git`) — needs owner OK.

## Next session — start here
1. Check `Tasks.md` Phase 2; ask owner about Supabase project + SMS + Razorpay accounts.
2. Keep all six docs updated as you work.
