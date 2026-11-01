// Owner Mini PRD 2026-10-31 — persistent profile rotation in Discover, in the real app (web build):
// cards really seen (≥ 50 % visible for ≥ 1 s) are not at the top after reopening; Refresh brings different
// profiles; when everything has been seen the caught-up message shows; nothing repeats within the feed.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const cards = () => page.$$eval('[data-testid^="discover-card-"]', (els) => els.map((e) => ({ id: e.dataset.testid.replace('discover-card-', ''), top: e.getBoundingClientRect().top, h: e.getBoundingClientRect().height })));
  const visible = async () => (await cards()).filter((c) => c.top >= 0 && c.top + c.h / 2 <= 860).map((c) => c.id);
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('✓', name);
    } catch (e) {
      errors.push(`${name}: ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: `${SHOTS}/fail-rotation.png` }).catch(() => undefined);
    }
  };
  try {
    await loginWithOtp(page, BASE, '9000000001');
    await page.goto(BASE + '/discover');
    await page.getByTestId('discover-tab-all').click(); // the main feed lives under All Profiles
    await page.locator('[data-testid^="discover-card-"]').first().waitFor({ timeout: 15000 });
    let seenBefore = [];

    await step('cards on screen for over a second count as seen; reopening starts after them', async () => {
      await page.getByTestId('discover-count').waitFor();
      const allBefore = (await cards()).map((c) => c.id);
      // The header (search, Featured, filters) is tall: bring the list's first card fully on screen.
      // The header (search, Featured / Recommended / Recent carousels, filters) is tall: put the list's first
      // card's top just under the screen header.
      await page.locator('[data-testid^="discover-card-"]').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await page.mouse.move(200, 500);
      await page.mouse.wheel(0, -90);
      await page.waitForTimeout(300);
      seenBefore = await visible();
      if (!seenBefore.length) throw new Error('no card visible');
      await page.waitForTimeout(3500); // ≥ 1 s visible + the 2-second batch
      await page.reload(); // the app is closed and opened again
      await page.getByTestId('discover-tab-all').click(); // a fresh start opens on Featured
      await page.locator('[data-testid^="discover-card-"]').first().waitFor({ timeout: 15000 });
      const top = (await cards()).slice(0, seenBefore.length).map((c) => c.id); // the list's first cards after reopening
      if (top.some((id) => seenBefore.includes(id))) throw new Error(`seen cards back on top: ${top} vs ${seenBefore}`);
      // It continues with the next profiles of the same feed (fetched-but-unseen ones are not skipped).
      const expectedNext = allBefore.filter((id) => !seenBefore.includes(id)).slice(0, top.length);
      if (top.join() !== expectedNext.join()) throw new Error(`did not continue: ${top} vs ${expectedNext}`);
      await page.screenshot({ path: `${SHOTS}/rotation-1-reopened.png` });
    });

    await step('Refresh brings profiles that were not on top before, and the feed never repeats a profile', async () => {
      // The header (search, Featured / Recommended / Recent carousels, filters) is tall: put the list's first
      // card's top just under the screen header.
      await page.locator('[data-testid^="discover-card-"]').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
      await page.mouse.move(200, 500);
      await page.mouse.wheel(0, -90);
      await page.waitForTimeout(300);
      const top = await visible();
      if (!top.length) throw new Error('no card visible');
      await page.waitForTimeout(3500);
      await page.getByTestId('discover-refresh').click();
      await page.waitForTimeout(800);
      const after = await visible();
      if (after.some((id) => top.includes(id) || seenBefore.includes(id))) throw new Error(`refresh repeated seen cards: ${after}`);
      const ids = (await cards()).map((c) => c.id);
      if (new Set(ids).size !== ids.length) throw new Error('duplicate card in the list');
    });

    await step('after seeing everything, Discover says you have caught up (and Refresh keeps it so)', async () => {
      for (let i = 0; i < 25; i++) {
        if (await page.getByTestId('discover-caught-up').count()) {
          const box = await page.getByTestId('discover-caught-up').first().boundingBox();
          if (box && box.y < 860) break;
        }
        await page.mouse.wheel(0, 380);
        await page.waitForTimeout(1300);
      }
      await page.waitForTimeout(2500); // last batch of impressions
      await page.getByTestId('discover-refresh').first().click();
      await page.getByText("You've caught up with all available profiles for now.").first().waitFor({ timeout: 10000 });
      await page.getByText('New profiles will appear here as they are published.').first().waitFor();
      // Only people already in touch stay (owner request 2026-11-01), each with its "Interest sent/received" label.
      for (const { id } of await cards()) {
        if (!(await page.getByTestId(`relation-${id}`).count())) throw new Error(`card ${id} listed after everything was seen, without an interest label`);
      }
      await page.screenshot({ path: `${SHOTS}/rotation-2-caught-up.png` });
    });
  } catch (e) {
    errors.push(e.message.split('\n')[0]);
  }
  await browser.close();
  if (errors.length) {
    console.log('ROTATION E2E FAILED:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('ROTATION E2E PASSED');
})();
