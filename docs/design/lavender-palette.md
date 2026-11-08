# Lavender palette — FINAL (owner, 2026-11-08)

Chosen by the owner from the app previews ("This has been finalised"). Inspired by the owner's lavender
wedding artwork (cream arch, lilac walls, mauve dress, antique lantern gold). Replaces the Royal Burgundy ×
Champagne Gold palette; fonts are Playfair Display (headings, incl. the hero), Inter (body) and Montserrat (buttons/labels).
**Status:** website BUILT and live (2026-11-08); **app code done (2026-11-08)** — colours, landing headline back to Playfair, app.json theme/splash/adaptive-icon colours; reaches phones with the next Android build.

**Owner changes after the first approval:** buttons/accents are **soft champagne `#D8C49A`** (bright lantern gold was "too gold for the eyes"); the hero headline is back in **Playfair Display 600 + italic accent** (Mogra dropped).

## Colours

| Role | Hex | Used for |
|---|---|---|
| Deep violet | `#3F2F48` | Dark screens: landing/hero, video veil, header bar, dark panels; text on gold buttons |
| Mauve violet | `#5E4A6E` | Headings, filled brand elements (selected chips/tabs, Filters, Boost cards) |
| Mauve soft | `#76627B` | Raised panels on violet |
| Cream | `#F4EEE8` | Light screen / page background |
| Card white | `#FFFCF8` | Cards, inputs |
| Lilac surface | `#EAE1EA` | Secondary cards, icon backgrounds, bands |
| Soft champagne | `#D8C49A` | Primary buttons, Boost badges, headline accent words, tags, checkmarks (was lantern gold `#C9A45C`) |
| Gold muted | `#A88446` | Pressed gold; large icons on light |
| Gold deep | `#7A5A36` | Gold-toned small text on light |
| Gold soft | `#EFE4D2` | Gold-tinted surfaces (badges, notices) |
| Button gradient | `#E8DCC0` → `#D8C49A` → `#C7B07F` | Primary buttons (website `--gild`; app gilded gradient) |
| Lilac outline | `#B8A4B3` | Outlines, dividers |
| Border | `#E4D9E0` | Hairlines on light |
| Text | `#3A2C40` | Body text on light |
| Muted text | `#6B5D70` | Secondary text on light |
| Text on dark | `#F7F2F6` | Main text on deep violet |
| Headings on dark | `#F1E6F0` | Headings / highlights on deep violet |
| Supporting on dark | `#CDBCCB` | Supporting text on deep violet |
| Skeleton | `#ECE3EA` | Loading placeholders |
| Overlay / veil | `rgba(63, 47, 72, 0.58)` | Modal overlay; hero veil uses the same violet |

Unchanged from the previous palette: success `#1E6B52`, danger `#B65345` (text `#9A4335`), notice
backgrounds (warning `#F6EDD8`, danger `#F8E6E1`, success `#E6F1EC`).

## Mapping from the old tokens (`src/theme/tokens.ts`)
`forest` → `#3F2F48` · `emerald` → `#5E4A6E` · `emeraldSoft` → `#76627B` · `ivory` → `#F4EEE8` ·
`white` → `#FFFCF8` · `sage` → `#EAE1EA` · `gold` → `#D8C49A` · `goldMuted` → `#A88446` · `goldDeep` → `#7A5A36` ·
`goldSoft` → `#EFE4D2` · `borderGold` → `#B8A4B3` · `border` → `#E4D9E0` · `charcoal` → `#3A2C40` ·
`muted` → `#6B5D70` · `cream` → `#F7F2F6` · `champagne` → `#F1E6F0` · `beige` → `#CDBCCB` · `skeleton` → `#ECE3EA` ·
`overlay` → `rgba(63, 47, 72, 0.58)`; shadows and hard-coded `rgba(58,0,18,…)` → violet `#3F2F48` / `rgba(63,47,72,…)`;
Button gilded gradient `#E9CB6E/#C29A2B/#7A5C27` → `#E8DCC0/#C7B07F/#A8935F`. App landing headline: Mogra → Playfair (`Playfair-SemiBold` + `Playfair-SemiBoldItalic` accent).

## Done on the website (2026-11-08)
- **Logo recoloured** maroon → deep violet, gold kept: website `logo-512/96`, favicon, apple-touch icon, share image (`og-default.jpg`), and the app's `assets/icon.png`, `android-icon-background/foreground.png`, `favicon.png`, `splash-icon.png`, `brand/logo.webp` (app icons ship with the next build). Monochrome Android icon unchanged. Recolour = hue shift of the red/maroon family (hue ≥ 300° or ≤ 18°, plus dark ≤ 30°) to violet 283°, saturation ×0.42; gold untouched.
- **Website phone mock-ups** (`website/static/img/app-*.webp`) retaken from a lavender build of the app (soft champagne, Playfair hero) — demo data. Phone frames `#241a2b`.

## Still to update
- Optional: hero video clips are red-toned; the owner's lavender artwork could be used on the landing.

## Website tokens (`website/static/site.css`)
`--maroon` `#3f2f48` · `--burgundy` `#5e4a6e` · `--burgundy-2` `#76627b` · `--gold` `#d8c49a` · `--champagne` `#f1e6f0` · `--cream` `#f7f2f6` · `--beige` `#cdbccb` · `--ivory` `#f4eee8` · `--card` `#fffcf8` · `--ink` `#3a2c40` · `--muted` `#6b5d70` · `--line` `#e4d9e0` · `--antique` `#b8a4b3` · `--gold-deep` `#7a5a36` · `--gold-soft` `#efe4d2` · `--sand` `#eae1ea` · `theme-color` `#3F2F48`.

## Website typography — "wedding card" (owner, 2026-11-08)
- Headings: **Cormorant Garamond 600** (`cormorant-600.woff2`).
- Accent words ("One Rishta at a Time.", "in your pocket"): **Great Vibes** calligraphy (`greatvibes-400.woff2`) in soft champagne — heading sizes only, never buttons or small text.
- Body, buttons, labels: **Lato 400 / 700** (`lato-400/700.woff2`).
- Home hero: "Bringing Hyderabad's Muslim Families Closer…" then *One Rishta at a Time.* on its own line, `white-space: nowrap`, `font-size: min(1.25em, 12.4vw)` — one line from 320px to 1600px.
- Playfair, Inter and Montserrat removed from the website.

## App typography (owner, 2026-11-08) — same set as the website
- `src/theme/fonts.ts`: `display` → `Cormorant-SemiBold`; `body`/`uiMedium` → `Lato-Regular`; `medium`/`semibold`/`ui` → `Lato-Bold` (English, Roman Urdu). Urdu and Telugu keep Noto Nastaliq / Noto Sans Telugu. Fonts are Latin-subset TTFs in `assets/fonts/`.
- Text sizes: display 36, h1 29, h2 21 (Cormorant runs small).
- Landing: main line then the accent ("One Rishta at a Time.") as its own `Text` in `GreatVibes`, `numberOfLines={1}` + `adjustsFontSizeToFit`, sized `min(h1×1.3, columnWidth ÷ (7.37 × 1.06))` (Roman Urdu ratio 8.03) — one line on every phone (checked 320–430 px). Translations use "…" before the accent.
