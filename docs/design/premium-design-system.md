# Premium design system — Royal Burgundy × Champagne Gold × Warm Ivory (8 Nov 2026)

Owner brief: "elevate Hyderabad Rishta into a sophisticated, premium Muslim matrimonial platform" + reference
image (arched hero, gold headline, gilded CTA, Charminar skyline). Visual layer only: no auth, OTP, PIN, Boost,
payment or referral logic changed.

## Tokens — `src/theme/tokens.ts` (single source; names kept as roles so every screen recolours)
| Token | Hex | Role |
|---|---|---|
| `forest` | #3A0012 | Royal Maroon — dark screens (welcome/hero), premium sections |
| `emerald` | #5A0B1D | Deep Burgundy — headings, nav highlights, maroon fills |
| `gold` | #D4AF37 | Royal Gold — primary actions, Boosted, icons on dark. Never text on light (1.9:1) |
| `champagne` | #F8E6B7 | headings and highlights on dark (14.3:1 on maroon) |
| `cream` | #F9F6EF | main text on dark (16.4:1) |
| `beige` | #D7C3A1 | supporting text on dark (10.3:1) |
| `ivory` | #F7F1E7 | Warm Ivory — light screens |
| `white` | #FFFCF6 | warm card / input surface (no pure white) |
| `charcoal` | #351923 | Rich Espresso — text on light (14.2:1) |
| `borderGold` | #8F713B | Antique Gold — outlines/dividers; NOT small text on ivory (4.1:1) |
| `goldDeep` | #7A5C27 | small gold-toned text on ivory (5.5:1) |
| `goldSoft` | #F4E8CC | champagne tint for badges / selected states on light |

## Typography — `src/theme/fonts.ts`
- Playfair Display 600 (+ italic for the hero's accent word): `display` role — titles, h1/h2.
- Inter 400/500/600: body, inputs, profile details.
- Montserrat 500/600 (new `ui` / `uiMedium` roles): buttons, labels, overlines, tab bar.
- Urdu: Noto Nastaliq Urdu (line height ×1.9–2.0, no faux italics); Telugu: Noto Sans Telugu. Both still load
  on demand; Roman Urdu uses the Latin fonts.

## Components
- `Button` (`src/components/ui/Button.tsx`): primary/gold = champagne→gold gradient, royal-maroon text, soft
  shadow (no glow); secondary = warm ivory with antique-gold hairline; light = transparent + antique gold on dark.
- `Text`: new `button` variant (Montserrat); `label` and `overline` use Montserrat.
- Landing (`src/components/onboarding/Welcome.tsx`): arched hero frame with gold hairline, diptych of the brand's
  bride/groom art (HERO_COUPLE slot for a licensed couple photo), uppercase eyebrow with gold rules, champagne
  headline with gold-italic accent word (`*word*` in the translation), tagline "Rishton Ka Safar, Ab Bina Kisi
  Fees Ke.", gilded CTA, trust lines, faint Charminar skyline, sticky CTA after scrolling.

## Not changed
Business logic, copy elsewhere, layouts of inner screens (they inherit tokens, fonts and buttons). The artwork
files in `src/components/art/` keep their own colours.
