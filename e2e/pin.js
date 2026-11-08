// OTP registration + 4-digit PIN login (Mini PRD 2026-10-28), end to end in the browser.
const { chromium } = require('playwright');
const SHOTS = process.argv[2] || require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';
const NUM = '9777700001';
const errors = [];
let pageRef;
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(name); await pageRef?.screenshot({ path: `${SHOTS}/fail-pin-${name.replace(/\W+/g, '_').slice(0, 30)}.png` }).catch(() => {}); }
};
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  pageRef = page;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  const otpCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')).audit.length >= 0 && JSON.parse(localStorage.getItem('hr.demo.db')).otps.length);
  // Logging out lands on the welcome screen; members then open the login card.
  const logout = async () => { await page.goto(BASE + '/settings'); await page.getByTestId('logout').click(); await page.getByTestId('welcome-member-login').click(); await page.getByTestId('pin-input').waitFor(); };
  const typeNumber = async (n = NUM) => { await page.getByTestId('login-phone').fill(n); };
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
  await step('PIN saved → straight into the guided biodata (onboarding), still logged in', async () => {
    await pinEntry('4827');
    await pinEntry('4827');
    await page.waitForURL((u) => u.pathname.startsWith('/start/'), { timeout: 10000 });
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));
    if (JSON.stringify(db.pins).includes('"4827"')) throw new Error('PIN stored in plain text');
  });
  await step('app restart keeps the session (no OTP, no PIN)', async () => {
    await page.reload();
    await page.goto(BASE + '/settings');
    await page.getByText('PIN login is on', { exact: false }).waitFor();
  });
  await step('after logout: welcome screen → member login card with a BLANK number, PIN cells, Forgot PIN', async () => {
    await logout(); // welcome screen → member login card
    const shown = await page.getByTestId('login-phone').inputValue();
    if (shown !== '') throw new Error(`number box not blank: "${shown}"`);
    await page.getByTestId('forgot-pin').waitFor();
    await page.getByTestId('cta-create').getByText("See my matches — it's free").waitFor();
    await page.screenshot({ path: `${SHOTS}/a4-pin-login.png` });
    await page.reload(); // still blank after the app restarts
    if ((await page.getByTestId('login-phone').inputValue()) !== '') throw new Error('number prefilled after restart');
  });
  await step('PIN without a number: asks for the number', async () => {
    await page.getByTestId('pin-input').fill('4827');
    await page.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
    await page.waitForTimeout(300);
    if (!new URL(page.url()).pathname.match(/^\/(login)?$/)) throw new Error('logged in without a number');
  });
  await step('wrong PIN: clear error with attempts left', async () => {
    await typeNumber();
    await page.getByTestId('pin-input').fill('0000');
    await page.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
    await page.getByText('Incorrect PIN. 4 attempts left.').waitFor();
    await page.screenshot({ path: `${SHOTS}/a5-pin-wrong.png` });
  });
  await step('correct PIN (pasted with a space) logs in — no OTP sent', async () => {
    const before = await otpCount();
    await page.getByTestId('pin-input').fill('48 27');
    await page.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
    await page.waitForURL((u) => !u.pathname.startsWith('/login') && u.pathname !== '/', { timeout: 10000 });
    if ((await otpCount()) !== before) throw new Error('an OTP was sent during PIN login');
  });
  await step('Forgot PIN: OTP to the registered number, new PIN, logged in', async () => {
    await logout();
    await typeNumber(); // the number typed above carries into the reset
    await page.getByTestId('forgot-pin').click();
    await page.getByText('Reset your PIN').waitFor();
    if ((await page.getByTestId('phone-input').inputValue()) !== NUM) throw new Error('number not carried into Forgot PIN');
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
    await typeNumber();
    await page.getByTestId('pin-input').fill('4827');
    await page.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
    await page.getByText('Incorrect PIN', { exact: false }).waitFor();
    await page.getByTestId('pin-input').fill('5931');
    await page.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
    await page.waitForURL((u) => !u.pathname.startsWith('/login') && u.pathname !== '/', { timeout: 10000 });
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
    await typeNumber();
    for (let i = 0; i < 5; i++) {
      await page.getByTestId('pin-input').fill('0000');
      await page.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
      await page.waitForTimeout(400);
    }
    await page.getByText('Too many wrong PINs', { exact: false }).waitFor();
    await page.screenshot({ path: `${SHOTS}/a7-pin-locked.png` });
    await page.reload(); // a restart does not reset the counter
    await typeNumber();
    await page.getByTestId('pin-input').fill('7140');
    await page.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
    await page.getByText('Too many wrong PINs', { exact: false }).waitFor();
  });
  await step('existing account from before PINs: OTP, then asked to set a PIN, data intact', async () => {
    await page.getByTestId('whatsapp-login').click();
    await page.getByTestId('phone-input').fill('9000000001');
    await page.getByTestId('send-otp').click();
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await page.waitForURL((u) => u.pathname.startsWith('/pin'));
    await pinEntry('3816');
    await pinEntry('3816');
    await page.waitForURL((u) => u.pathname.startsWith('/home'), { timeout: 10000 }); // not forced into biodata again
  });

  await step('a phone never used before: number + PIN → one-time WhatsApp code, then PIN alone works there', async () => {
    // A second browser = another phone. The demo data lives per browser, so register there first.
    const other = await browser.newContext({ viewport: { width: 400, height: 860 } });
    const p2 = await other.newPage();
    await p2.goto(BASE + '/login?next=biodata');
    await p2.getByTestId('phone-input').fill('9777700009');
    await p2.getByTestId('send-otp').click();
    await p2.getByTestId('otp-input').fill('123456');
    await p2.getByTestId('verify-otp').click();
    await p2.waitForURL((u) => u.pathname.startsWith('/pin'));
    for (let i = 0; i < 2; i++) { await p2.getByTestId('pin-setup-input').fill('6295'); await p2.getByTestId('pin-continue').click(); }
    await p2.waitForURL((u) => u.pathname.startsWith('/start/'), { timeout: 10000 });
    // Forget this phone: as if the member picked up a new phone.
    await p2.evaluate(() => { for (const k of Object.keys(localStorage)) if (!k.startsWith('hr.demo.db')) localStorage.removeItem(k); });
    const db = JSON.parse(await p2.evaluate(() => localStorage.getItem('hr.demo.db')));
    await p2.evaluate((d) => { d.devices = []; d.sessions = []; localStorage.setItem('hr.demo.db', JSON.stringify(d)); }, db);
    await p2.goto(BASE + '/login');
    await p2.getByTestId('login-phone').fill('9777700009');
    await p2.getByTestId('pin-input').fill('6295');
    await p2.getByTestId('pin-login').click({ timeout: 1500 }).catch(() => undefined);
    await p2.getByTestId('otp-sent').waitFor({ timeout: 10000 }); // the code went out automatically
    await p2.getByTestId('login-notice').waitFor();
    await p2.getByTestId('otp-input').fill('123456');
    await p2.getByTestId('verify-otp').click();
    await p2.waitForURL((u) => !u.pathname.startsWith('/login') && u.pathname !== '/' && u.pathname !== '/', { timeout: 10000 });
    await other.close();
  });

  await browser.close();
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (real.length) { console.log('FAILURES:', real); process.exit(1); }
  console.log('PIN E2E PASSED');
})();
