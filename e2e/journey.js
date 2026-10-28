// Full journey: register → 7-step biodata (with "Other" education) → publish → admin approve → discoverable via custom value.
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
  const select = async (labelStart, option) => {
    await page.getByRole('button', { name: new RegExp('^' + labelStart + ':') }).first().click();
    await page.getByRole('radio', { name: option, exact: true }).last().click();
  };
  const next = () => page.getByTestId('wizard-next').click();
  const logout = async () => { await page.goto(BASE + '/settings'); await page.getByTestId('logout').click(); await page.getByTestId('cta-find').waitFor(); };

  await step('register new user', async () => {
    await page.goto(BASE + '/');
    await login('9876500001');
    await page.getByText('Step 1 of 7').waitFor();
  });
  await step('step 1 basic', async () => {
    await page.getByRole('radio', { name: 'Myself' }).click();
    await page.getByRole('radio', { name: 'Bride' }).click(); // looking for bride → groom profile
    await page.getByLabel('Full name').fill('Test Groom Kareem');
    await select('Day', '15');
    await select('Month', 'Jan');
    await select('Year', '1996');
    await page.getByText('Age: ').waitFor();
    await select('Height', '5′ 9″ (175 cm)');
    await page.getByRole('radio', { name: 'Divorced' }).click();
    await select('Mother tongue', 'Urdu');
    await next(); // children is now required
    await page.getByText('Enter the number of children (0 if none)').waitFor();
    await page.getByTestId('children-input').fill('1');
    await page.screenshot({ path: `${SHOTS}/19-children.png` });
    await next();
    await page.getByText('Step 2 of 7').waitFor();
  });
  await step('step 2 location (structured + dependent)', async () => {
    await select('City', 'Hyderabad');
    await page.getByLabel('Town / locality').fill('Tolichowki');
    await next();
    await page.getByText('Step 3 of 7').waitFor();
  });
  await step('step 3: "Other" education requires specify', async () => {
    await select('Highest education', 'Other');
    await select('Profession', 'IT');
    await next();
    await page.getByText('Please specify your education').nth(1).waitFor(); // label + error
    await page.screenshot({ path: `${SHOTS}/20-other-required.png` });
    await page.getByLabel('Please specify your education').fill('Hafiz-e-Quran and B.Tech');
    await next();
    await page.getByText('Step 4 of 7').waitFor();
  });
  await step('steps 4–6 optional sections', async () => {
    await select('Maslak / sect', 'Sunni');
    await select('Sub-maslak / school of thought', 'Hanafi');
    await page.screenshot({ path: `${SHOTS}/20b-maslak.png` });
    await next(); await page.getByText('Step 5 of 7').waitFor();
    await next(); await page.getByText('Step 6 of 7').waitFor();
    await next(); await page.getByText('Step 7 of 7').waitFor();
    await page.screenshot({ path: `${SHOTS}/21-privacy.png` });
  });
  await step('preview & publish → live immediately (demo default)', async () => {
    await next();
    await page.getByTestId('publish').waitFor();
    await page.screenshot({ path: `${SHOTS}/22-preview.png` });
    await page.getByTestId('publish').click();
    await page.getByText('Visible in discovery.').waitFor();
    await page.screenshot({ path: `${SHOTS}/23-dashboard-pending.png` });
  });
  await step('draft persisted across reload', async () => {
    await page.reload();
    await page.getByText('Test Groom Kareem').waitFor();
  });
  await step('express interest (introduction only)', async () => {
    await page.goto(BASE + '/discover');
    await page.getByRole('button', { name: /^View profile/ }).first().click();
    await page.getByTestId('express-interest').click();
    await page.getByText('How would you like to connect?').waitFor();
    await page.getByTestId('connect-intro').click();
    await page.getByTestId('preview-request').click();
    await page.getByTestId('confirm-send').click();
    await page.getByText(/Your interest: Pending/).waitFor();
    await page.screenshot({ path: `${SHOTS}/25-request-sent.png` });
  });
  await step('bride finds groom via custom education keyword', async () => {
    await logout();
    await login('9000000100'); // seed bride p_0 → lands on Home
    await page.goto(BASE + '/discover');
    await page.getByText(/\d+ profiles/).waitFor();
    await page.getByTestId('open-filters').click();
    await page.getByLabel('Keyword').fill('Hafiz');
    await page.getByRole('button', { name: /Show 1 profiles/ }).waitFor({ timeout: 5000 });
    await page.getByTestId('apply-filters').click();
    await page.getByText('Hafiz-e-Quran and B.Tech').first().waitFor();
    await page.screenshot({ path: `${SHOTS}/24-custom-search.png` });
  });
  await step('groom sees published notification and sent request', async () => {
    await logout();
    await login('9876500001');
    await page.goto(BASE + '/notifications');
    await page.getByText('Your profile is now published').waitFor();
    await page.goto(BASE + '/requests');
    await page.getByRole('radio', { name: 'Sent' }).click();
    await page.getByText('Pending').first().waitFor();
  });
  await browser.close();
  console.log('\nERRORS:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'none');
})();
