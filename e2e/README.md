# End-to-end tests (Playwright, web build)

```bash
npm i -D playwright && npx playwright install chromium   # once
npm run export:web                                         # build dist/
node e2e/serve.js "$(pwd)/dist" 8081 &                     # serve with SPA fallback
node e2e/smoke.js                                          # landing, languages/RTL, login, discover, filters, profile, requests, admin guard
node e2e/journey.js                                        # register → 7-step biodata → publish → admin approve → found via custom value
```
Each run needs fresh demo data (new browser context does this automatically). Screenshots go to `e2e/screenshots/`.
