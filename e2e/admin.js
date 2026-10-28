// Admin governance E2E: approval toggle, delete → Trash → restore, team, recovery codes, backup phone,
// lost-phone recovery through the login screen, sub-admin limits.
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
  const confirmDialog = (label) => page.getByRole('button', { name: label, exact: true }).last().click();
  const logoutAdmin = async () => { await page.goto(BASE + '/admin'); await page.getByRole('button', { name: 'Log out' }).click(); await page.getByTestId('cta-find').waitFor(); };
  let codes = [];

  await step('master sees dashboard with approval toggle + recovery warning', async () => {
    await login('9000000000');
    await page.getByText('Master admin').first().waitFor();
    await page.getByText('Protect the master account').waitFor();
    await page.screenshot({ path: `${SHOTS}/30-admin-home.png` });
  });
  await step('one-click approval toggle ON then OFF (+ approve waiting)', async () => {
    await page.getByTestId('approval-toggle').click();
    await page.getByText('ON — every new profile waits').waitFor();
    await page.getByTestId('approval-toggle').click();
    await page.getByText('OFF — profiles are published directly').waitFor();
    await confirmDialog('Approve all');
    await page.getByText(/profile\(s\) approved and published/).waitFor();
  });
  await step('delete a profile → Trash → restore', async () => {
    await page.goto(BASE + '/admin/profiles');
    await page.getByRole('radio', { name: 'Published' }).click();
    await page.getByRole('button', { name: 'Review & more' }).first().click();
    await page.getByRole('button', { name: 'Delete profile' }).first().click();
    await confirmDialog('Delete');
    await page.getByText('Profile moved to Trash.').waitFor();
    await page.goto(BASE + '/admin/trash');
    await page.getByRole('button', { name: 'Restore' }).first().click();
    await page.getByText('Restored.').waitFor();
  });
  await step('add a sub-admin', async () => {
    await page.goto(BASE + '/admin/team');
    await page.getByTestId('subadmin-phone').fill('9123400000');
    await page.getByTestId('add-subadmin').click();
    await page.getByText('Sub-admin added.').waitFor();
  });
  await step('generate recovery codes (step-up OTP)', async () => {
    await page.getByTestId('generate-codes').click();
    await page.getByTestId('stepup-otp').fill('123456');
    await page.getByTestId('stepup-confirm').click();
    await page.getByTestId('recovery-codes').waitFor();
    codes = (await page.getByTestId('recovery-codes').innerText()).split(/\s+/).filter((c) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c));
    if (codes.length !== 10) throw new Error('codes: ' + codes.length);
    await page.screenshot({ path: `${SHOTS}/31-recovery-codes.png`, fullPage: true });
    await page.getByRole('button', { name: "I've saved them" }).click();
  });
  await step('verify a backup phone', async () => {
    await page.getByTestId('backup-phone').fill('9888800000');
    await page.getByTestId('backup-send').click();
    await page.getByTestId('backup-otp').fill('123456');
    await page.getByTestId('backup-verify').click();
    await page.getByText('Backup phone verified.').waitFor();
    await page.getByText('verified', { exact: true }).waitFor({ timeout: 5000 }); // status badge refreshed
    await page.screenshot({ path: `${SHOTS}/32-team.png`, fullPage: true });
  });
  await step('sub-admin: can moderate, cannot manage team', async () => {
    await logoutAdmin();
    await login('9000000009');
    await page.getByText('Sub-admin').first().waitFor();
    await page.goto(BASE + '/admin/team');
    await page.getByText('You are a sub-admin').waitFor();
    if (await page.getByTestId('add-subadmin').count()) throw new Error('sub-admin sees add button');
    await page.goto(BASE + '/admin/trash');
    await page.getByText('Only the master admin can restore').waitFor();
  });
  await step('lost phone: recover master from backup phone via login screen', async () => {
    await logoutAdmin();
    await page.goto(BASE + '/login');
    await page.getByRole('button', { name: 'Master admin: lost your phone?' }).click();
    await page.getByTestId('recover-phone').fill('9888800000');
    await page.getByTestId('recover-send').click();
    await page.getByTestId('recover-otp').fill('123456');
    await page.getByTestId('recover-code').fill(codes[0]);
    await page.getByTestId('recover-submit').click();
    await page.getByText('Recovery complete').waitFor();
    await page.screenshot({ path: `${SHOTS}/33-recovered.png` });
    await login('9888800000');
    await page.getByText('Master admin').first().waitFor();
  });
  await step('old master phone is no longer an admin', async () => {
    await logoutAdmin();
    await login('9000000000');
    await page.goto(BASE + '/admin');
    await page.waitForURL((u) => !u.pathname.startsWith('/admin'), { timeout: 10000 });
  });
  await browser.close();
  console.log('\nERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
})();
