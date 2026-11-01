# Final palette: Lac, Pearl & Antique Gold

Approved by the owner on 2026-11-01. Preview: `docs/mockups/hq/final-palette.png`.
Replaces the Emerald & Gold palette once the redesign is built. Screen layout and journey are still to be chosen.

## Colours and their one job

| Token | Hex | Job (only this) |
|---|---|---|
| `lac` | `#4A0E1F` | Brand: opening screen, headers, profile banner, main dark buttons on light screens |
| `lacRaised` | `#5A1628` | Panels sitting on maroon (login panel, chips on the banner) |
| `lacLine` | `#6B1F33` | Hairlines and field borders on maroon |
| `pearl` | `#FAF6F1` | Screen background for everyday screens |
| `card` | `#FFFFFF` | Cards and inputs on pearl |
| `antiqueGold` | `#C9A05A` | The one main action on maroon (Log in, Send interest on a boosted card), the Boosted label, the emblem |
| `antiqueGoldPressed` | `#9C7634` | Pressed state of gold buttons only; never text (4.2:1 on white) |
| `emerald` | `#1E6B52` | Only "yes": accepted, interest sent, success |
| `ink` | `#2A0B13` | Main text |
| `muted` | `#6B5A5D` | Secondary text on pearl or white |
| `pearlText` | `#FFF7F0` | Main text on maroon |
| `rose` | `#F1DED6` | Body text on maroon |
| `oxide` | `#CDA79C` | Labels and secondary text on maroon |
| `line` | `#EADFD6` | Borders and dividers on pearl |

## Checked contrast (WCAG; 4.5:1 needed for normal text)

| Pair | Ratio |
|---|---|
| ink on pearl | 16.9 |
| lac on pearl | 14.2 |
| pearlText on lac | 14.4 |
| oxide on lac | 7.0 |
| antiqueGold on lac / lac on antiqueGold | 6.3 |
| white on emerald | 6.4 |
| emerald on pearl | 6.0 |
| muted on pearl | 6.0 |
| muted on white | 6.5 |

## Rules
- Bright colours (gold, emerald) cover under a tenth of any screen; most of a screen is pearl or white.
- One colour, one meaning: gold = the main action, emerald = "yes". Never emerald for decoration or gold for headings.
- No gradients, glows or violet. No maroon text on maroon.
- Pressed: buttons shrink to 97% in 120 ms and gold darkens to `antiqueGoldPressed`.
- Nothing relies on colour alone: every status also has words or an icon.
