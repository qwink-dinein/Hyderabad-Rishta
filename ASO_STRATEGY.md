# ASO strategy — Google Play & Apple App Store

Listing text lives in `store/listings.mjs` (English, Urdu, Telugu) and is checked by `npm run store:check` against the limits below and for banned/misleading terms.

## Limits used (verify in Play Console / App Store Connect before submitting)

| Store | Field | Limit | Indexed for search |
|---|---|---|---|
| Google Play | App name | 30 | Yes |
| Google Play | Short description | 80 | Yes |
| Google Play | Full description | 4000 | Yes |
| App Store | Name | 30 | Yes |
| App Store | Subtitle | 30 | Yes |
| App Store | Keyword field | 100 (comma-separated) | Yes |
| App Store | Promotional text | 170 | No |
| App Store | Description | 4000 | No (Apple) |

Sources: third-party 2026 ASO references and Play Console Help (confirm in the consoles; limits change).

## Why the name is "Hyderabad Rishta – Matrimony", not "… – Muslim Matrimony"

The requested "Hyderabad Rishta – Muslim Matrimony" is **35 characters** — over the 30-character limit in both stores. Options that fit:

- **Play:** `Hyderabad Rishta – Matrimony` (28) — "Muslim" carried by the short description and first line of the full description.
- **App Store:** name `Hyderabad Rishta` (16) + subtitle `Muslim Matrimony & Biodata` (26).

The phone home-screen label stays **Hyderabad Rishta** (owner decision; app.json `name`).

## Completed metadata (English)

**Play short description (78):** Muslim rishta & matrimony for Hyderabad. Make your biodata, connect privately.

**App Store keywords (94):** nikah,shaadi,marriage,muslim rishta,bride,groom,proposal,telangana,urdu,nri,matrimonial,family

**Full description:** see `store/listings.mjs` — features match the real app (discover, biodata, filters, interests, shortlist, consent-based contact, photo privacy, three languages), states that publishing is currently free and Boost is paid, and that identities are not verified.

Urdu (`ur`) and Telugu (`te`) Play listings are drafted — **native-speaker review required** before submission.

## Rules followed

- No competitor names, no "best / #1 / verified / guaranteed", no fake counts or reviews.
- Category: **Lifestyle** (Play: Dating is inappropriate for a family matrimony app; Apple: Lifestyle). Content rating questionnaire: user-generated content + user interaction; no dating/hook-up features.
- Data safety (Play) / App Privacy (Apple): declare phone number, name, photos, date of birth, religious info (sensitive), location (city level), messages (introductions) — collected for app functionality; not sold; deletion available in-app. Must match the privacy policy.
- Account deletion URL required by Play: use `https://<domain>/privacy/` (explains deletion) and in-app Settings → Delete account.

## Screenshots & assets (use the real app, sample data labelled)

1. Welcome — "Find the right rishta for your family" (no member data).
2. "Who is this biodata for?" — parents' use case.
3. One-question biodata screens (name, marital status).
4. Matches preview — initials/age/profession only.
5. Privacy: photo visibility and "number never shown".
6. Interest with consent / "Show number".
7. Discover with filters — **sample/fictional profiles only**, labelled.
8. Urdu screen (RTL) to show language support.

Feature graphic (Play, 1024×500) and icon: from the new logo. Never show real members' photos or names without written consent.

## After launch

- Track store listing conversion (Play Console store listing experiments; App Store product page optimisation).
- Reply to every review politely; never incentivise reviews.
- Add `PLAY_URL` / `APP_STORE_URL` to the website build → store links + `MobileApplication` structured data appear automatically.
- Install referrer: use `utm_source/utm_medium/utm_campaign` on Play links from the website to see organic-web-to-install conversions in Play Console.
