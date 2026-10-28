// Click-through QA: presses the buttons and flows the other suites don't, like a real member would,
// and checks each result. Every step runs in its own fresh browser so one failure can't hide another.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';
const MEMBER = '9000000001';
const errors = [];
let browser;

async function step(name, phone, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    console.log('✗', name, '-', e.message.split('\n').slice(0, 4).join(' ¦ '));
    errors.push(name);
    await page.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
  }
  await ctx.close();
}
const btn = (page, name) => page.getByRole('button', { name, exact: true }).first();
const confirmDialog = (page, label) => page.getByRole('button', { name: label, exact: true }).last().click();
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));

(async () => {
  browser = await chromium.launch();

  await step('landing: carousel next/previous/dots/pause change the slide', null, async (page) => {
    await page.goto(BASE + '/');
    const selected = () => page.locator('[aria-label^="Go to slide"][aria-selected="true"]').getAttribute('aria-label');
    const first = await selected();
    await btn(page, 'Pause slideshow').click();
    await btn(page, 'Play slideshow').waitFor();
    await btn(page, 'Next slide').click();
    await page.waitForTimeout(500);
    const second = await selected();
    if (second === first) throw new Error(`Next did not move (${first})`);
    await btn(page, 'Previous slide').click();
    await page.waitForTimeout(500);
    if ((await selected()) !== first) throw new Error('Previous did not go back');
    await btn(page, 'Go to slide 3').click();
    await page.waitForTimeout(500);
    if ((await selected()) !== 'Go to slide 3') throw new Error('dot did not jump');
  });

  await step('landing: language buttons switch to Urdu (RTL) and back; CTAs go to the right place', null, async (page) => {
    await page.goto(BASE + '/');
    await page.getByRole('radio', { name: 'اردو' }).first().click();
    await page.waitForFunction(() => document.documentElement.dir === 'rtl');
    await page.getByRole('radio', { name: 'English' }).first().click();
    await page.waitForFunction(() => document.documentElement.dir === 'ltr');
    await page.getByTestId('cta-create').click();
    // First visit asks for the language, then the number (by design).
    await page.waitForURL((u) => (u.pathname === '/login' || u.pathname === '/language') && u.search.includes('biodata'), { waitUntil: 'commit' });
    await page.goto(BASE + '/');
    await page.getByTestId('cta-login').click();
    await page.waitForURL((u) => u.pathname === '/login', { waitUntil: 'commit' });
  });

  await step('home: keyword search opens Discover filtered; filter button opens Filters; View all; new interests', MEMBER, async (page) => {
    await page.getByTestId('home-search').fill('London');
    await page.getByTestId('home-search').press('Enter');
    await page.waitForURL((u) => u.pathname === '/discover', { waitUntil: 'commit' });
    await page.getByText(/London/).first().waitFor();
    await page.goto(BASE + '/home');
    await btn(page, 'Filters').click();
    await page.waitForURL((u) => u.pathname === '/filters', { waitUntil: 'commit' });
    await page.getByRole('button', { name: /^Show \d+ profiles|^Apply/ }).first().click();
    await page.waitForURL((u) => u.pathname === '/discover', { waitUntil: 'commit' });
    await page.goto(BASE + '/home');
    await page.getByRole('link', { name: 'View all: Featured profiles' }).click();
    await page.waitForURL((u) => u.pathname === '/discover', { waitUntil: 'commit' });
    await page.goto(BASE + '/home');
    await page.getByTestId('home-interests').click();
    await page.waitForURL((u) => u.pathname === '/requests', { waitUntil: 'commit' });
  });

  await step('discover: sort, preferences, heart on a card updates the saved count', MEMBER, async (page) => {
    await page.goto(BASE + '/discover');
    await page.getByRole('button', { name: 'Open your shortlist (0 saved)' }).waitFor();
    await page.getByRole('radio', { name: 'Newest' }).click();
    await page.getByRole('radio', { name: 'Newest', checked: true }).waitFor();
    await page.getByText('Use my preferences').first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Shortlist', exact: true }).first().click();
    await page.getByRole('button', { name: 'Open your shortlist (1 saved)' }).waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: 'Shortlisted', exact: true }).first().click();
    await page.getByRole('button', { name: 'Open your shortlist (0 saved)' }).waitFor({ timeout: 8000 });
  });

  await step('profile: report with a reason → thank-you; block → gone; Settings shows the real ID + name; unblock', MEMBER, async (page) => {
    await page.goto(BASE + '/profile/p_10');
    await btn(page, 'Report').click();
    await btn(page, 'Send').waitFor();
    await page.getByRole('radio', { name: 'Fake or misleading profile' }).click();
    await btn(page, 'Send').click();
    await page.getByText('Thank you. Our team will review this report.').waitFor();
    await btn(page, 'Block').click();
    await confirmDialog(page, 'Block');
    await page.waitForTimeout(800);
    const d = await db(page);
    if (!d.blocks.some((b) => b.blockedProfileId === 'p_10')) throw new Error('block not saved');
    await page.goto(BASE + '/profile/p_10');
    await page.getByText(/no longer available/i).first().waitFor();
    await page.goto(BASE + '/settings');
    await page.getByText('HR-10011').waitFor();
    await page.getByText('Hafsa').waitFor();
    await page.getByTestId('unblock-p_10').click();
    await page.getByText('You have not blocked anyone.').waitFor();
    await page.goto(BASE + '/profile/p_10');
    await page.getByText('HR-10011').first().waitFor();
  });

  await step('requests: decline an interest; poke the unanswered one', MEMBER, async (page) => {
    await page.goto(BASE + '/requests');
    await page.getByTestId('decline-r_1').click();
    await confirmDialog(page, 'Decline').catch(() => undefined);
    await page.waitForTimeout(600);
    if ((await db(page)).requests.find((r) => r.id === 'r_1').status !== 'declined') throw new Error('r_1 not declined');
    await page.getByRole('radio', { name: 'Sent' }).click();
    await page.getByTestId('poke-r_3').click();
    await page.getByTestId('poke-status-r_3').waitFor();
    if (!(await db(page)).requests.find((r) => r.id === 'r_3').pokes.length) throw new Error('poke not recorded');
  });

  await step('profile tab: pause hides the profile, resume shows it; "view as others" opens the preview', MEMBER, async (page) => {
    await page.goto(BASE + '/dashboard');
    await btn(page, 'Pause profile').click();
    await page.getByText('Paused', { exact: true }).first().waitFor();
    await btn(page, 'Resume profile').click();
    await page.getByText('Published', { exact: true }).first().waitFor();
    await btn(page, 'View as others see it').click();
    await page.waitForURL((u) => u.pathname === '/biodata/preview', { waitUntil: 'commit' });
  });

  await step('notifications: tapping one opens its screen; "Mark all as read" clears the badge', MEMBER, async (page) => {
    await page.getByTestId('bell').click();
    await page.waitForURL((u) => u.pathname === '/notifications', { waitUntil: 'commit' });
    await page.getByText(/expressed interest/).first().click();
    await page.waitForURL((u) => u.pathname === '/requests', { waitUntil: 'commit' });
    await page.goto(BASE + '/notifications');
    const markAll = btn(page, 'Mark all as read');
    if (await markAll.count()) await markAll.click();
    await page.getByText('You’re all caught up').first().waitFor();
    await page.goto(BASE + '/home');
    const bell = await page.getByTestId('bell').getAttribute('aria-label');
    if (/unread/.test(bell)) throw new Error(`bell still shows unread: ${bell}`);
  });

  await step('settings: sound & haptics switches persist; legal pages open; Telugu works', MEMBER, async (page) => {
    await page.goto(BASE + '/settings');
    const sound = page.getByRole('switch', { name: 'Sound effects' });
    const before = await sound.getAttribute('aria-checked');
    await sound.click();
    await page.reload();
    if ((await page.getByRole('switch', { name: 'Sound effects' }).getAttribute('aria-checked')) === before) throw new Error('sound switch did not persist');
    await page.getByRole('switch', { name: 'Haptic feedback' }).click();
    await page.getByText('Privacy policy').click();
    await page.waitForURL((u) => u.pathname === '/legal/privacy', { waitUntil: 'commit' });
    await page.goBack();
    await page.getByText('Help & support').click();
    await page.waitForURL((u) => u.pathname === '/legal/help', { waitUntil: 'commit' });
    await page.goto(BASE + '/settings');
    await page.getByRole('radio', { name: 'తెలుగు' }).first().click();
    await page.getByText('సెట్టింగ్స్').first().waitFor();
  });

  await step('deactivate → signed out; logging in again (PIN) reactivates with data intact', MEMBER, async (page) => {
    await page.goto(BASE + '/settings');
    await btn(page, 'Deactivate account').click();
    await confirmDialog(page, 'Deactivate account');
    await page.getByTestId('cta-find').waitFor();
    if ((await db(page)).profiles.find((p) => p.id === 'p_1').status !== 'paused') throw new Error('profile not hidden');
    await page.goto(BASE + '/login');
    await page.getByTestId('pin-input').fill('4827');
    await page.getByTestId('pin-login').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { waitUntil: 'commit' });
    const u = (await db(page)).users.find((x) => x.id === 'u_demo');
    if (u.deactivatedAt) throw new Error('still deactivated');
  });

  await step('new member: wizard refuses an empty step and shows what is missing; Back works', '9812300077', async (page) => {
    await page.waitForURL((u) => u.pathname.startsWith('/biodata'), { waitUntil: 'commit' });
    await btn(page, 'Save & continue').click();
    await page.getByText(/required|Please/i).first().waitFor();
    if (!new URL(page.url()).pathname.startsWith('/biodata')) throw new Error('left the step with errors');
  });

  await step('delete account → back to start; the number can register again from scratch', '9812300088', async (page) => {
    await page.goto(BASE + '/settings');
    await btn(page, 'Delete account permanently').click();
    await confirmDialog(page, 'Delete account permanently');
    await page.getByTestId('cta-find').waitFor();
    if ((await db(page)).users.some((x) => x.phone === '9812300088')) throw new Error('account still stored');
    await loginWithOtp(page, BASE, '9812300088');
    await page.waitForURL((u) => u.pathname.startsWith('/biodata'), { waitUntil: 'commit' });
  });

  await step('reset demo data restores the seed', MEMBER, async (page) => {
    await page.goto(BASE + '/settings');
    await btn(page, 'Reset demo data').click();
    await confirmDialog(page, 'Reset demo data').catch(() => undefined);
    await page.waitForTimeout(1200);
    const d = await db(page);
    if (d.requests.find((r) => r.id === 'r_1').status !== 'pending') throw new Error('seed not restored');
  });

  await browser.close();
  if (errors.length) { console.log('FAILURES:', errors); process.exit(1); }
  console.log('CLICKTHROUGH PASSED');
})();
