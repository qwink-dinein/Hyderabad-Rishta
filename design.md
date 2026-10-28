# Design System — Hyderabad Rishta

> Living document (requested as "design.ms"; kept as `design.md` so it renders on GitHub). Last updated: 2026-10-28.
> Tokens live in `src/theme/tokens.ts` and `src/theme/fonts.ts` — never hardcode values in screens.

## 1. Principles
1. **Dignified, not flashy** — calm emerald/ivory surfaces, gold only as an accent.
2. **Privacy is visible** — lock icons and plain-language notes wherever data might be shared.
3. **Family-friendly clarity** — large tap targets (≥44 pt), short labels, one primary action per screen.
4. **Honest UI** — no fake counts, testimonials, “verified” badges, or urgency timers. “Boosted” is labelled promotional.
5. **Three scripts, one rhythm** — Latin, Nastaliq (RTL) and Telugu each get a native font and line height.

## 2. Colour
| Token | Hex | Use |
|---|---|---|
| `emerald` | `#123D32` | primary buttons, headings, tab active, hero |
| `emeraldSoft` | `#1D5546` | gradients, switch track |
| `ivory` | `#F8F4EB` | app background |
| `gold` | `#C6A66B` | accents, progress, boost, motifs (decorative only — never body text) |
| `goldDeep` | `#8F7340` | gold-toned **text** (AA on ivory) |
| `sage` | `#E6EEE7` | info banners, selected list rows, chips |
| `white` | `#FFFFFF` | cards, inputs |
| `charcoal` | `#24342D` | body text |
| `muted` | `#5C6B64` | secondary text (≥4.5:1 on ivory) |
| `border` | `#DCD5C3` | hairlines, inputs |
| `danger` / `dangerBg` | `#A63A2B` / `#F7E4E0` | errors, destructive |
| `success` / `successBg` | `#2E6B4F` / `#E1EFE6` | published, accepted |

Contrast: charcoal/ivory 11.9:1 · emerald/ivory 10.9:1 · white/emerald 11.6:1 · muted/ivory ≈5.6:1 · goldDeep/ivory ≈4.6:1.

## 3. Typography
| Role | English | Urdu | Telugu |
|---|---|---|---|
| Display/headings | Cormorant Garamond Bold | Noto Nastaliq Urdu | Noto Sans Telugu SemiBold |
| Body | Inter Regular | Noto Nastaliq Urdu | Noto Sans Telugu Regular |
| Labels/semibold | Inter Medium/SemiBold | Noto Nastaliq Urdu | Noto Sans Telugu SemiBold |
| Line-height × | 1.45 | 2.0 | 1.6 |

Scale (pt): display 34 · h1 28 · h2 22 · h3 17 · body 15 · label 13 · caption 12.5 · overline 11.5 (uppercase, English only). Urdu body +1 pt.
Urdu/Telugu fonts load on demand (see Architecture D10). Max 2 weights per script on screen.

## 4. Spacing, radius, elevation
Spacing 2·4·8·12·16·24·32·48. Radius sm 8 · md 12 · lg 18 (cards) · xl 28 (hero/sheets) · pill. One soft shadow (`shadow.card`) + 1 px border — no stacked shadows. Content max width 720 (wider grid on desktop discover).

## 5. Components
- **Button** — primary (emerald), secondary (outlined), ghost, gold (boost only), danger. Pill shape, min 50 pt (38 small).
- **Field** — label + optional/required marker + hint or inline error (announced via `accessibilityLiveRegion`).
- **ChipGroup** — ≤ 6–8 options, single (radio) or multiple (checkbox).
- **Select** — bottom-sheet modal, search for long lists, optional “Use ‘…’” custom value, multi with Clear/Done.
- **ProfileCard** — photo or emerald placeholder with gold initial ring and 8-point-star motifs; name + code; age · height · marital; city; education · profession; tags; heart.
- **Banner** — info (sage), warning (wheat), success, danger; always with an icon.
- **EmptyState** — motif + icon, title, one-line hint, optional action.
- **Relation badge** (on ProfileCard, under the name): success “✓ Connected”, gold “Interest sent”, emerald “Sent you interest”, danger “Declined your interest”, muted “You declined / Interest expired / You withdrew”. Text always present (colour is never the only signal); it is part of the card's accessibility label.
- **CodeLink** (admin): sage chip with the `HR-` ID in emerald semibold; tapping it opens the member page. Used on every admin list.
- **Admin bell**: 44 pt round white button with a hairline border; red count badge (99+ cap); accessibility label "Alerts, N unread". Alert rows show a gold border when unread, red with an "Action needed" badge when urgent.
- **PhotoPicker** — always three labelled 4:5 slots (Main photo / Photo 2 / Photo 3), gold dashed empty state with “Tap to add”, 0/3 counter. Never a lone “+”.
- **Connect options** — two large radio cards (icon, title, one-line promise) followed by the consent checkbox card when sharing a number.
- **ContactActions** — revealed number in plain sans (not the display face — digits must be unambiguous), Call · Copy · SMS, disclaimer.
- **Toast** & **Confirm dialog** — cross-platform (Alert.alert doesn't support multi-button on web).

## 6. Imagery
- Landing carousel uses original line-art (arch, crescent, lanterns, rings, family, lock, jali). No stock photos of real people — avoids licensing and consent issues.
- **To add photography later:** use licensed, consented nikah/family imagery; dark emerald gradient overlay (≥55%) for legible text; avoid showing faces of minors; provide `accessibilityLabel`s.

## 7. Motion
Crossfade 220/380 ms on the carousel; auto-advance 5.5 s; pauses on interaction; **disabled when Reduce Motion is on**. Button press scale 0.985. No sound effects in MVP (PRD allows optional subtle sounds — off by default if added).

## 8. RTL rules
Root `direction` flips with language; text aligns `right` in Urdu; back chevrons mirror; icons that imply direction mirror; numbers/phone numbers stay LTR.

## 9. Accessibility checklist
Roles on all controls (button, radio, checkbox, switch, tab, header, link, alert); state (`selected`, `checked`, `busy`, `disabled`); ≥44 pt targets; visible labels (no placeholder-only inputs); live regions for errors and counts; reduced-motion respected; colour never the only signal (badges have text).
