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
1. **Host the website on Cloudflare Pages (free).** Cloudflare dashboard → Workers & Pages → Create → Pages →
   connect the GitHub repo `qwink-dinein/Hyderabad-Rishta`:
   - Build command: `node website/build.mjs` (no packages needed) · Output directory: `website/dist`
   - Environment variable: `SITE_URL` = `https://hyderabadrishta.com`
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
