// "Back to Home from any screen" E2E: signed-out, member (with guards), new member wizard, admin.
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
  const page = await browser.newPage({ viewport: { width: 375, height: 760 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  const login = (phone) => loginWithOtp(page, BASE, phone);
  const home = () => page.getByTestId('header-home').click();
  const at = (path) => page.waitForURL((u) => u.pathname === path, { timeout: 8000 });

  await step('signed out: Help → Home lands on the landing page', async () => {
    await page.goto(BASE + '/legal/help');
    await home();
    await at('/');
    await page.getByTestId('cta-create').waitFor();
  });
  await step('member: profile → Home', async () => {
    await login('9000000001');
    await page.goto(BASE + '/profile/p_2');
    await page.getByTestId('header-home').waitFor();
    await page.screenshot({ path: `${SHOTS}/60-header-home.png` });
    await home();
    await at('/home');
    await page.getByText('Featured profiles').waitFor();
  });
  await step('member: deep stack (discover → profile → settings) → Home', async () => {
    await page.goto(BASE + '/discover');
    await page.getByRole('button', { name: /^View profile/ }).first().click();
    await page.waitForURL((u) => u.pathname.startsWith('/profile/'));
    await page.goto(BASE + '/settings');
    await home();
    await at('/home');
  });
  await step('connect screen asks before discarding a typed message', async () => {
    await page.goto(BASE + '/request/p_8');
    await page.getByTestId('connect-intro').click();
    await page.getByTestId('interest-message').fill('Assalamu alaikum');
    await home();
    await page.getByText('Leave without sending?').waitFor();
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    if (!(await page.url()).includes('/request/p_8')) throw new Error('left without confirming');
    await home();
    await page.getByRole('button', { name: 'Leave', exact: true }).last().click();
    await at('/home');
  });
  await step('new member: wizard → Home keeps the draft', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await page.getByTestId('cta-find').waitFor();
    await login('9333000123');
    await page.waitForURL((u) => u.pathname === '/biodata');
    await page.getByLabel('Full name').fill('Draft Keeper');
    await home();
    await at('/home');
    await page.getByTestId('home-status-cta').waitFor();
    await page.getByText('Finish your biodata').waitFor();
  });
  await step('admin: any admin screen → admin dashboard', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await page.getByTestId('cta-find').waitFor();
    await login('9000000000');
    await page.goto(BASE + '/admin/audit');
    await home();
    await at('/admin');
    await page.getByText('Admin dashboard').waitFor();
  });
  await browser.close();
  console.log('\nERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
})();
