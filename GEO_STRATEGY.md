# GEO (Generative Engine Optimization) strategy

Goal: make it easy for Google AI Overviews, ChatGPT search, Gemini, Perplexity and Copilot to understand, quote and cite Hyderabad Rishta accurately. Nothing here guarantees that an AI assistant will recommend us; it removes reasons not to.

## 1. Entity consistency

One brand description is used everywhere (website footer, About, Organization JSON-LD, llms.txt, store listings, and to be reused on social profiles, Google Business Profile if eligible, and press):

> Hyderabad Rishta is a Muslim matrimonial platform focused on helping individuals and families discover marriage profiles and meaningful rishta connections, starting with Hyderabad, India.

Source of truth: `website/site.config.mjs` (`BRAND`). Same logo everywhere (`website/static/img/logo-512.jpg`, app icons).

**Owner to do:** create official profiles (Instagram, Facebook, YouTube, X, LinkedIn) with the exact name, logo and description, then add their URLs to `SAME_AS` so they appear in `Organization.sameAs`.

## 2. Answer-oriented content (built)

| Question AI users ask | Where it is answered |
|---|---|
| What is Hyderabad Rishta? | /about/, /faqs/ (first answer), llms.txt |
| How does Hyderabad Rishta work? | /how-it-works/ (8 numbered steps) |
| How can I find a Muslim rishta in Hyderabad? | /blog/how-to-find-a-muslim-rishta-in-hyderabad/ |
| How can families find Muslim bride and groom profiles? | /muslim-matrimony-hyderabad/, bride/groom guides |
| How do I create a Muslim marriage biodata online? | /muslim-marriage-biodata/, /faqs/ |
| What should a Muslim marriage biodata contain? | /blog/complete-guide-to-muslim-marriage-biodata/ (table + sections) |
| How can I protect my privacy on a matrimonial app? | /blog/privacy-tips-for-muslim-matrimonial-app-users/, /safety/ |
| How can families approach proposals online? | /faqs/, /blog/questions-families-should-discuss-before-marriage/ |
| What to consider before sharing contact details? | /faqs/#what-should-i-consider-before-sharing-my-contact-details, /safety/ |
| Alternatives to WhatsApp rishta groups? | /blog/whatsapp-rishta-groups-vs-matrimonial-apps/ (comparison table) |

Writing pattern used: the direct answer in the first sentences under a question-style heading, then detail; comparison tables; numbered steps; dated "Updated" lines on guides; no invented statistics; honest limits ("we do not verify identities").

## 3. Structured data (JSON-LD, built)

| Type | Pages | Notes |
|---|---|---|
| Organization | All | name, url, logo, description, areaServed (Hyderabad, Telangana), knowsLanguage (en/ur/te), email; `sameAs` once social profiles exist |
| WebSite | All | publisher → Organization |
| WebPage / AboutPage / CollectionPage | Core pages / About / Guides index | |
| BreadcrumbList | All except home | Mirrors the visible breadcrumbs |
| BlogPosting | Guides | headline, dates, author = organisation, keywords |
| MobileApplication | All, **only when `PLAY_URL` / `APP_STORE_URL` is set** | No ratings, prices or review counts |
| FAQPage | **Not used** | Google limits FAQ rich results to authoritative government/health sites; Q&A is visible HTML instead |

Validation: `node website/check.mjs` parses every block and rejects rating/review/offer claims. After launch, test key URLs in Google's Rich Results Test and the Schema.org validator (needs the live URL).

## 4. AI crawler policy (implemented, owner decision pending)

Implemented in `website/site.config.mjs` → `robots.txt`:

| Crawler | Purpose | Default |
|---|---|---|
| Googlebot, Bingbot, DuckDuckBot, Applebot | Search indexing | Allowed |
| OAI-SearchBot | ChatGPT search results | Allowed |
| ChatGPT-User, Perplexity-User, Claude-User | Fetches a user asked for | Allowed |
| PerplexityBot, Claude-SearchBot | AI search indexing | Allowed |
| GPTBot, Google-Extended, ClaudeBot, Applebot-Extended, meta-externalagent | AI **model training** | Allowed by default (helps the brand be known to assistants); set `AI_TRAINING=0` to opt out |
| CCBot, Bytespider, Amazonbot, Diffbot, omgili, ImagesiftBot | Bulk scraping | Blocked |

Notes: blocking GPTBot does not remove us from ChatGPT search (that is OAI-SearchBot). Google-Extended does not affect Google Search ranking. robots.txt is a request, not enforcement; user agents can be spoofed. The web app (member data) blocks **all** crawlers on its own subdomain.

**Owner decision needed:** keep training crawlers allowed (default) or set `AI_TRAINING=0`.

## 5. llms.txt

Generated at `/llms.txt`: brand summary, honest limits, links to key pages and guides. It is an experimental convention, **not** a ranking factor and not read by every AI system — kept because it is cheap and accurate.

## 6. Off-site signals (owner / team)

- Consistent listings: Google Business Profile (only if eligible for an online service with a real address policy), Bing Places, JustDial/Sulekha-style directories — same name, description, logo, URL.
- Earned mentions: Hyderabad community organisations, masjid committees, Urdu press (e.g. local newspapers), Muslim community pages — factual coverage, never paid fake reviews.
- Answer real questions on Quora/Reddit in your own name, linking to guides only when genuinely helpful.

## 7. Measuring GEO (what can and cannot be tracked)

- Can track: referrals from chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com (Referer, when sent), branded search growth in Search Console, crawler hits in server logs.
- Cannot track comprehensively: whether an AI answer mentioned or cited us without a click. Do periodic manual checks of 10 fixed questions (90_DAY_GROWTH_PLAN.md).
