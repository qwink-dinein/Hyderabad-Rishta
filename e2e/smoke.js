// End-to-end smoke test of the exported web build (Playwright, headless Chromium).
const { chromium } = require('playwright');
const SHOTS = process.argv[2] || require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(`${name}: ${e.message.split('\n')[0]}`); }
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: false });
  const login = async (phone) => {
    await page.goto(BASE + '/login');
    await page.getByTestId('phone-input').fill(phone);
    await page.getByTestId('send-otp').click();
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  };

  await step('landing renders', async () => {
    await page.goto(BASE + '/');
    await page.getByText('Find a rishta with dignity').waitFor({ timeout: 15000 });
    await shot('01-landing');
  });
  await step('switch to Urdu (RTL) instantly', async () => {
    await page.getByRole('radio', { name: 'اردو' }).first().click();
    await page.getByText('وقار، رازداری').waitFor();
    const dir = await page.evaluate(() => document.documentElement.dir);
    if (dir !== 'rtl') throw new Error('dir=' + dir);
    await shot('02-landing-urdu');
  });
  await step('switch to Telugu', async () => {
    await page.getByRole('radio', { name: 'తెలుగు' }).first().click();
    await page.getByText('గౌరవం').first().waitFor();
    await shot('03-landing-telugu');
    await page.getByRole('radio', { name: 'English' }).first().click();
  });
  await step('demo member logs in → home → discover', async () => {
    await login('9000000001');
    await page.waitForURL((u) => u.pathname === '/home', { timeout: 10000 });
    await page.getByText('Featured profiles').waitFor({ timeout: 10000 });
    await page.getByTestId('bell').waitFor();
    await shot('04a-home');
    await page.getByRole('tab', { name: /Discover/ }).first().click();
    await page.getByText(/\d+ profiles/).waitFor({ timeout: 10000 });
    await shot('04-discover');
  });
  await step('open filters, apply age filter', async () => {
    await page.getByTestId('open-filters').click();
    await page.getByTestId('apply-filters').waitFor();
    await shot('05-filters');
    await page.getByRole('switch', { name: /Published in the last 30 days/ }).click();
    await page.getByTestId('apply-filters').click();
    await page.getByText('Published in the last 30 days').first().waitFor();
  });
  await step('open a profile', async () => {
    await page.getByRole('button', { name: /^View profile/ }).first().click();
    await page.getByText('Partner preferences').waitFor();
    await shot('06-profile');
    await page.goBack();
  });
  await step('requests: accept and set consent', async () => {
    await page.goto(BASE + '/requests');
    await page.getByTestId('accept-r_1').click();
    await page.getByText('Share with').first().waitFor();
    await shot('07-requests');
  });
  await step('notifications', async () => {
    await page.goto(BASE + '/notifications');
    await page.getByText('Notifications').first().waitFor();
    await shot('08-notifications');
  });
  await step('dashboard', async () => {
    await page.goto(BASE + '/dashboard');
    await page.getByText('Profile views').waitFor();
    await shot('09-dashboard');
  });
  await step('logout', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await page.getByText('Find a rishta with dignity').waitFor();
  });
  await step('new user → wizard → validation', async () => {
    await login('9123456789');
    await page.getByText('Step 1 of 7').waitFor();
    await page.getByTestId('wizard-next').click();
    await page.getByText('This field is required').first().waitFor();
    await shot('10-wizard-errors');
  });
  await step('admin dashboard', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await login('9000000000');
    await page.getByText('Admin dashboard').waitFor();
    await shot('11-admin');
    await page.goto(BASE + '/admin/pricing');
    await page.getByText('Live copy preview').waitFor();
    await shot('12-admin-pricing');
    await page.goto(BASE + '/admin/announcements');
    await page.getByText('New announcement').waitFor();
    await page.goto(BASE + '/admin/profiles');
    await page.getByRole('radio', { name: 'Pending' }).waitFor();
  });
  await step('non-admin cannot open admin', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await login('9000000001');
    await page.waitForURL((u) => u.pathname === '/home');
    await page.goto(BASE + '/admin');
    await page.getByText(/\d+ profiles/).waitFor();
  });
  await step('desktop width layout', async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(BASE + '/discover');
    await page.getByText(/\d+ profiles/).waitFor();
    await shot('13-discover-desktop');
  });
  await browser.close();
  console.log('\nERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
})();
