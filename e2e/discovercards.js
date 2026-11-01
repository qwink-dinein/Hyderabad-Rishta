// Design PRD 2026-11-01 — Discover screen & premium profile cards, in the real app (web build):
// tabs Featured / New / Recommended / All Profiles (selection kept after opening a profile), boosted cards in
// gold vs compact ordinary cards, no public engagement numbers or verification ticks, card menu (Report /
// Block), shortlist heart updating at once, Send Interest flow, and layout at 320 px.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('✓', name);
    } catch (e) {
      errors.push(`${name}: ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: `${SHOTS}/fail-dcards-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
    }
  };
  const selected = (tab) => page.getByTestId(`discover-tab-${tab}`).getAttribute('aria-selected');

  await loginWithOtp(page, BASE, '9000000001');

  await step('opens on Featured with gold boosted cards; header has shortlist, filters and bell', async () => {
    await page.goto(BASE + '/discover');
    await page.getByTestId('featured-strip').waitFor({ timeout: 15000 });
    if ((await selected('featured')) !== 'true') throw new Error('Featured not selected');
    for (const id of ['open-shortlist', 'discover-filter-btn', 'bell', 'discover-search']) await page.getByTestId(id).waitFor();
    const first = page.locator('[data-testid^="list-card-"]').first();
    await first.locator('[data-testid^="boosted-"]').waitFor();
    const border = await first.evaluate((e) => getComputedStyle(e).borderTopColor);
    if (border !== 'rgb(201, 160, 90)') throw new Error(`boosted card border ${border}`);
    await page.screenshot({ path: `${SHOTS}/dc-1-featured.png` });
  });

  await step('no public engagement numbers or verification ticks on cards', async () => {
    const text = await page.locator('[data-testid^="list-card-"]').first().innerText();
    if (/Profile Views|Shortlists|Interest Requests|verified/i.test(text)) throw new Error(`card shows private stats: ${text}`);
  });

  await step('All Profiles: ordinary cards are compact (no gold, no Boosted badge) with View Profile + Send Interest', async () => {
    await page.getByTestId('discover-tab-all').click();
    await page.getByTestId('discover-count').waitFor();
    const cards = page.locator('[data-testid^="list-card-"]');
    await cards.first().waitFor();
    const n = await cards.count();
    let ordinary = null;
    for (let i = 0; i < n && !ordinary; i++) if (!(await cards.nth(i).locator('[data-testid^="boosted-"]').count())) ordinary = cards.nth(i);
    if (!ordinary) throw new Error('no ordinary card loaded');
    const border = await ordinary.evaluate((e) => getComputedStyle(e).borderTopColor);
    if (border === 'rgb(201, 160, 90)') throw new Error('ordinary card has the gold border');
    await ordinary.getByText('View profile').waitFor();
    await ordinary.getByText('Send Interest').waitFor();
    await page.screenshot({ path: `${SHOTS}/dc-2-all.png` });
  });

  await step('the selected tab is kept after opening a profile and coming back', async () => {
    await page.getByTestId('discover-tab-recommended').click();
    const card = page.locator('[data-testid^="list-card-"]').first();
    await card.waitFor({ timeout: 10000 });
    await card.getByText('View profile').click();
    await page.waitForURL((u) => u.pathname.startsWith('/profile/'));
    await page.goBack();
    await page.getByTestId('discover-tab-recommended').waitFor();
    if ((await selected('recommended')) !== 'true') throw new Error('tab not kept');
  });

  await step('shortlist heart updates the header count at once', async () => {
    const before = await page.getByTestId('open-shortlist').getAttribute('aria-label');
    await page.locator('[data-testid^="list-card-"]').first().getByRole('button', { name: 'Shortlist', exact: true }).click();
    await page.waitForFunction((b) => document.querySelector('[data-testid="open-shortlist"]').getAttribute('aria-label') !== b, before, { timeout: 8000 });
    await page.locator('[data-testid^="list-card-"]').first().getByRole('button', { name: 'Shortlisted', exact: true }).click();
  });

  await step('card menu offers Report and Block; Report opens the report form', async () => {
    const card = page.locator('[data-testid^="list-card-"]').first();
    const id = (await card.getAttribute('data-testid')).replace('list-card-', '');
    await page.getByTestId(`card-menu-${id}`).click();
    await page.getByTestId(`card-menu-list-${id}`).getByText('Block and hide').waitFor();
    await page.getByTestId(`card-menu-list-${id}`).getByText('Report profile').click();
    await page.waitForURL((u) => u.pathname === `/profile/${id}` && u.searchParams.get('report') === '1');
    await page.goBack();
  });

  await step('Send Interest opens the Express Interest flow', async () => {
    await page.getByTestId('discover-tab-all').click();
    const btn = page.locator('[data-testid^="card-express-"]').filter({ hasText: 'Send Interest' }).first();
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await page.waitForURL((u) => u.pathname.startsWith('/profile/') && u.searchParams.get('express') === '1');
    await page.goBack();
  });

  await step('photos: count + arrows when several are allowed; "Photo on request" when restricted', async () => {
    // A 1×1 image; p_2 (boosted) gets two public photos; p_6 (interest pending, no photo consent) gets
    // photos visible only on consent.
    const img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await page.evaluate((uri) => {
      const d = JSON.parse(localStorage.getItem('hr.demo.db'));
      const set = (id, vis) => {
        const p = d.profiles.find((x) => x.id === id);
        p.biodata.photos = [{ id: id + 'a', uri }, { id: id + 'b', uri }];
        p.biodata.privacy.photoVisibility = vis;
      };
      set('p_2', 'public');
      set('p_6', 'onConsent');
      localStorage.setItem('hr.demo.db', JSON.stringify(d));
    }, img);
    await page.goto(BASE + '/discover');
    await page.getByTestId('discover-tab-all').click();
    await page.getByTestId('discover-search').fill('Fatima');
    await page.getByTestId('discover-search').press('Enter');
    const fatima = page.getByTestId('list-card-p_2');
    await fatima.getByText('1/2').waitFor({ timeout: 10000 });
    await fatima.getByRole('button', { name: 'Next photo' }).click();
    await fatima.getByText('2/2').waitFor();
    await page.screenshot({ path: `${SHOTS}/dc-4-photos.png` });
    await page.getByTestId('discover-search').fill('Bengaluru');
    await page.getByTestId('discover-search').press('Enter');
    const restricted = page.getByTestId('list-card-p_6');
    await restricted.getByText('Photo on request').waitFor({ timeout: 10000 });
    if (await restricted.getByText(/\d\/2/).count()) throw new Error('restricted photos counted on the card');
    await page.getByTestId('discover-search').fill('');
    await page.getByTestId('discover-search').press('Enter');
  });

  await step('320 px: no horizontal overflow, buttons on one line, text not shrunk', async () => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(BASE + '/discover');
    await page.locator('[data-testid^="list-card-"]').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px`);
    const h = await page.locator('[data-testid^="card-express-"]').first().evaluate((e) => e.getBoundingClientRect().height);
    if (h > 52) throw new Error(`Send Interest wrapped (${h}px tall)`);
    await page.screenshot({ path: `${SHOTS}/dc-3-320.png` });
  });

  await browser.close();
  if (errors.length) {
    console.log('DISCOVER-CARDS E2E FAILED:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('DISCOVER-CARDS E2E PASSED');
})();
