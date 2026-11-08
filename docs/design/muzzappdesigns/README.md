# muzzappdesigns — website + app redesign concepts (8 Nov 2026)

Saved for a future redesign. **Status: concepts shown to the owner; not built yet.**

- **Live design canvas:** https://claude.ai/artifact/NHgvYVanxaNXM8ibWXNyoY (title "muzzappdesigns"; private to the owner).
  Two pages: **Website** (Home, Guide article, Invitation `/r/CODE`, Buttons & motion) and **Mobile app**
  (Welcome, Home, Discover, Profile, Filters, Requests, Boost & refer, Biodata question).
- **This folder** is a copy of the canvas source so the designs survive even without the canvas:
  `canvas.json` (board layout) and one `*.dc.html` per screen (HTML + inline styles + CSS animations).

## Inspiration (patterns only — muzz.com, studied 8 Nov 2026)
Taken: pill-shaped buttons (fully rounded, bold, lift on hover / press to 97%), a big centred hero with one strong
call to action, alternating feature rows with two tilted, overlapping phone screenshots beside a large headline,
soft tinted bands between sections, a premium section in a second accent (ours: gold Boost), sticky header.
App: full-photo profile cards with name/age over the photo and info chips, round action buttons under the card,
slider filters in a bottom sheet, chat-style request list, a premium-style Boost screen.
Kept ours: maroon `#4A0E1F` / deep `#330915` / gold `#C9A05A` / ivory `#FAF6F1`, Lora + Inter, our copy and
features, no member counts or success claims (see the website's "Honest by design").

## Motion
Rise-in on load and on scroll (CSS scroll-driven animations), floating tilted phones, card lift with a gold edge,
header shadow on scroll, reading-progress line on guides, cards sliding in on the app, a progress ring on Boost.
All motion stops under `prefers-reduced-motion`.

## Images
The `.dc.html` files reference the canvas's uploaded images as `/_blob/<id>`. Local copies are in `images/`:

| Canvas url | File |
|---|---|
| `/_blob/a3f41a96b049af35252b160d750b5526` | `images/welcome.jpg` (app welcome screen) |
| `/_blob/9b57e60c1d6bcf46ef44b9d9d7939237` | `images/home.jpg` (app Home with the Boost card) |
| `/_blob/798822c46df79902963c8ab1367b083c` | `images/discover.jpg` |
| `/_blob/ed8237fb31e5207627507c1458b31c7d` | `images/profile.jpg` |
| `/_blob/8dd0f3df57227e88b07de64654107cd7` | `images/refer.jpg` |
| `/_blob/111aea94545e08f68629033779d16084` | `images/biodata.jpg` |
| `/_blob/8e64da0f20598a49de652e325067af2c` | `images/requests.jpg` |
| `/_blob/e29fa85e1aaa3897eb6dd87f61b54e0c` | `images/logo-512.jpg` (= `website/static/img/logo-512.jpg`) |
| `/_blob/e4641f93dc1ec87fc2d5c8cf8d26a465` | `images/bride.webp` (= `assets/personas/bride.webp`) |
| `/_blob/fb5256d60d53b779f9785df70ccdce2a` | `images/groom.webp` (= `assets/personas/groom.webp`) |

## Open decision before building the app
Discover: one-profile-at-a-time card with Not now / Express interest / Shortlist buttons (as drawn), or the new
full-photo card style kept as a scrolling list (today's behaviour).

## To build later
Website: `website/build.mjs` (CSS + page templates) and `website/content/`. App: screens in `src/app/`,
cards in `src/components/`, tokens in `src/theme/tokens.ts`. Re-open the canvas to adjust before building.
