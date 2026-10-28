// Boost as the centre tab (owner request 2026-10-28): raised button with a reminder while not boosted,
// Home reminder card, shortlist reachable from Discover and Home, Boost flow from the tab.
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
  await loginWithOtp(page, BASE, '9000000001');
  await page.waitForURL((u) => u.pathname.startsWith('/home'));

  await step('tab bar: Home · Discover · Boost (centre) · Requests · Profile — no Shortlist tab', async () => {
    const tabs = await page.getByRole('tab').allInnerTexts();
    const names = tabs.map((x) => x.trim().split('\n').pop());
    if (JSON.stringify(names) !== JSON.stringify(['Home', 'Discover', 'Boost', 'Requests', 'Profile'])) throw new Error(names.join(' · '));
  });
  await step('not boosted → reminder dot on the Boost button + Home reminder card', async () => {
    await page.getByTestId('boost-reminder-dot').waitFor();
    await page.getByTestId('boost-reminder').waitFor();
    await page.getByRole('tab', { name: 'Boost — your profile is not boosted yet' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/b1-home-boost-tab.png` });
  });
  await step('"Not now" hides the Home card (snoozed), the tab still reminds', async () => {
    await page.getByTestId('boost-reminder-later').click();
    await page.getByTestId('boost-reminder').waitFor({ state: 'detached' });
    await page.reload();
    await page.getByTestId('tab-boost').waitFor();
    await page.waitForTimeout(800);
    if (await page.getByTestId('boost-reminder').count()) throw new Error('card came back right away');
    await page.getByTestId('boost-reminder-dot').waitFor();
  });
  await step('Boost tab: explains, shows price, boosts; reminders stop once boosted', async () => {
    await page.getByTestId('tab-boost').click();
    await page.waitForURL((u) => u.pathname.startsWith('/boost'));
    await page.getByText('Be seen first').waitFor();
    await page.getByRole('tab', { name: /Boost/, selected: true }).waitFor(); // centre button shows it's selected
    await page.screenshot({ path: `${SHOTS}/b2-boost-tab.png`, fullPage: true });
    await page.getByTestId('boost-cta').click();
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    await page.getByTestId('boost-status').waitFor({ timeout: 8000 });
    await page.getByText('7 days left').waitFor(); // a fresh 7-day boost
    // One boost at a time: no "Boost for…" button while it runs, just when it can be boosted again.
    await page.getByTestId('boost-again-after').waitFor();
    if (await page.getByTestId('boost-cta').count()) throw new Error('Boost button still offered during an active boost');
    await page.screenshot({ path: `${SHOTS}/b5-boost-active-no-rebuy.png`, fullPage: true });
    await page.goto(BASE + '/home');
    await page.getByTestId('tab-boost').waitFor();
    await page.waitForTimeout(600);
    if (await page.getByTestId('boost-reminder-dot').count()) throw new Error('still reminding after boosting');
    await page.screenshot({ path: `${SHOTS}/b3-boosted.png` });
  });
  await step('Profile tab: compact boost summary links to the Boost tab', async () => {
    await page.goto(BASE + '/dashboard');
    await page.getByTestId('boost-summary').waitFor();
    await page.getByTestId('open-boost').click();
    await page.waitForURL((u) => u.pathname.startsWith('/boost'));
  });
  await step('shortlist: heart on Discover (with count) and a row on Home', async () => {
    await page.goto(BASE + '/discover');
    await page.getByTestId('open-shortlist').waitFor();
    await page.goto(BASE + '/profile/p_2');
    const toggle = page.getByTestId('shortlist-toggle');
    await toggle.waitFor();
    await page.waitForTimeout(500);
    await toggle.click(); // this member has nobody saved yet
    await page.waitForTimeout(600);
    await page.goto(BASE + '/discover');
    await page.getByRole('button', { name: 'Open your shortlist (1 saved)' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/b4-discover-saved.png` });
    await page.getByTestId('open-shortlist').click();
    await page.waitForURL((u) => u.pathname.startsWith('/shortlist'));
    await page.getByTestId('shortlist-count').waitFor();
    await page.goto(BASE + '/home');
    await page.getByTestId('home-shortlist').click();
    await page.waitForURL((u) => u.pathname.startsWith('/shortlist'));
  });
  await step('old /shortlist links still work directly', async () => {
    await page.goto(BASE + '/shortlist');
    await page.getByText('Shortlist').first().waitFor();
  });

  await browser.close();
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (real.length) { console.log('FAILURES:', real); process.exit(1); }
  console.log('BOOST TAB E2E PASSED');
})();
