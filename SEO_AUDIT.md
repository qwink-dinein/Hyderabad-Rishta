# SEO audit — Hyderabad Rishta (2 November 2026)

## 1. What exists today

| Item | Finding |
|---|---|
| Product | Expo SDK 58 / React Native app (Android first), Supabase backend, web build of the same app |
| Production domain | **None.** No domain, DNS, hosting or Search Console property exists yet |
| Public website | **None** before this work |
| Web app | `expo export` with `web.output: "single"` → one `index.html`, client-side rendered |
| Store listings | Not live (APKs are distributed as internal EAS builds) |
| Analytics | No web analytics. Server-side `analytics_events` (no PII) for interests, offers, reveals, pokes, blocks, reports |
| Brand assets | New logo (2026-11-02) in app icons; same logo now used on the website |

## 2. Weaknesses found (before)

| # | Issue | Impact | Status |
|---|---|---|---|
| 1 | No public website or domain | Nothing to rank; brand cannot be found or cited | **Fixed in repo**: `website/` static site (25 pages). Needs a domain to go live |
| 2 | Web app is client-rendered with one generic `<title>` and description | Crawlers see an empty shell; no page-level relevance | Web app kept private; SEO content moved to pre-rendered site |
| 3 | Web app had no `robots` directive | A deployed web app could be indexed (login, onboarding, member screens) | **Fixed**: `noindex` meta, `X-Robots-Tag`, `public/robots.txt` (Disallow all) |
| 4 | No robots.txt / sitemap / canonical / Open Graph / structured data anywhere | No crawl guidance, poor sharing previews, no entity signals | **Fixed** on the website |
| 5 | No answer-oriented content (biodata format, finding a rishta, privacy) | Misses informational and AI-answer queries | **Fixed**: 9 core pages + 11 guides (1 more in review) |
| 6 | No crawler policy for AI search vs training bots | Owner has no control over AI usage | **Implemented** configurable policy (see GEO_STRATEGY.md) |
| 7 | Store metadata not prepared; planned title "Hyderabad Rishta – Muslim Matrimony" is 35 chars (Play/App Store title limit is 30) | Listing would be rejected/truncated | **Fixed**: validated listings in `store/` |
| 8 | Contact email in app copy is `mukarramjahm@gmail.com`; the owner's account email is `mukarramjahmm@gmail.com` | Possible typo → lost support/privacy emails | **Fixed**: owner confirmed `mukarramjahmm@gmail.com`; app, site and tests updated |
| 9 | Privacy policy is a draft pending legal review (DPDP Act 2023) | Compliance risk | Flagged on the page; legal review needed |

## 3. Privacy review (matrimonial data)

- Member profiles are **never** on the public website, in its sitemap, structured data, Open Graph or llms.txt. `website/check.mjs` fails the build if a phone-number pattern appears in any page or a private-looking path appears in the sitemap.
- The web app (which renders member data after login) is `noindex` + `Disallow: /` and should live on its own subdomain.
- The site sets no cookies; optional analytics is cookieless (Cloudflare Web Analytics) and sends no matrimonial data.
- Structured data contains only organisation-level facts. No ratings, reviews, prices or member counts.

## 4. Competitors (qualitative — no traffic or ranking data was available)

Researched by web search on 2 November 2026; no paid SEO tool (Ahrefs/Semrush/Keyword Planner/Search Console) was available, so no volumes, difficulty or rankings are claimed.

| Competitor | Type | Positioning observed |
|---|---|---|
| Siasat Matrimonial | Hyderabad-local, long-established (Siasat newspaper) | Database of profiles, strong NRI angle, iOS app |
| NikahForever | National Muslim matrimony app | "Leading and most trusted" Muslim matrimony |
| Shaadi.com / BharatMatrimony (MuslimMatrimony) / Jeevansathi | National general matrimony with Muslim sections | Scale, brand, paid membership |
| Zariya Matrimony | Hyderabad Muslim matrimony page | Generic marketing copy |
| Nikkahmee, Muzz | Muslim apps (India / global) | "Free for women", "rishta aunty in your pocket" |
| WhatsApp rishta groups, local bureaus (e.g. Doshiza, Abids) | Offline / informal | Free or fee-based, community trust |

**Gaps Hyderabad Rishta can own:** privacy-first and consent-based contact (no number on profile), free biodata (currently), Urdu/Telugu UI, parent-friendly one-question flow, honest (no fake verification) positioning, and practical "how to" content (biodata format, finding a rishta for son/daughter, rishta groups vs apps).

## 5. Indexing risks to watch

See SEO_IMPLEMENTATION_REPORT.md §12.
