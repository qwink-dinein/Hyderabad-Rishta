// No photo → bride/groom illustration (never an initial letter) on cards, details and avatars.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Bride member sees grooms; groom member sees brides.
  for (const [phone, want, name] of [['9000000001', 'bride', 'groom-viewer'], ['9000000102', 'groom', 'bride-viewer']]) {
    await page.context().clearCookies();
    await page.goto(BASE + '/');
    await page.evaluate(() => localStorage.clear());
    await loginWithOtp(page, BASE, phone);
    await page.goto(BASE + '/discover');
    await page.getByTestId(`persona-${want}`).first().waitFor({ timeout: 10000 });
    if (await page.getByTestId(`persona-${want === 'bride' ? 'groom' : 'bride'}`).count()) errors.push(`${name}: wrong illustration on Discover`);
    await page.screenshot({ path: `${SHOTS}/persona-${name}-discover.png` });
    await page.goto(BASE + '/requests');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/persona-${name}-requests.png` });
  }
  await browser.close();
  if (errors.length) { console.log('FAIL', errors); process.exit(1); }
  console.log('PERSONAS E2E PASSED');
})();
