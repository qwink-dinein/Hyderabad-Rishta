// Owner request 2026-10-29: (1) after expressing interest the profile and cards say "Interest sent"
// at once and a duplicate is impossible; (2) the Requests tab shows how many interests wait for an
// answer; (3) notifications pop up for payment, boost, accepted interests, numbers shared.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';
const errors = [];
let browser;
async function step(name, phone, fn) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();
  const local = [];
  page.on('pageerror', (e) => local.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) local.push('console: ' + m.text().slice(0, 200)); });
  try {
    if (phone) await loginWithOtp(page, BASE, phone);
    await fn(page);
    if (local.length) throw new Error(local.join(' | '));
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, '-', e.message.split('\n').slice(0, 3).join(' ¦ '));
    errors.push(name);
    await page.screenshot({ path: `${SHOTS}/fail-live-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
  }
  await ctx.close();
}

(async () => {
  browser = await chromium.launch();

  await step('express interest → profile says "Interest sent" the moment you return; card badge too; no second send', '9000000001', async (page) => {
    await page.goto(BASE + '/profile/p_12');
    await page.getByTestId('shortlist-toggle').click(); // so we can see its card on the Shortlist tab
    await page.waitForTimeout(500);
    await page.getByTestId('express-interest').click();
    await page.getByTestId('connect-intro').click();
    await page.getByTestId('preview-request').click();
    await page.getByTestId('confirm-send').click();
    await page.waitForURL((u) => u.pathname === '/profile/p_12', { waitUntil: 'commit' });
    // Immediately: the footer shows the sent state and never offers "Express interest" again.
    await page.getByTestId('interest-sent').getByText('Interest sent').waitFor({ timeout: 1500 });
    if (await page.getByTestId('express-interest').count()) throw new Error('Express interest still offered');
    await page.screenshot({ path: `${SHOTS}/l1-interest-sent.png` });
    // Every list with this profile shows it too (its card on the Shortlist tab).
    await page.getByRole('tab', { name: 'Shortlist' }).click().catch(() => page.goto(BASE + '/shortlist'));
    await page.goto(BASE + '/shortlist');
    await page.getByText('Interest sent').first().waitFor();
    // Re-opening the connect screen (back button, old link) can't send a duplicate.
    await page.goto(BASE + '/request/p_12');
    await page.getByTestId('connect-already').waitFor();
    if (await page.getByTestId('connect-intro').count()) throw new Error('connect options still shown');
  });

  await step('Requests tab badge counts interests waiting for an answer and drops when you respond', '9000000001', async (page) => {
    await page.waitForFunction(() => /1 new interest/.test(document.querySelector('[role="tab"][aria-label^="Requests"]')?.getAttribute('aria-label') || ''), null, { timeout: 8000 });
    const badge = await page.getByRole('tab', { name: /^Requests/ }).innerText();
    if (!/^1\b/.test(badge.trim())) throw new Error(`badge text: ${badge}`);
    await page.screenshot({ path: `${SHOTS}/l2-requests-badge.png` });
    await page.goto(BASE + '/requests');
    await page.getByTestId('decline-r_1').click();
    await page.getByRole('button', { name: 'Decline', exact: true }).last().click().catch(() => undefined);
    await page.waitForFunction(() => !/new interest/.test(document.querySelector('[role="tab"][aria-label^="Requests"]')?.getAttribute('aria-label') || ''), null, { timeout: 8000 });
  });

  await step('paid boost: "Payment confirmed" and "Your boost is active" both pop up, in turn', '9000000001', async (page) => {
    await page.goto(BASE + '/boost');
    await page.getByTestId('boost-cta').click();
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    const seen = new Set();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && seen.size < 2) {
      const b = page.getByTestId('arrival-banner');
      if (await b.count()) seen.add((await b.getAttribute('aria-label')) || '');
      await page.waitForTimeout(400);
    }
    const all = [...seen].join(' | ');
    if (!/Payment confirmed/.test(all) || !/boost is active/i.test(all)) throw new Error(`banners: ${all}`);
  });

  await step('accepting an interest that came with a number: the sender is told their number is now visible', '9000000001', async (page) => {
    await page.goto(BASE + '/requests');
    await page.getByRole('button', { name: 'Accept & reveal number' }).first().click().catch(async () => page.getByRole('button', { name: 'Accept', exact: true }).first().click());
    await page.waitForTimeout(800);
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await page.getByTestId('cta-find').waitFor();
    await loginWithOtp(page, BASE, '9000000100');
    await page.goto(BASE + '/notifications');
    await page.getByText(/accepted your interest\. They can now see the number you shared/).first().waitFor();
  });

  await browser.close();
  if (errors.length) { console.log('FAILURES:', errors); process.exit(1); }
  console.log('LIVE STATE E2E PASSED');
})();
