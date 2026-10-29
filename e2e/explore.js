// Exploratory QA (principal-tester pass, 2026-10-29): edge states of the newest features, with a
// screenshot per state for human review. Fails on any page error, console error or broken rule.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const path = require('path');
const SHOTS = path.join(__dirname, 'screenshots', 'explore');
const BASE = 'http://localhost:8081';
const errors = [];
let browser;
async function step(name, phone, fn, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 360, height: 780 } });
  const page = await ctx.newPage();
  const local = [];
  page.on('pageerror', (e) => local.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) local.push('console: ' + m.text().slice(0, 200)); });
  try {
    if (opts.lang) { await page.goto(BASE + '/'); await page.evaluate((l) => localStorage.setItem('hr.lang', l), opts.lang); }
    if (phone) await loginWithOtp(page, BASE, phone);
    await fn(page);
    if (local.length) throw new Error(local.join(' | '));
    console.log('✓', name);
  } catch (e) {
    console.log('✗', name, '-', e.message.split('\n').slice(0, 3).join(' ¦ '));
    errors.push(name);
    await page.screenshot({ path: `${SHOTS}/FAIL-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
  }
  await ctx.close();
}
const shot = (page, n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));
const setDb = (page, src) => page.evaluate((s) => { const d = JSON.parse(localStorage.getItem('hr.demo.db')); new Function('d', s)(d); localStorage.setItem('hr.demo.db', JSON.stringify(d)); }, src);

(async () => {
  browser = await chromium.launch();

  await step('brand-new member: Home, Profile, Boost, Activity all make sense without a biodata', '9812300099', async (page) => {
    await page.goto(BASE + '/home'); await page.waitForTimeout(1200); await shot(page, 'n1-home');
    if (await page.getByTestId('completion-card').count()) throw new Error('completion card without a biodata');
    if (await page.getByTestId('boost-reminder').count()) throw new Error('boost card without a biodata');
    await page.goto(BASE + '/dashboard'); await page.waitForTimeout(800); await shot(page, 'n2-profile');
    await page.getByTestId('create-biodata').waitFor();
    await page.goto(BASE + '/boost'); await page.getByTestId('boost-create').waitFor(); await shot(page, 'n3-boost');
    await page.goto(BASE + '/activity'); await page.waitForTimeout(800); await shot(page, 'n4-activity');
    if (await page.getByTestId('activity-metrics').count()) throw new Error('metrics shown without a profile');
  });

  await step('draft member: completion card points at the next section; Boost asks to publish', '9000000131', async (page) => {
    await page.goto(BASE + '/home'); await page.waitForTimeout(1500); await shot(page, 'd1-home');
    await page.getByTestId('completion-card').waitFor();
    await page.getByTestId('boost-publish-card').waitFor();
    await page.goto(BASE + '/dashboard'); await page.waitForTimeout(800); await shot(page, 'd2-profile');
    await page.getByTestId('open-boost').getByText('Publish your biodata first').waitFor();
  });

  await step('paused member: Boost explains the pause and Resume works from Boost and Home', '9000000001', async (page) => {
    await page.goto(BASE + '/dashboard');
    await page.getByRole('button', { name: 'Pause profile' }).click();
    await page.getByText('Paused', { exact: true }).first().waitFor();
    await page.goto(BASE + '/boost'); await page.getByText('Your profile is paused').waitFor(); await shot(page, 'p1-boost-paused');
    if (await page.getByTestId('boost-cta').count()) throw new Error('can buy a boost while paused');
    if (await page.getByText('Publish your biodata to boost').count()) throw new Error('says "publish" to a published member');
    await page.getByTestId('boost-resume').click();
    await page.getByTestId('boost-cta').waitFor({ timeout: 8000 }); // resumed → options on offer again
    await page.goto(BASE + '/dashboard');
    await page.getByRole('button', { name: 'Pause profile' }).click();
    await page.getByText('Paused', { exact: true }).first().waitFor();
    await page.goto(BASE + '/home'); await page.waitForTimeout(1000); await shot(page, 'p2-home-paused');
    if (await page.getByTestId('boost-publish-card').count()) throw new Error('Home tells a paused member to publish');
    await page.getByTestId('home-status-cta').getByText('Resume profile').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('hr.demo.db')).profiles.find((p) => p.id === 'p_1').status === 'published', null, { timeout: 8000 });
  });

  await step('profile waiting for approval: Boost says so (not "publish")', '9000000130', async (page) => {
    await page.goto(BASE + '/boost'); await page.getByTestId('boost-pending').waitFor(); await shot(page, 'w1-boost-pending');
    await page.goto(BASE + '/dashboard');
    await page.getByTestId('open-boost').getByText('Waiting for approval').waitFor();
  });

  await step('older boost with no recorded start date: My Boost still shows status, expiry and days left', '9000000001', async (page) => {
    await setDb(page, "const p = d.profiles.find((x) => x.id === 'p_1'); p.boostUntil = new Date(Date.now() + 4 * 864e5).toISOString(); delete p.boostStartedAt;");
    await page.goto(BASE + '/boost');
    await page.getByText('Your profile is boosted').waitFor();
    await page.getByTestId('boost-days-left').getByText(/days? left/).waitFor();
    await shot(page, 'b1-legacy-boost');
  });

  await step('double-tapping Continue creates exactly one order', '9000000001', async (page) => {
    await page.goto(BASE + '/boost');
    const cta = page.getByTestId('boost-cta');
    await cta.waitFor();
    // Three taps in the same instant (before React can re-render the loading state).
    await page.evaluate(() => { const b = document.querySelector('[data-testid="boost-cta"]'); b.click(); b.click(); b.click(); });
    await page.getByRole('button', { name: 'Simulate successful payment' }).waitFor();
    await page.waitForTimeout(800);
    const n = (await db(page)).orders.filter((o) => o.kind === 'boost' && o.profileId === 'p_1' && o.status === 'pending').length;
    if (n !== 1) throw new Error(`${n} pending orders`);
    // Closing checkout without paying leaves nothing active and the options still on offer.
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click();
    await page.goto(BASE + '/boost');
    await page.getByTestId('boost-cta').waitFor();
  });

  await step('admin switches off every bride option → brides see "not available"; no Boost card', '9000000000', async (page) => {
    await setDb(page, "d.pricing.boostPlans.forEach((p) => { p.fee.bride = { mode: 'disabled', amount: 0 }; });");
    await page.goto(BASE + '/settings'); await page.getByTestId('logout').click(); await page.getByTestId('cta-find').waitFor();
    await loginWithOtp(page, BASE, '9000000104');
    await page.goto(BASE + '/boost'); await page.waitForTimeout(1000); await shot(page, 'a1-boost-off');
    if (await page.getByTestId('boost-cta').count()) throw new Error('bride can still buy');
    await page.getByText(/Boosting is not available/).waitFor();
    await page.goto(BASE + '/home'); await page.waitForTimeout(1000);
    if (await page.getByTestId('boost-reminder').count()) throw new Error('home still promotes boost');
    await page.goto(BASE + '/dashboard');
    await page.getByTestId('open-boost').getByText('Not available right now').waitFor();
  });

  await step('interest: send → sent; withdraw → can express again; profile stays consistent', '9000000001', async (page) => {
    await page.goto(BASE + '/profile/p_14');
    await page.getByTestId('express-interest').click();
    await page.getByTestId('connect-intro').click();
    await page.getByTestId('preview-request').click();
    await page.getByTestId('confirm-send').click();
    await page.getByTestId('interest-sent').waitFor({ timeout: 3000 });
    const req = (await db(page)).requests.find((r) => r.toProfileId === 'p_14' && r.status === 'pending');
    await page.goto(BASE + '/requests');
    await page.getByRole('radio', { name: 'Sent' }).click();
    await page.getByTestId(`withdraw-${req.id}`).click();
    await page.getByRole('button', { name: /Withdraw/ }).last().click().catch(() => undefined);
    await page.waitForTimeout(800);
    await page.goto(BASE + '/profile/p_14');
    await page.waitForTimeout(1200);
    await shot(page, 'i1-after-withdraw');
    if (await page.getByTestId('interest-sent').count()) throw new Error('still says sent after withdrawing');
  });

  await step('Urdu (RTL): Home cards, Boost options, Profile tab, Activity', '9000000001', async (page) => {
    for (const r of ['home', 'boost', 'dashboard', 'activity', 'requests']) {
      await page.goto(BASE + '/' + r); await page.waitForTimeout(1500); await shot(page, `u-${r}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) throw new Error(`${r} overflows by ${over}px`);
    }
  }, { lang: 'ur' });

  await step('smallest phone (320 px): Boost options and Profile tab fit', '9000000001', async (page) => {
    for (const r of ['home', 'boost', 'dashboard']) {
      await page.goto(BASE + '/' + r); await page.waitForTimeout(1200); await shot(page, `s-${r}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (over > 1) throw new Error(`${r} overflows by ${over}px`);
    }
  }, { width: 320 });

  await browser.close();
  if (errors.length) { console.log('FAILURES:', errors); process.exit(1); }
  console.log('EXPLORE PASSED');
})();
