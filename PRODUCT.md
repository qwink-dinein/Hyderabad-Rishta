# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users
Hyderabadi Muslim families, used about equally by two groups (owner, 2026-11-01):
- **Parents, elders and relatives** looking for a match for a son or daughter. Many use few apps; some read Urdu or Telugu more comfortably than English.
- **The bride or groom themselves**, creating and managing their own biodata.

Phones: a real mix of Android and iPhone (owner, 2026-11-01), including families in the Gulf, US and UK.

The team (admins and two master admins) also uses the app to review biodatas, add members on a family's behalf, manage pricing and send announcements.

## Product Purpose
A matrimony app where a family creates one structured biodata per mobile number, discovers suitable profiles of the opposite side, and connects only when both sides agree, with phone numbers and photos shared by consent.

Success for the owner (2026-11-01): the app feels **easy to use**, members find **trustworthy matches**, and browsing turns into action ("easy lead conversion"): interests sent and accepted, numbers shared, boosts taken.

## Positioning
Built for one community, not a national catalogue: Hyderabadi Muslim families, with local places, maslak, Urdu and Telugu built in, privacy and consent at every step, simple enough for elders, and low cost with no subscriptions or pushy selling (owner, 2026-11-01).

## Operating Context
- Families browse together; a parent may hold the phone while the son or daughter decides.
- Login: mobile number (always typed) + 4-digit PIN; new phones confirm once with a WhatsApp code.
- A biodata is a guided 7-step form; a member only ever sees the opposite side (bride ↔ groom).
- Connecting: interest with an introduction → accept/decline → optional, separate consent to share the phone number.
- Boost (7/14/30 days) puts a profile in Featured; there is no chat.

## Capabilities and Constraints
- Expo SDK 58 / React Native app (iOS, Android, web build for demos); Supabase backend; three languages: English, Urdu (right-to-left, Nastaliq) and Telugu.
- One mobile number = one account = one biodata. Members see only the opposite side; filters cannot override it.
- Photos optional; the owner controls who sees photos, income and family details.
- Paid boosts exist in pricing but **no payment gateway is connected yet** (open owner decision: in-app purchase vs Indian gateway vs free).
- Admin approval of new biodatas can be switched on or off by the team; it is currently off.
- **Colour (decided 2026-11-01):** Lac, Pearl & Antique Gold: Laad Bazaar lac maroon, pearl white, antique gold for the main action, emerald only for "yes". Tokens and contrast in `docs/design/palette.md`. Screen layout for the redesign is still open.

## Brand Commitments
- Name: **Hyderabad Rishta**; tagline "Faith · Family · Better futures".
- Gold eight-point emblem (`BrandMark`) is the app icon and logo.
- Greeting on the opening screen: "Assalamu alaikum".
- Voice: warm, respectful, plain; never pushy.

## Evidence on Hand
- No testimonials, success stories, member counts or press exist. Do not invent any.
- Profiles are **not identity-verified**; never claim "verified profiles". Admin review exists but is optional.
- Promises the product actually keeps: numbers stay private until shared by consent; photo visibility is the owner's choice; connecting needs both sides to agree; boosted profiles are labelled as promotion.

## Product Principles
1. **Easy first:** every key task (log in, create biodata, find, connect) works for an elder on a small phone without help.
2. **Trust is earned by behaviour, not claims:** show privacy and consent where they happen; no fake proof.
3. **Every screen moves a match forward:** clear next step from browsing to interest to number shared.
4. **Our community, our languages:** Urdu and Telugu are first-class, not translations bolted on.
5. **No pressure:** promotion is honest and optional; nothing auto-renews.

## Accessibility & Inclusion
- Elders: large touch targets (≥44 pt), labels above every field, readable text sizes, respects the phone's text-size setting.
- Right-to-left layout for Urdu; Nastaliq needs extra line height.
- Reduce Motion respected; nothing relies on colour alone.
