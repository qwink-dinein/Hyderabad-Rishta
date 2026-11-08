# hyderabadrishta.com — domain setup (bought 2 Nov 2026 at Spaceship)

The address everything uses is **https://hyderabadrishta.com** (`www.` should redirect to it).

## What the code already does
- **App:** `EXPO_PUBLIC_SITE_URL=https://hyderabadrishta.com` in every EAS profile (`eas.json`). Refer & Earn now
  shows and shares the link `https://hyderabadrishta.com/r/<CODE>` next to the code.
- **Android App Links:** `app.json` → `android.intentFilters` (autoVerify) for `https://hyderabadrishta.com/r/*` and
  `https://www.hyderabadrishta.com/r/*`, so a tapped invitation opens the app at `/r/<CODE>` (the code is kept
  for sign-up). Needs a new build to take effect.
- **Website** (`website/`, built with `SITE_URL=https://hyderabadrishta.com npm run site:build`):
  - `/r/<CODE>` → one invitation page (shows the code, "Open Hyderabad Rishta", how to use it). `_redirects`
    rewrites every `/r/*` to it; `noindex`.
  - `/.well-known/assetlinks.json` → proves the app owns the domain. It lists the EAS signing key
    `5B:30:37:…:B2:8A`. **When the Play listing exists, add Google Play's app-signing SHA-256**
    (Play Console → Test and release → App integrity) with `ANDROID_CERT_SHA256="<eas>,<play>"` at build time.
  - Privacy, Terms, Safety and the SEO pages (indexable once built with `SITE_URL`).

## Owner steps (accounts and DNS — only the owner can do these)
1. **Host the website on Cloudflare (free).** The repo has `wrangler.jsonc` for the newer **Workers (static assets)** setup:
   connect the repo under Workers & Pages → Create → Import a repository, Build command `node website/build.mjs`,
   Deploy command `npx wrangler deploy`, build variable `SITE_URL` = `https://hyderabadrishta.com`. (Older **Pages** setup also works: Cloudflare dashboard → Workers & Pages → Create → Pages →
   connect the GitHub repo `qwink-dinein/Hyderabad-Rishta`:
   - Build command: `node website/build.mjs` (no packages needed) · Output directory: `website/dist`
   - Environment variable: `SITE_URL` = `https://hyderabadrishta.com`)
2. **Point the domain.** Easiest: add the site to Cloudflare (free plan) and, in Spaceship → Domains →
   hyderabadrishta.com → Nameservers, replace Spaceship's nameservers with the two Cloudflare gives you.
   Then in the Pages project → Custom domains, add `hyderabadrishta.com` and `www.hyderabadrishta.com`
   (add a redirect rule www → apex). DNS changes can take a few hours.
3. **Check:** `https://hyderabadrishta.com/.well-known/assetlinks.json` shows the JSON above, and
   `https://hyderabadrishta.com/r/HRTEST` shows the invitation page.
4. **New Android build** (picks up the link and the App Links filter).
5. Later: Play Console privacy-policy URL = `https://hyderabadrishta.com/privacy/`; Google Search Console
   verification token → `GOOGLE_SITE_VERIFICATION`; business email on the domain if wanted (e.g. Zoho Mail or
   Google Workspace, set up in Cloudflare DNS).

## App store links (the website's only call to action — owner 2026-11-08)
The website has no web sign-up, log-in or "create" buttons: every call to action is a pair of store badges
(Google Play + App Store) — header "Get the app" → home `#download`, home hero, Boost card, download section,
the box at the end of every page, How it works, and the invitation page `/r/<CODE>`.
Until the listings are live each badge shows **Coming soon** and links nowhere. To switch them on:
Cloudflare → Workers & Pages → hyderabad-rishta → Settings → Build → **Variables**: add
`PLAY_URL` = `https://play.google.com/store/apps/details?id=com.hyderabadrishta.app` and/or
`APP_STORE_URL` = the App Store link → **Retry/redeploy**. Every badge on every page becomes a real link, and the
MobileApplication structured data appears. Before launch, swap the drawn badges in `website/build.mjs`
(`storeBadges`) for Google's and Apple's official badge artwork (their brand guidelines).

### Android APK download (until Google Play is live)
The Android badge downloads the APK directly ("Download for Android · Free APK"). It points at the latest EAS
`preview` build, set in `website/site.config.mjs` (`ANDROID_APK_URL`) or as the Cloudflare build variable
`ANDROID_APK_URL`. **Update it after every new Android build** (EAS gives a new link each time). It is never
labelled "Google Play" (Google's badge rules); once `PLAY_URL` is set the Play badge replaces it.
Support email: never printed in the website HTML — the Contact page assembles it on click (`contact.js`).
