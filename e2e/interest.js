// Express Interest / phone offers / poke — two demo accounts in the browser.
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
  const confirmDialog = (label) => page.getByRole('button', { name: label, exact: true }).last().click();

  await step('photo picker shows three labelled slots', async () => {
    await login('9876500777');
    await page.getByText('Add up to 3 photos').waitFor();
    for (const n of [1, 2, 3]) await page.getByTestId(`photo-slot-${n}`).waitFor();
    await page.getByText('Main photo', { exact: true }).waitFor();
    await page.getByText('Photo 3', { exact: true }).waitFor();
    await page.screenshot({ path: `${SHOTS}/40-photo-slots.png` });
    await logout();
  });
  await step('groom: Express Interest → offer number with consent → send', async () => {
    await login('9000000001');
    await page.goto(BASE + '/profile/p_2');
    await page.getByText("Let them know you're interested").waitFor();
    await page.screenshot({ path: `${SHOTS}/41-profile-express.png` });
    await page.getByTestId('express-interest').click();
    await page.getByText('How would you like to connect?').waitFor();
    await page.getByTestId('connect-offer').click();
    await page.getByText(/Your number: \+91 •+0001/).waitFor();
    if (!(await page.getByTestId('preview-request').isDisabled())) throw new Error('preview enabled without consent');
    await page.getByTestId('consent-checkbox').click();
    await page.screenshot({ path: `${SHOTS}/42-connect-options.png`, fullPage: true });
    await page.getByTestId('preview-request').click();
    await page.getByText(/revealed only if they accept/).waitFor();
    await page.getByTestId('confirm-send').click();
    await page.getByText(/Your interest: Pending/).waitFor();
  });
  await step('bride: sees the offer notice, accepts → groom number revealed with Call/Copy/SMS', async () => {
    await logout();
    await login('9000000102');
    await page.goto(BASE + '/requests');
    await page.getByText('The sender has offered to share their phone number').first().waitFor();
    await page.screenshot({ path: `${SHOTS}/43-incoming.png`, fullPage: true });
    await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
    await page.getByTestId('revealed-number').first().waitFor();
    const num = await page.getByTestId('revealed-number').first().innerText();
    if (!num.includes('9000000001')) throw new Error('wrong number ' + num);
    await page.getByRole('button', { name: 'Call' }).first().waitFor();
    await page.getByRole('button', { name: 'Copy number' }).first().waitFor();
    await page.screenshot({ path: `${SHOTS}/44-revealed.png`, fullPage: true });
  });
  await step('bride: Share My Number back (explicit confirmation)', async () => {
    await page.getByRole('button', { name: 'Share My Number' }).first().click();
    await confirmDialog('Share My Number');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/46-after-share.png`, fullPage: true });
    await page.getByText('Offered', { exact: true }).first().waitFor({ timeout: 5000 });
  });
  await step('groom: accepts the bride’s number offer → revealed', async () => {
    await logout();
    await login('9000000001');
    await page.goto(BASE + '/requests');
    await page.getByRole('radio', { name: 'Sent' }).click();
    await page.getByRole('button', { name: 'Accept & reveal number' }).first().click();
    await page.getByText('9000000102').first().waitFor();
  });
  await step('groom: poke the 3-day-old unanswered request once', async () => {
    await page.getByTestId('poke-r_3').click();
    await page.getByText('Reminder sent.').waitFor();
    await page.getByTestId('poke-status-r_3').waitFor();
    await page.screenshot({ path: `${SHOTS}/45-poke.png`, fullPage: true });
  });
  await step('poked member sees a guilt-free, anonymous reminder', async () => {
    await logout();
    await login('9000000106');
    await page.goto(BASE + '/notifications');
    await page.getByText(/waiting for your response\. Review their request whenever convenient/).waitFor();
  });
  await browser.close();
  console.log('\nERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
})();
