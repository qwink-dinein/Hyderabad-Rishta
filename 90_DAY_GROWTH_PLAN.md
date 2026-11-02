# 90-day SEO / GEO / ASO growth plan

Principles: local before national, useful before many, privacy before traffic, conversion before vanity, real data before claims. Targets are activities, not promised rankings.

## Days 1–14 — Launch the foundation

- [ ] Domain + hosting live (www = website, app = web app, apex 301). `npm run site:check` with production env.
- [ ] Search Console (Domain property) + Bing Webmaster Tools; submit sitemap; inspect & request indexing for /, /muslim-matrimony-hyderabad/, /muslim-rishta-hyderabad/, /free-muslim-rishta-hyderabad/, /muslim-marriage-biodata/, /how-it-works/.
- [ ] Cloudflare Web Analytics (cookieless).
- [ ] Confirm contact email; legal review of privacy page started.
- [ ] Official social profiles with identical name/logo/description → `SAME_AS`.
- [ ] Play listing submitted (English), Data safety, account-deletion URL; add `PLAY_URL`.
- [ ] Baseline: run the 10 GEO questions (below) in ChatGPT, Gemini, Perplexity, Google; record whether Hyderabad Rishta appears.

## Days 15–30 — Validate keywords, fix gaps

- [ ] Google Keyword Planner + Search Console queries: replace "unvalidated" in SEO_KEYWORD_STRATEGY.md with real impressions/volumes; re-prioritise clusters.
- [ ] Check "free rishta" queries (and misspellings like "free rights") in Search Console; adjust /free-muslim-rishta-hyderabad/ title/description if impressions but low CTR.
- [ ] Urdu biodata article reviewed by a native writer → set `status: published`.
- [ ] Urdu/Telugu store listings reviewed; localized listings live.
- [ ] Screenshot set (ASO_STRATEGY.md) with sample data labelled.

## Days 31–60 — Content and local authority

Publish 2 guides per week (each: one search intent, internal links, CTA, reviewed for accuracy and sensitivity):

| Week | Topic | Cluster |
|---|---|---|
| 5 | How to write the "About me" section of a biodata (with examples) | Biodata |
| 5 | Rishta for a divorced or widowed family member: a respectful guide | Rishta / how-to |
| 6 | NRI Hyderabadi families: finding a rishta from abroad | NRI |
| 6 | Biodata photo tips: what families look for (privacy-safe) | Biodata |
| 7 | Telugu-speaking Muslim families: using the app in Telugu | Local / language |
| 7 | How to spot fake matrimonial profiles and money scams | Trust |
| 8 | Marriage bureau vs app vs family network: costs and privacy | Bureau |
| 8 | Questions to ask in the first family phone call | How-to |

- [ ] Outreach to 10 Hyderabad community organisations / Urdu media for factual coverage (no paid links).
- [ ] Consider Hindi/Urdu-script landing page only if Search Console shows demand.
- [ ] Location pages: create **only** if a neighbourhood shows real query demand and unique content is possible.

## Days 61–90 — Conversion and measurement

- [ ] App: carry the website's `utm_source` / `utm_content` into sign-up (one new column, no PII) so the database funnel shows organic → registration → publication.
- [ ] Homepage A/B (one change at a time): hero headline, CTA wording, screenshot order.
- [ ] Review the funnel weekly (SQL in SEO_IMPLEMENTATION_REPORT.md §10): verified → biodata started → published → first discovery action.
- [ ] Refresh the top 5 pages by impressions with clearer answers and updated dates.
- [ ] Re-run the 10 GEO questions; compare with the baseline.
- [ ] Play: store listing experiment on the short description or first screenshot.

## The 10 GEO check questions

1. What is Hyderabad Rishta?
2. Best way to find a Muslim rishta in Hyderabad?
3. Muslim matrimonial app for Hyderabad families?
4. Muslim marriage biodata format in English
5. How to create a Muslim marriage biodata online?
6. Alternatives to WhatsApp rishta groups
7. Free Muslim rishta Hyderabad
8. How to protect privacy on matrimonial apps?
9. How to find a rishta for my daughter in Hyderabad?
10. Muslim matrimony for NRI Hyderabadis

## Weekly review (30 minutes)

Search Console: impressions, clicks, CTR, average position by cluster and landing page; indexed pages; new queries. Website analytics: CTA clicks by page; AI referrers (chatgpt.com, perplexity.ai, gemini.google.com, copilot). App funnel SQL. Play Console: store listing visitors → installs.
