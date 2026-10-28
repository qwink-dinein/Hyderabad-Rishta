# End-to-end tests (Playwright, web build)

```bash
npm i -D playwright && npx playwright install chromium   # once
npm run export:web                                         # build dist/
node e2e/serve.js "$(pwd)/dist" 8081 &                     # serve with SPA fallback
node e2e/smoke.js                                          # landing, languages/RTL, login, discover, filters, profile, requests, admin guard
node e2e/journey.js                                        # register → 7-step biodata → publish → admin approve → found via custom value
node e2e/admin.js && node e2e/interest.js && node e2e/console.js && node e2e/boostpush.js && node e2e/home.js   # governance, interest/phone offers, admin console, boost + notifications, Home button
node e2e/photos.js && node e2e/onebiodata.js && node e2e/pin.js && node e2e/transitions.js && node e2e/boosttab.js   # 5 MB photos, one number = one biodata, OTP+PIN login, screen transitions, Boost tab
```
At V3: 12 suites, 85 steps, zero console errors. Every suite signs in through `auth.js` (`loginWithOtp`). It handles the PIN screens: it creates PIN **4827** when asked, and uses "Use a different number" when the login opens in PIN mode.
Each run needs fresh demo data (new browser context does this automatically). Screenshots go to `e2e/screenshots/`.
