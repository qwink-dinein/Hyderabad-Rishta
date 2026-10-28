// One mobile number = one biodata (owner request 2026-10-28). In the browser:
//  - the same number typed with a leading 0 opens the SAME account and biodata;
//  - a member whose biodata the team removed sees a clear notice instead of a blank wizard.
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
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  const login = (phone) => loginWithOtp(page, BASE, phone);
  const logout = async () => { await page.goto(BASE + '/settings'); await page.getByTestId('logout').click(); await page.getByTestId('cta-find').waitFor(); };

  await step('a leading 0 opens the same account and its existing draft (Kashif, HR-10032)', async () => {
    await login('09000000131');
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));
    if (db.sessionUserId !== 'u_31') throw new Error(`signed in as ${db.sessionUserId}, expected u_31`);
    if (db.users.filter((u) => u.phone.endsWith('9000000131')).length !== 1) throw new Error('a second account was created');
    await page.goto(BASE + '/biodata?step=0');
    await page.waitForFunction(() => [...document.querySelectorAll('input')].some((i) => i.value === 'Kashif Hashmi'), null, { timeout: 10000 });
    await logout();
  });

  await step('after the team removes the biodata, the member sees a notice — no second biodata', async () => {
    // Simulate the admin removal directly in the demo store, then reload so the app re-reads it.
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('hr.demo.db'));
      const at = new Date().toISOString();
      db.profiles.find((p) => p.id === 'p_31').deletedAt = at;
      db.users.find((u) => u.id === 'u_31').profileRemovedAt = at;
      localStorage.setItem('hr.demo.db', JSON.stringify(db));
    });
    await page.reload();
    await login('9000000131');
    await page.goto(BASE + '/biodata');
    await page.getByText('Biodata removed').waitFor({ timeout: 10000 });
    await page.getByText('Each number can have only one biodata', { exact: false }).waitFor();
    await page.screenshot({ path: `${SHOTS}/95-biodata-removed.png` });
    await page.getByTestId('removed-settings').click();
    await page.waitForURL((u) => u.pathname.startsWith('/settings'));
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')).profiles.filter((p) => p.userId === 'u_31').length);
    if (count !== 1) throw new Error(`u_31 has ${count} biodata records`);
  });

  await browser.close();
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (real.length) { console.log('FAILURES:', real); process.exit(1); }
  console.log('ONE-BIODATA E2E PASSED');
})();
