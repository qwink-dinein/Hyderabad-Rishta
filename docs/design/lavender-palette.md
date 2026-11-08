# Lavender palette — FINAL (owner, 2026-11-08)

Chosen by the owner from the app previews ("This has been finalised"). Inspired by the owner's lavender
wedding artwork (cream arch, lilac walls, mauve dress, antique lantern gold). Replaces the Royal Burgundy ×
Champagne Gold palette; fonts (Playfair Display, Inter, Montserrat, Mogra hero headline) stay the same.
**Status:** approved for the app; website screens previewed next. Not built yet.

## Colours

| Role | Hex | Used for |
|---|---|---|
| Deep violet | `#3F2F48` | Dark screens: landing/hero, video veil, header bar, dark panels; text on gold buttons |
| Mauve violet | `#5E4A6E` | Headings, filled brand elements (selected chips/tabs, Filters, Boost cards) |
| Mauve soft | `#76627B` | Raised panels on violet |
| Cream | `#F4EEE8` | Light screen / page background |
| Card white | `#FFFCF8` | Cards, inputs |
| Lilac surface | `#EAE1EA` | Secondary cards, icon backgrounds, bands |
| Lantern gold | `#C9A45C` | Primary buttons, Boost badges, headline accent words |
| Gold muted | `#A88446` | Pressed gold; large icons on light |
| Gold deep | `#7A5A36` | Gold-toned small text on light |
| Gold soft | `#EFE4D2` | Gold-tinted surfaces (badges, notices) |
| Gold button gradient | `#E3C98A` → `#B88E45` (edge `#8A6A30`) | Gilded primary buttons |
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
`white` → `#FFFCF8` · `sage` → `#EAE1EA` · `gold` → `#C9A45C` · `goldMuted` → `#A88446` · `goldDeep` → `#7A5A36` ·
`goldSoft` → `#EFE4D2` · `borderGold` → `#B8A4B3` · `border` → `#E4D9E0` · `charcoal` → `#3A2C40` ·
`muted` → `#6B5D70` · `cream` → `#F7F2F6` · `champagne` → `#F1E6F0` · `beige` → `#CDBCCB` · `skeleton` → `#ECE3EA` ·
`overlay` → `rgba(63, 47, 72, 0.58)`; shadows and hard-coded `rgba(58,0,18,…)` → violet `#3F2F48` / `rgba(63,47,72,…)`;
Button gilded gradient `#E9CB6E/#C29A2B/#7A5C27` → `#E3C98A/#B88E45/#8A6A30`.

## Still to update when building
- Logo image (maroon background) — needs a lavender/violet version.
- App screenshots used on the website (phone mock-ups) — retake after the app is rebuilt.
- Optional: hero video clips are red-toned; the owner's lavender artwork could be used on the landing.
