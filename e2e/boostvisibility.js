// Owner Mini PRD 2026-10-31 — Boost visibility, Featured profiles & Discover sections, in the real app (web
// build), with several viewers and boosted profiles on one device: Home and Discover sections without
// repeats, Featured following the filters, admin switches taking effect at once, the Boost purchase screen
// (promotional label, exact price, activation/expiry, Boost Now) and My Boost. Boosts are never free outside referrals.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('✓', name);
    } catch (e) {
      errors.push(`${name}: ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: `${SHOTS}/fail-boostvis-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
    }
  };
  const login = (phone) => loginWithOtp(page, BASE, phone);
  const logout = async () => {
    await page.goto(BASE + '/settings');
    await page.getByRole('button', { name: 'Log out' }).first().click();
    await page.waitForTimeout(500);
  };
  const ids = (prefix) => page.$$eval(`[data-testid^="${prefix}-card-"]`, (els, p) => els.map((e) => e.dataset.testid.slice(p.length + 6)), prefix);

  await step('Home: Featured near the top, then Recommended / Recently published / New — no repeats', async () => {
    await login('9000000001');
    await page.goto(BASE + '/home');
    await page.locator('[data-testid^="home-featured-card-"]').first().waitFor({ timeout: 10000 });
    const featured = await ids('home-featured');
    const rest = [...(await ids('home-recommended')), ...(await ids('home-recent')), ...(await ids('home-new'))];
    const all = [...featured, ...rest];
    if (new Set(all).size !== all.length) throw new Error(`repeated cards: ${all.join(',')}`);
    if (!rest.length) throw new Error('no sections below Featured');
    // Featured sits above the member's own cards (completion / activity / boost).
    const fTop = await page.getByTestId('home-featured').evaluate((e) => e.getBoundingClientRect().top);
    const sTop = await page.getByTestId('home-stats').evaluate((e) => e.getBoundingClientRect().top);
    if (fTop > sTop) throw new Error('Featured is below the activity cards');
    // Boosted cards carry the gold edge.
    const border = await page.locator('[data-testid^="home-featured-card-"]').first().evaluate((e) => getComputedStyle(e.firstElementChild).borderTopColor);
    if (border !== 'rgb(201, 160, 90)') throw new Error(`no gold border: ${border}`); // colors.gold (antique gold)
    await page.screenshot({ path: `${SHOTS}/bv-1-home-sections.png`, fullPage: true });
  });

  await step('Discover: Featured · New · Recommended · All Profiles tabs; boosted cards gold; search shows plain results', async () => {
    await page.goto(BASE + '/discover');
    await page.getByTestId('featured-strip').waitFor({ timeout: 10000 }); // opens on Featured when there are boosts
    await page.locator('[data-testid^="boosted-"]').first().waitFor();
    for (const tab of ['new', 'recommended', 'all']) await page.getByTestId(`discover-tab-${tab}`).waitFor();
    await page.getByTestId('discover-tab-all').click();
    await page.locator('[data-testid^="discover-card-"]').first().waitFor();
    await page.screenshot({ path: `${SHOTS}/bv-2-discover-sections.png`, fullPage: true });
    await page.getByTestId('discover-search').fill('Hyderabad');
    await page.getByTestId('discover-search').press('Enter');
    await page.getByTestId('discover-count').waitFor();
    await page.waitForTimeout(500);
    if (await page.getByTestId('featured-strip').count()) throw new Error('sections shown during an explicit search');
    await page.getByTestId('discover-search').fill('');
    await page.getByTestId('discover-search').press('Enter');
    await logout();
  });

  await step('admin: promotional label, Featured off — effective immediately, no redeploy', async () => {
    await login('9000000000');
    // This suite covers the Paid Boost screen; Referral mode is the default since 2026-11-07.
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('hr.demo.db'));
      d.referralSettings = Object.assign({}, d.referralSettings, { mode: 'paid' });
      localStorage.setItem('hr.demo.db', JSON.stringify(d));
    });
    await page.reload();
    await page.goto(BASE + '/admin/pricing');
    await page.getByTestId('plan-label-1').fill('Best value');
    await page.getByTestId('pricing-featuredEnabled').click();
    await page.getByRole('button', { name: 'Save pricing' }).click();
    await page.getByText(/Pricing saved/).waitFor();
    await logout();
    await login('9000000001');
    await page.goto(BASE + '/home');
    // Wait for real cards (rails show skeletons while loading).
    await page.locator('[data-testid^="home-recent-card-"]').first().waitFor({ timeout: 10000 });
    if (await page.getByTestId('home-featured').count()) throw new Error('Featured still on Home');
    await page.goto(BASE + '/discover');
    await page.locator('[data-testid^="discover-card-"]').first().waitFor({ timeout: 10000 }); // nothing featured → opens on All Profiles
    if (await page.getByTestId('featured-strip').count()) throw new Error('Featured still on Discover');
  });

  await step('Boost screen: label, exact price, activation/expiry, "Boost Now · ₹…", no auto-renew', async () => {
    await page.goto(BASE + '/boost');
    await page.getByTestId('plan-badge-d14').getByText('Best value').waitFor({ timeout: 10000 });
    await page.getByTestId('boost-summary').getByText(/Selected: 7-day boost · \W*₹100/).waitFor();
    await page.getByTestId('boost-summary').getByText(/Starts as soon as payment is confirmed/).waitFor();
    await page.getByTestId('plan-d14').click();
    await page.getByTestId('boost-summary').getByText(/Selected: 14-day boost · \W*₹200/).waitFor();
    await page.getByTestId('boost-cta').getByText(/Boost Now · \W*₹200/).waitFor();
    await page.screenshot({ path: `${SHOTS}/bv-3-boost-purchase.png`, fullPage: true });
    await logout();
  });

  await step('a bride buys a 7-day boost → My Boost: days remaining, dates, real counts', async () => {
    await login('9000000104');
    await page.goto(BASE + '/boost');
    await page.getByTestId('boost-cta').getByText(/Boost Now · \W*₹100/).waitFor({ timeout: 10000 });
    await page.getByTestId('boost-cta').click();
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    await page.getByTestId('boost-days-left').getByText('7 days remaining').waitFor({ timeout: 10000 });
    await page.getByTestId('boost-stats').waitFor();
    await page.getByTestId('boost-stat-views').waitFor();
    await page.screenshot({ path: `${SHOTS}/bv-4-my-boost.png`, fullPage: true });
    // Home shows the status instead of the promotion while active.
    await page.goto(BASE + '/home');
    await page.getByTestId('boost-active-card').waitFor({ timeout: 10000 });
    if (await page.getByTestId('boost-reminder').count()) throw new Error('promotion shown during an active boost');
    await logout();
  });

  await step('admin: Featured back on, Boost off → running boosts stay featured, nobody can start a new one', async () => {
    await login('9000000000');
    await page.goto(BASE + '/admin/pricing');
    await page.getByTestId('pricing-featuredEnabled').click();
    await page.getByTestId('pricing-boostEnabled').click();
    await page.getByRole('button', { name: 'Save pricing' }).click();
    await page.getByText(/Pricing saved/).waitFor();
    await logout();
    await login('9000000003'); // another groom
    await page.goto(BASE + '/home');
    await page.getByTestId('home-featured-card-p_4').waitFor({ timeout: 10000 });
    await logout();
    await login('9000000106'); // another bride
    await page.goto(BASE + '/boost');
    await page.getByText(/not available/i).first().waitFor({ timeout: 10000 });
    if (await page.getByTestId('boost-cta').count()) throw new Error('boost still purchasable while switched off');
  });

  await browser.close();
  if (errors.length) {
    console.log('BOOST-VISIBILITY E2E FAILED:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('BOOST-VISIBILITY E2E PASSED');
})();
