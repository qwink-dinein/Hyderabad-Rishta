// Relation badges on cards + admin console E2E: profile IDs, bell alerts, search → member page → action.
const { chromium } = require('playwright');
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
  const login = async (phone) => {
    await page.goto(BASE + '/login');
    await page.getByTestId('phone-input').fill(phone);
    await page.getByTestId('send-otp').click();
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  };
  const logout = async () => { await page.goto(BASE + '/settings'); await page.getByRole('button', { name: 'Log out' }).first().click(); await page.waitForTimeout(500); };

  await step('cards show history badges (interest sent / sent you interest / connected)', async () => {
    await login('9000000001');
    await page.goto(BASE + '/discover');
    await page.getByTestId('featured-strip').waitFor({ timeout: 10000 }).catch(() => undefined);
    // Cards render lazily as you scroll (virtualised list) — scroll like a user until it appears.
    for (let i = 0; i < 12 && !(await page.getByTestId('relation-p_6').count()); i++) {
      await page.mouse.move(200, 600);
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(300);
    }
    await page.getByTestId('relation-p_6').waitFor();
    await page.getByTestId('relation-p_6').getByText('Interest sent').waitFor();
    await page.getByTestId('relation-p_0').getByText('Sent you interest').waitFor();
    await page.screenshot({ path: `${SHOTS}/40-relation-badges.png` });
  });
  await step('profile shows its ID (HR-…)', async () => {
    await page.goto(BASE + '/profile/p_2');
    await page.getByText('HR-10003').first().waitFor();
  });
  await step('member reports a profile', async () => {
    await page.goto(BASE + '/profile/p_2?report=1');
    await page.getByRole('radio', { name: 'Harassment' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForTimeout(600);
    await logout();
  });
  await step('admin bell shows the report alert', async () => {
    await login('9000000000');
    await page.goto(BASE + '/admin');
    await page.getByTestId('admin-bell').waitFor();
    await page.getByRole('button', { name: /Alerts, \d+ unread/ }).waitFor();
    await page.screenshot({ path: `${SHOTS}/41-admin-bell.png` });
    await page.getByTestId('admin-bell').click();
    await page.getByText('Profile HR-10003 was reported (harassment)').waitFor();
    await page.screenshot({ path: `${SHOTS}/42-admin-alerts.png` });
    await page.getByTestId('alert-report').click();
    await page.waitForURL((u) => u.pathname === '/admin/reports');
    await page.getByTestId('code-HR-10003').first().waitFor();
  });
  await step('search from the dashboard by profile ID → member page → pause', async () => {
    await page.goto(BASE + '/admin');
    await page.getByTestId('admin-home-search').fill('HR-10003');
    await page.getByTestId('admin-home-search').press('Enter');
    await page.getByTestId('result-HR-10003').click();
    await page.waitForURL((u) => u.pathname.startsWith('/admin/member/'));
    await page.getByText('Profile ID HR-10003').waitFor();
    await page.getByText('Reports about this member (1)').waitFor();
    await page.screenshot({ path: `${SHOTS}/43-admin-member.png`, fullPage: true });
    await page.getByTestId('member-pause').click();
    await page.getByText('Profile paused.').waitFor();
  });
  await step('search by phone digits is masked', async () => {
    await page.goto(BASE + '/admin/search');
    await page.getByTestId('admin-search-input').fill('9000000102');
    await page.getByTestId('admin-search-go').click();
    await page.getByTestId('result-HR-10003').waitFor();
    const txt = await page.getByTestId('result-HR-10003').innerText();
    if (txt.includes('9000000102') || !txt.includes('0102')) throw new Error('number not masked: ' + txt);
    await page.screenshot({ path: `${SHOTS}/44-admin-search.png` });
  });
  await browser.close();
  console.log('\nERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
})();
