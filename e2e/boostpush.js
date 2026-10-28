// Boost visibility + notifications E2E (web): featured ignores filters, push settings, arrival banner.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = process.argv[2] || require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(name); }
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  const login = (phone) => loginWithOtp(page, BASE, phone);

  await step('boosted profile stays featured even when filters exclude it', async () => {
    await login('9000000001');
    await page.goto(BASE + '/discover');
    await page.getByTestId('featured-strip').waitFor({ timeout: 10000 });
    await page.getByTestId('discover-search').fill('zzzz-no-match');
    await page.getByTestId('discover-search').press('Enter');
    await page.getByText('0 profiles').waitFor({ timeout: 8000 });
    await page.getByTestId('featured-strip').getByText('HR-10003').waitFor();
    await page.screenshot({ path: `${SHOTS}/50-featured-despite-filter.png` });
  });
  await step('settings: phone notifications explain web, and preferences persist', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('push-settings').waitFor();
    await page.getByText(/Phone alerts work in the iPhone and Android app/).waitFor();
    await page.getByRole('switch', { name: 'Show names on the lock screen' }).click();
    await page.waitForTimeout(400);
    await page.reload();
    await page.getByTestId('push-settings').waitFor();
    await page.getByRole('switch', { name: 'Show names on the lock screen', checked: true }).waitFor({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/51-push-settings.png`, fullPage: true });
  });
  await step('boost → payment → in-app arrival banner + dashboard proof', async () => {
    await page.goto(BASE + '/boost');
    await page.getByRole('button', { name: /^Boost for/ }).click();
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    await page.getByTestId('arrival-banner').waitFor({ timeout: 8000 });
    await page.screenshot({ path: `${SHOTS}/52-arrival-banner.png` });
    await page.getByTestId('boost-status').waitFor();
    await page.getByText('Your profile is featured to every member looking for your profile type.').waitFor();
  });
  await step('a bride sees the newly boosted groom in Featured; his reach updates', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await page.getByTestId('cta-find').waitFor();
    await login('9000000102');
    await page.goto(BASE + '/discover');
    await page.getByTestId('featured-strip').getByText('HR-10002').waitFor({ timeout: 10000 });
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await page.getByTestId('cta-find').waitFor();
    await login('9000000001');
    await page.goto(BASE + '/boost');
    await page.getByTestId('boost-reach').getByText(/1 member has seen your profile in Featured/).waitFor({ timeout: 8000 });
  });
  await browser.close();
  console.log('\nERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
})();
