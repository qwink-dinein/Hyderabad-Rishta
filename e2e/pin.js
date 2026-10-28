// OTP registration + 4-digit PIN login (Mini PRD 2026-10-28), end to end in the browser.
const { chromium } = require('playwright');
const SHOTS = process.argv[2] || require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';
const NUM = '9777700001';
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(name); }
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  const otpCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')).audit.length >= 0 && JSON.parse(localStorage.getItem('hr.demo.db')).otps.length);
  const logout = async () => { await page.goto(BASE + '/settings'); await page.getByTestId('logout').click(); await page.getByTestId('cta-find').waitFor(); };
  const pinEntry = async (pin) => {
    await page.getByTestId('pin-setup-input').fill(pin);
    await page.getByTestId('pin-continue').click();
  };

  await step('registration: OTP, then the PIN screen with the exact message', async () => {
    await page.goto(BASE + '/login?next=biodata');
    await page.getByTestId('phone-input').fill(NUM);
    await page.getByTestId('send-otp').click();
    await page.getByTestId('otp-sent').waitFor(); // OTP-sent state
    await page.screenshot({ path: `${SHOTS}/a1-otp-sent.png` });
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await page.waitForURL((u) => u.pathname.startsWith('/pin'));
    await page.getByText("Create a 4-digit PIN for quick and easy login next time. You won't need an OTP every time.").waitFor();
    await page.screenshot({ path: `${SHOTS}/a2-pin-create.png` });
  });
  await step('weak PIN refused, mismatched confirmation refused', async () => {
    await pinEntry('1234');
    await page.getByText('too easy to guess', { exact: false }).waitFor();
    await pinEntry('4827');
    await page.getByText('Confirm your PIN').waitFor();
    await page.screenshot({ path: `${SHOTS}/a3-pin-confirm.png` });
    await pinEntry('4828');
    await page.getByText("The PINs don't match", { exact: false }).waitFor();
  });
  await step('PIN saved → straight to biodata creation, still logged in', async () => {
    await pinEntry('4827');
    await pinEntry('4827');
    await page.waitForURL((u) => u.pathname.startsWith('/biodata'), { timeout: 10000 });
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));
    if (JSON.stringify(db.pins).includes('"4827"')) throw new Error('PIN stored in plain text');
  });
  await step('app restart keeps the session (no OTP, no PIN)', async () => {
    await page.reload();
    await page.goto(BASE + '/settings');
    await page.getByText('PIN login is on', { exact: false }).waitFor();
  });
  await step('after logout, login shows the number prefilled + PIN cells + Forgot PIN', async () => {
    await logout();
    await page.goto(BASE + '/login');
    await page.getByTestId('pin-input').waitFor();
    const shown = await page.getByTestId('pin-number').innerText();
    if (!shown.includes('97777 00001')) throw new Error(`number shown: ${shown}`);
    await page.getByTestId('forgot-pin').waitFor();
    await page.screenshot({ path: `${SHOTS}/a4-pin-login.png` });
  });
  await step('wrong PIN: clear error with attempts left', async () => {
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-login').click();
    await page.getByText('Incorrect PIN. 4 attempts left.').waitFor();
    await page.screenshot({ path: `${SHOTS}/a5-pin-wrong.png` });
  });
  await step('correct PIN (pasted with a space) logs in — no OTP sent', async () => {
    const before = await otpCount();
    await page.getByTestId('pin-input').fill('48 27');
    await page.getByTestId('pin-login').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
    if ((await otpCount()) !== before) throw new Error('an OTP was sent during PIN login');
  });
  await step('Forgot PIN: OTP to the registered number, new PIN, logged in', async () => {
    await logout();
    await page.goto(BASE + '/login');
    await page.getByTestId('forgot-pin').click();
    await page.getByText('Reset your PIN').waitFor();
    await page.getByTestId('send-otp').click();
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await page.waitForURL((u) => u.pathname.startsWith('/pin'));
    await page.getByText('Create a new PIN').waitFor();
    await pinEntry('5931');
    await pinEntry('5931');
    await page.getByText('PIN reset', { exact: false }).waitFor();
    await page.screenshot({ path: `${SHOTS}/a6-pin-reset.png` });
  });
  await step('old PIN no longer works, new PIN does', async () => {
    await logout();
    await page.goto(BASE + '/login');
    await page.getByTestId('pin-input').fill('4827');
    await page.getByTestId('pin-login').click();
    await page.getByText('Incorrect PIN', { exact: false }).waitFor();
    await page.getByTestId('pin-input').fill('5931');
    await page.getByTestId('pin-login').click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  });
  await step('change PIN from Settings with the current PIN', async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('pin-settings-action').click();
    await page.getByText('Enter your current PIN').waitFor();
    await pinEntry('5931');
    await pinEntry('7140');
    await pinEntry('7140');
    await page.getByText('PIN changed', { exact: false }).waitFor();
  });
  await step('5 wrong PINs lock the account temporarily (server-side)', async () => {
    await logout();
    await page.goto(BASE + '/login');
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('pin-input').fill('0000');
      await page.getByTestId('pin-login').click();
      await page.waitForTimeout(400);
    }
    await page.getByText('Too many wrong PINs', { exact: false }).waitFor();
    await page.screenshot({ path: `${SHOTS}/a7-pin-locked.png` });
    await page.reload(); // a restart does not reset the counter
    await page.getByTestId('pin-input').fill('7140');
    await page.getByTestId('pin-login').click();
    await page.getByText('Too many wrong PINs', { exact: false }).waitFor();
  });
  await step('existing account from before PINs: OTP, then asked to set a PIN, data intact', async () => {
    await page.getByTestId('other-number').click();
    await page.getByTestId('phone-input').fill('9000000001');
    await page.getByTestId('send-otp').click();
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await page.waitForURL((u) => u.pathname.startsWith('/pin'));
    await pinEntry('3816');
    await pinEntry('3816');
    await page.waitForURL((u) => u.pathname.startsWith('/home'), { timeout: 10000 }); // not forced into biodata again
  });

  await browser.close();
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (real.length) { console.log('FAILURES:', real); process.exit(1); }
  console.log('PIN E2E PASSED');
})();
