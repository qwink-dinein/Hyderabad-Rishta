# Design System — Hyderabad Rishta

> Living document (requested as "design.ms"; kept as `design.md` so it renders on GitHub). Last updated: 2026-10-28.
> **Source of truth:** Design PRD v1.0 "Premium Mobile UI/UX, Motion, Sound & Interaction Specification" (owner, 2026-10-28) + the approved reference image `docs/design/reference-ui.jpg`.
> Tokens live in `src/theme/tokens.ts` and `src/theme/fonts.ts` — never hardcode values in screens.
> The redesign changed presentation only; business logic, backend calls and privacy rules are unchanged (V1 checkpoint = commit `4636968`).

## 1. Principles
1. **Elegant, warm, modern** — Deep Emerald and Warm Ivory surfaces; Champagne Gold is an accent, never the default label colour.
2. **Trust without claims** — no fake counts, testimonials, success stories or "verified" badges. "Boosted" is labelled as promotion.
3. **Privacy is visible** — lock icons and plain-language notes wherever data might be shared.
4. **Family-friendly clarity** — ≥44 pt targets, labels above every input, one primary action per area.
5. **Three scripts, one rhythm** — Latin, Nastaliq (RTL) and Telugu each get a native font and line height.
6. **Restrained ornament** — arches, lanterns, jali and floral sprigs support the brand. They are kept out of forms, filters and contact-request screens.

## 2. Colour (Design PRD §2.1)
| Token | Hex | Use |
|---|---|---|
| `emerald` (Deep Emerald) | `#123D32` | primary buttons, headings, navigation highlight |
| `forest` (Dark Forest) | `#0B3028` | hero, premium dark sections, art surround |
| `ivory` (Warm Ivory) | `#F8F4EB` | app background |
| `gold` (Champagne Gold) | `#C6A66B` | decorative accents, selected highlights, dots, rings |
| `goldMuted` (Muted Gold) | `#A98543` | **icons and large text** on light backgrounds (3.1:1) |
| `goldDeep` | `#8A6A30` | gold-toned **small text** on light (AA 4.6:1) — PRD's Muted Gold is too light for 12–14 pt text |
| `goldSoft` | `#F4EBD8` | gold-tinted surfaces (icon circles, reassurance notes, placeholders) |
| `sage` (Sage Mist) | `#E6EEE7` | secondary cards, icon backgrounds, selected tab pill |
| `white` (Porcelain) | `#FFFFFF` | inputs, cards, sheets |
| `charcoal` | `#24342D` | body text (11.9:1) |
| `muted` (Muted Grey) | `#65736D` | secondary text (4.5:1 on ivory) |
| `border` (Border Beige) | `#E2D7C1` | borders, dividers |
| `danger` / `dangerText` / `dangerBg` | `#B65345` / `#9A4335` / `#F8E6E1` | Error Terracotta (borders, icons) / small text / tint |
| `success` / `successBg` | `#267653` / `#E1EFE6` | confirmed actions |

## 3. Typography (Design PRD §2.2)
| Role | English | Urdu | Telugu |
|---|---|---|---|
| Headings (display/h1/h2) | **Lora SemiBold** (serif) | Noto Nastaliq Urdu | Noto Sans Telugu SemiBold |
| Body & controls | Inter Regular / Medium / SemiBold | Noto Nastaliq Urdu | Noto Sans Telugu |
| Line height × | 1.24 for serif headings, 1.45 for body | 2.0 | 1.6 |

Scale (pt): display 34 (hero) · h1 27 (screen titles) · h2 20 (card titles 18–21) · h3 17 · body 15 · label 13 · caption 13 · overline 12 (uppercase, English only). Urdu body +1 pt. Smallest routine text 12 pt. Fonts respect OS text scaling.

## 4. Spacing, radius, elevation (Design PRD §2.3)
- Spacing on a 4-pt scale: 2·4·8·12·16·24·32·48. Screen gutters 16–24.
- Radius: sm 10 (small controls) · md 14 (inputs, OTP boxes) · lg 20 (cards) · xl 26 (sheets, hero) · pill (buttons, chips, segmented).
- One soft shadow (`shadow.card`) plus a 1 px Border Beige outline. No stacked shadows.
- Content max width 720 (wider grid on desktop Discover).

## 5. Navigation (Design PRD §10)
- Bottom tabs: **Home · Discover · Boost · Requests · Profile** (Boost is the raised centre button — see §5b; Shortlist moved into Discover and Home). Labels always shown; the selected tab gets a sage pill behind its icon.
- The **notification bell** sits in every tab's top bar (`TabHeader`) with a gold unread badge, and opens `/notifications` (a stack screen that deep links resolve to).
- There is no Messages tab, because there is no chat. Requests handles the connection workflow.
- Admin navigation stays separate (`/admin/*`).

### 5b. Boost centre tab (owner request 2026-10-28)
- **Tabs:** Home · Discover · **Boost** (raised gold circle in the centre) · Requests · Profile.
  - The Boost button turns emerald when selected, or while a boost is active.
- **Reminders** show only while the member *could* boost and hasn't (`boostNudge() === 'ready'`):
  - a red dot on the Boost button;
  - a soft gold halo that pulses every ~4 s, off under Reduce Motion and on the Boost screen itself;
  - a "Get noticed sooner" card on Home ("Not now" hides it for 3 days);
  - a weekly `boost_reminder` notification.
- **Weekly reminder rules:**
  - Not within 2 days of going live, nor within 7 days of a boost ending.
  - Never while boosting is disabled.
  - Promotional push category: members can switch it off, and the hourly cap applies.
- **Shortlist** is no longer a tab. Members reach it from:
  - a heart button with a count in Discover's header (`ShortlistButton`);
  - a "N saved profiles" row on Home;
  - the profile hearts, as before.
  - `/shortlist` is now a stack screen with Back and Home; old links still work.
- **One boost at a time** (owner rule): while a boost runs, the Boost screen shows "You can boost again after {date}" instead of a Boost button.
  - The backend refuses a second boost (`boost_active`) and repeat taps reuse one unpaid order.
  - A payment for a stray second order is cancelled before charging. Boosts never stack or extend.
  - SQL: `orders_one_open_boost`, `orders_boost_guard`, and `apply_boost` refuses while a boost is active.
- **Profile tab:** keeps a one-line boost summary plus an "Open Boost" button. The full boost flow lives on the Boost tab.

## 6. Components (Design PRD §19)
- **BrandMark** — 8-point star medallion with a rosette (art/Illustrations.tsx).
- **HeroScene** — original arch-framed dusk scenes: Charminar, family doorway, jali + lock, crescent + rings. Hanging lanterns, floral sprigs and one shared grade. No photos of real people.
- **HeroCarousel** — swipe (paging ScrollView), dots, prev/next, pause. ~6 s autoplay that stops on interaction, when the app is backgrounded, and entirely under Reduce Motion. No sound or video.
- **Landing actions** — a three-level hierarchy: **Create your biodata** (filled emerald, primary) › **Find your match** (outlined) › **Already registered? Log in** (tertiary: a soft-gold pill with a person icon and an arrow, 48 pt tall). On phones shorter than 800 pt or narrower than 360 pt, the hero switches to compact mode (smaller art and headline, dots plus pause only), so all three stay in the first screen from 320 × 640 upwards.
- **LanguageSwitcher** — full names, or `compact` (EN / اردو / తె) in headers. Accessibility labels always use full names.
- **Header (stack screens)** — Back and **Home** sit side by side on the start side, and the title stays centred. Home goes to the right place for the person using the app: the member Home tab, the admin dashboard, or the landing page when signed out. It also clears the screens stacked on top, so Back doesn't walk through them again. Guarded screens:
  - the biodata wizard saves the draft first
  - the connect screen asks before discarding a typed message
- **TabHeader / BellButton** — brand or title on the start side; bell (plus optional settings) on the end side.
- **Button** — primary (emerald), secondary (outlined), ghost, gold, danger, light. Pill; 52 pt md / 38 pt sm; optional trailing `arrow` (mirrors in RTL); press scale 0.985.
- **Field / TextField / Select** — label above, hint or inline error, 52 pt inputs with a 14 pt radius. `Select.displayValue` gives a compact closed state (e.g. "+91").
- **OptionList** — large radio cards with an icon and check (e.g. "Profile created for").
- **Segmented** — pill segmented control (Received / Sent).
- **Reveal** — 220 ms fade and slide for conditional fields ("Other", children count).
- **ProfileCard** — 4:5 photo (max 400 pt), heart top-right, Boosted label top-left, "Name, age" plus code, relation badge, icon metadata rows (height, location, education, profession), up to 3 tags. Actions: **View profile** plus a contextual primary button (Express Interest / Interest sent / Respond / Connected). The button is hidden when declined, not accepting, or blocked. `featured` variant for horizontal rails.
- **ProfilePhoto placeholder** (no photo) — the owner-supplied **Hyderabadi bride / groom portraits** (`assets/personas/bride.webp`, `groom.webp`): circular paintings with a champagne-gold rim, arches, lanterns and minarets. Cut from the owner's artwork, 512×512 WebP with a transparent outside, ~55–70 KB each. On cards and the profile page the medallion sits centred (90 % of the shorter side, soft shadow) on the ivory→sage field with the star motifs; avatars under 120 pt show the medallion filling the slot. Chosen by the **profile's** `profileType`. An uploaded photo always wins (and is still governed by its visibility setting); a photo that fails to load falls back to the portrait; a portrait that fails to load falls back to a neutral gold-rimmed BrandMark medallion. Never initials. ~~Emerald serif initial~~ and ~~vector `PersonaArt`~~ (both replaced 2026-10-29 at the owner's request).
- **HeartButton** — 210 ms scale pulse, light haptic, and an accessible announcement.
- **ProfileCardSkeleton** — soft pulse (static under Reduce Motion).
- **PhotoPicker** — one large 4:5 main slot plus two stacked smaller slots, dashed gold empty states, label pills, replace and remove, a 0/3 counter, and the reassurance "Photos are optional…". Never a lone "+".
- **Wizard progress** — 7 segments: done = gold, current = emerald, upcoming = beige. Step chips scroll horizontally.
- **Profile details** — gallery (main photo plus selectable thumbnails), "Name, age", location row, fact chips, code badge, then section cards. Sticky footer: Shortlist plus Express Interest →.
- **Connect sheet** — avatar header, "How would you like to connect?", two radio cards (message / phone), consent checkbox card, preview, then send.
- **Request card** — round gold-ringed avatar, gold "Has offered to share their number" line, status badge, contextual actions, and a poke bell that swings once.
- **OTP input** — one real input (paste, SMS autofill, screen reader) drawn as six boxes; the active box has an emerald border.
- **Toast** — slides up 12 pt with an animated check (success) or info icon.
- **Banner, EmptyState, Confirm dialog, Badge** — unchanged APIs, re-tinted to the new tokens.

## 7. Imagery (Design PRD §4.3)
- All imagery is original vector art. There is no stock photography, so there are no licensing or consent issues, and it scales crisply.
- **To add photography later:** use licensed, consented imagery with one consistent grade, a ≥55% forest gradient overlay for text, and focal positioning so faces aren't cropped. Never show minors.

## 8. Motion (Design PRD §12)
| Interaction | Duration | Notes |
|---|---:|---|
| Button / card press | 120 ms | scale 0.985 |
| Shortlist heart | 210 ms | 1 → 1.25 → 1 |
| Conditional field reveal | 220 ms | fade + 6 pt slide |
| Toast / success | 340 ms | slide + check scale |
| Carousel | ~420 ms paging | autoplay 6 s |
| Poke bell | ~400 ms once | ±14° swing |
| **Screen → screen (phones)** | 340 ms | Native stack slide: iOS default; Android uses the iOS-style slide (`ios_from_right`) so both feel the same. Urdu slides from the left. Swipe-back from anywhere on iOS. Login → app (replace) also slides. |
| **Modal (Filters)** | native | Rises from the bottom (`slide_from_bottom`). |
| **Tab switch** | 240 ms | Short sideways shift, ease-out-quint `cubic-bezier(.22,1,.36,1)`. |
| **Screen → screen (web)** | 320 ms | Fade + 14 px rise each time a screen gains focus (also on back). Browsers get no native transition. |
- All screen motion lives in `src/navigation/transitions.tsx` (stacks, admin stack, tabs). Don't set animations per screen.
- Reduce Motion (`useReducedMotion`) disables every animation above and stops autoplay. Screen changes become a quick cross-fade (phones and tabs) or a 140 ms fade with no movement (web). Information never depends on motion.
- There is no confetti, no bouncy form motion, and no full-screen loaders for minor actions.

## 8b. Notifications & Featured
- **Featured strip** (Discover, under search) and **Featured rail** (Home): `featured` card variant, "★ Featured" heading and the label "Promoted · shown to everyone". Shown whatever the viewer's filters.
- **Boost proof** (Profile tab): active-until line, a green "featured to every member…" line, or a warning banner if paused, plus a reach count.
- **Arrival banner:** a white card that slides 24 pt down from the top (gold border, icon circle, one line and a chevron), visible for 4.5 s. Tapping it opens the item. It is shown for new notifications while the app is open, on every platform.
- **Push opt-in:** a Home card (bell, "Never miss an interest", Not now / Turn on), never on web, and no more than once per 14 days. Settings → Phone notifications shows a status banner with one next step, category switches, the always-on note, the lock-screen names switch, and a test notification.

## 9. Sound & haptics (Design PRD §13)
- `src/services/feedback.ts`. **Sound effects are OFF by default** (Settings → Sound & haptics). Haptics are on by default and can be turned off.
- Sounds are original sine chimes synthesised for this app (`assets/sounds/*.wav`), each 180–290 ms and quiet:
  - `save`: draft finished or submitted for review.
  - `published`: profile published.
  - `sent`: interest sent.
  - `accepted`: request or number accepted.
- Players load lazily, only after sound is enabled. Effects never overlap and respect the iOS silent switch.
- Nothing plays on taps, navigation, carousel changes, or while browsing. Push notification sounds remain OS-managed.
- Haptics are `select` for shortlist, segmented controls and option cards; `light` for a saved wizard step; `success` for sent, accepted and published.

## 10. RTL rules
The root `direction` flips with the language. Text aligns right in Urdu. Back chevrons and button arrows mirror. Numbers, phone numbers and the OTP boxes stay LTR.

## 11. Accessibility checklist
- Roles on every control: button, radio, checkbox, switch, tab, header, link, alert, progressbar.
- State is exposed: selected, checked, busy, disabled.
- Touch targets are at least 44 pt, and every input has a visible label.
- Live regions announce errors and counts, and the heart change is announced.
- Reduced motion is respected, and colour is never the only signal (badges always have text).
