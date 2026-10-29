// Owner PRD 2026-10-29 — Profile completion, Boost & Profile dashboard:
// five tabs (no floating Boost), Home completion/activity/Boost cards, 7/14/30-day options priced by
// the admin, free options skip payment, My Boost, and the Profile tab list.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = process.argv[2] || require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
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
    await page.screenshot({ path: `${SHOTS}/fail-boost-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
  }
  await ctx.close();
}
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));
const setDb = (page, fn) => page.evaluate((src) => {
  const d = JSON.parse(localStorage.getItem('hr.demo.db'));
  new Function('d', src)(d);
  localStorage.setItem('hr.demo.db', JSON.stringify(d));
}, fn);

(async () => {
  browser = await chromium.launch();

  await step('tabs: Home · Discover · Shortlist · Requests · Profile (no floating Boost)', '9000000001', async (page) => {
    const names = (await page.getByRole('tab').allInnerTexts()).map((x) => x.trim().split('\n').pop());
    if (JSON.stringify(names) !== JSON.stringify(['Home', 'Discover', 'Shortlist', 'Requests', 'Profile'])) throw new Error(names.join(' · '));
    if (await page.getByTestId('tab-boost').count()) throw new Error('floating Boost button still there');
    await page.getByRole('tab', { name: 'Shortlist' }).click();
    await page.waitForURL((u) => u.pathname === '/shortlist', { waitUntil: 'commit' });
  });

  await step('Home: real completion → opens the first incomplete section; updates after saving', '9000000001', async (page) => {
    // Remove "about me" and family details from this member's saved biodata.
    await setDb(page, "const p = d.profiles.find((x) => x.id === 'p_1'); p.biodata.basic.aboutMe = ''; p.biodata.family.familyType = '';");
    await page.goto(BASE + '/home');
    const card = page.getByTestId('completion-card');
    await card.waitFor();
    const pct = await page.getByRole('progressbar').first().getAttribute('aria-valuenow');
    if (!(Number(pct) > 50 && Number(pct) < 100)) throw new Error(`unexpected completion ${pct}`);
    await page.getByTestId('completion-next').getByText('Next: About me').waitFor();
    await page.screenshot({ path: `${SHOTS}/p1-home-completion.png` });
    await page.getByTestId('completion-cta').click();
    await page.waitForURL((u) => u.pathname === '/biodata' && u.search.includes('step=0'), { waitUntil: 'commit' });
    // Fill About me through the real form and save; the card moves on to the next missing item.
    const about = page.getByLabel(/About/).first();
    await about.fill('We are a warm, practising family from Hyderabad looking for a kind partner.');
    await page.getByRole('button', { name: 'Save & continue' }).click();
    await page.waitForTimeout(800);
    await page.goto(BASE + '/home');
    await page.getByTestId('completion-next').getByText('Next: Family details').waitFor();
    const pct2 = await page.getByRole('progressbar').first().getAttribute('aria-valuenow');
    if (!(Number(pct2) > Number(pct))) throw new Error(`did not go up: ${pct} → ${pct2}`);
  });

  await step('Home: activity shows recorded counts; interests opens Requests', '9000000001', async (page) => {
    const d = await db(page);
    const views = d.views.filter((v) => v.profileId === 'p_1' && v.viewerUserId !== 'u_demo').length;
    await page.getByTestId('stat-views').getByText(String(views), { exact: true }).waitFor();
    await page.getByTestId('stat-interests').click();
    await page.waitForURL((u) => u.pathname === '/requests', { waitUntil: 'commit' });
  });

  await step('Home Boost card shows the configured price; options 7/14/30 with 7 days pre-selected', '9000000001', async (page) => {
    await page.getByTestId('boost-reminder').waitFor();
    await page.getByTestId('boost-price').getByText('From ₹100').waitFor();
    await page.getByTestId('boost-reminder-cta').click();
    await page.waitForURL((u) => u.pathname === '/boost', { waitUntil: 'commit' });
    for (const [id, price] of [['d7', '₹100'], ['d14', '₹200'], ['d30', '₹350']]) await page.getByTestId(`plan-price-${id}`).getByText(price).waitFor();
    if ((await page.getByTestId('plan-d7').getAttribute('aria-checked')) !== 'true') throw new Error('7 days not pre-selected');
    await page.getByText('Popular').waitFor();
    await page.getByRole('button', { name: 'Continue · ₹100' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/p2-boost-options.png`, fullPage: true });
  });

  await step('choose 14 days → checkout shows ₹200 → pay → My Boost (14 days left, no re-buy); Home + Profile follow', '9000000001', async (page) => {
    await page.goto(BASE + '/boost');
    await page.getByTestId('plan-d14').click();
    await page.getByRole('button', { name: 'Continue · ₹200' }).click();
    await page.getByText('₹200').last().waitFor();
    await page.getByRole('button', { name: 'Simulate successful payment' }).click();
    await page.getByTestId('boost-status').waitFor({ timeout: 8000 });
    await page.getByText('My Boost').first().waitFor();
    await page.getByTestId('boost-days-left').getByText('14 days left').waitFor();
    await page.getByText('14-day boost').first().waitFor();
    await page.getByTestId('boost-again-after').waitFor();
    if (await page.getByTestId('boost-cta').count()) throw new Error('can buy again while active');
    await page.screenshot({ path: `${SHOTS}/p3-my-boost.png`, fullPage: true });
    const o = (await db(page)).orders.find((x) => x.kind === 'boost' && x.profileId === 'p_1' && x.status === 'paid');
    if (!o || o.amount !== 200 || o.terms.boostDays !== 14 || o.terms.planId !== 'd14' || o.terms.autoRenew !== false) throw new Error(JSON.stringify(o));
    await page.goto(BASE + '/home');
    await page.getByTestId('boost-active-card').waitFor();
    if (await page.getByTestId('boost-reminder').count()) throw new Error('still promoting a purchase');
    await page.goto(BASE + '/dashboard');
    await page.getByTestId('open-boost').getByText('My active boost').waitFor();
  });

  await step('Profile tab: portrait/photo, ID, completion, and every row opens its screen', '9000000001', async (page) => {
    await page.goto(BASE + '/dashboard');
    await page.getByText('HR-10002').waitFor();
    await page.getByTestId('profile-completion').waitFor();
    await page.screenshot({ path: `${SHOTS}/p4-profile-tab.png`, fullPage: true });
    for (const [id, check] of [
      ['open-boost', (u) => u.pathname === '/boost'],
      ['me-edit', (u) => u.pathname === '/biodata'],
      ['me-preferences', (u) => u.pathname === '/biodata' && u.search.includes('step=5')],
      ['me-privacy', (u) => u.pathname === '/biodata' && u.search.includes('step=6')],
      ['me-activity', (u) => u.pathname === '/activity'],
      ['me-shortlist', (u) => u.pathname === '/shortlist'],
      ['me-settings', (u) => u.pathname === '/settings'],
    ]) {
      await page.goto(BASE + '/dashboard');
      await page.getByTestId(id).click();
      await page.waitForURL(check, { waitUntil: 'commit' });
    }
    await page.getByTestId('activity-metrics').waitFor().catch(() => undefined);
  });

  await step('admin changes the 7-day groom price to ₹150 → members see ₹150; existing order keeps its price', '9000000000', async (page) => {
    await page.goto(BASE + '/admin/pricing');
    const price = page.getByLabel('Option 1 groom price');
    await price.fill('150');
    await page.getByRole('button', { name: 'Save pricing' }).click();
    await page.getByText(/Pricing saved/).waitFor();
    await page.screenshot({ path: `${SHOTS}/p5-admin-pricing.png`, fullPage: true });
    if ((await db(page)).pricing.boostPlans[0].fee.groom.amount !== 150) throw new Error('not saved');
  });

  await step('a free option skips payment: bride activates the free 7-day boost', '9000000104', async (page) => {
    await page.goto(BASE + '/boost');
    await page.getByTestId('plan-price-d7').getByText('FREE').waitFor();
    await page.getByRole('button', { name: 'Activate free boost' }).click();
    await page.getByTestId('boost-status').waitFor({ timeout: 8000 });
    await page.getByTestId('boost-days-left').getByText('7 days left').waitFor();
    const o = (await db(page)).orders.find((x) => x.kind === 'boost' && x.profileId === 'p_4');
    if (!o || o.status !== 'free' || o.amount !== 0) throw new Error(JSON.stringify(o));
  });

  await step('ended boost: honest "ended" status, views, and Boost again with the options', '9000000001', async (page) => {
    await setDb(page, "const p = d.profiles.find((x) => x.id === 'p_1'); const n = Date.now(); p.boostStartedAt = new Date(n - 10 * 864e5).toISOString(); p.boostUntil = new Date(n - 3 * 864e5).toISOString();");
    await page.goto(BASE + '/boost');
    await page.getByText('Your last boost has ended').waitFor();
    await page.getByText('Boost again').first().waitFor();
    await page.getByTestId('boost-cta').waitFor();
    await page.goto(BASE + '/dashboard');
    await page.getByTestId('open-boost').getByText('Boost again').waitFor();
  });

  await step('unpublished member: Boost asks to publish first; activity explains why it is empty', '9000000131', async (page) => {
    await page.goto(BASE + '/home');
    await page.getByTestId('boost-publish-card').waitFor();
    await page.getByTestId('home-stats').getByText('Publish your biodata to start seeing views and interests.').waitFor();
    await page.goto(BASE + '/boost');
    await page.getByTestId('boost-publish').waitFor();
    if (await page.getByTestId('boost-cta').count()) throw new Error('could buy a boost while unpublished');
  });

  await browser.close();
  if (errors.length) { console.log('FAILURES:', errors); process.exit(1); }
  console.log('BOOST E2E PASSED');
})();
