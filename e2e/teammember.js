// Owner request 2026-10-29, end to end: an admin (and a sub-admin) adds members for phone numbers
// without any OTP; when the owner of that number later logs in with OTP, they land in that account
// and see the biodata the team created. One number = one account throughout.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';
const NEW = '9999999999';
const errors = [];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
  const step = async (name, fn) => {
    try { await fn(); console.log('✓', name); }
    catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(name); await page.screenshot({ path: `${SHOTS}/fail-team-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined); }
  };
  const select = async (labelStart, option) => {
    await page.getByRole('button', { name: new RegExp('^' + labelStart + ':') }).first().click();
    await page.getByRole('radio', { name: option, exact: true }).last().click();
  };
  const next = () => page.getByTestId('wizard-next').click();
  const logout = async () => { await page.goto(BASE + '/settings'); await page.getByTestId('logout').click(); await page.getByTestId('cta-find').waitFor(); };
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));

  await step('admin: "Add a member" refuses a number that already has an account', async () => {
    await loginWithOtp(page, BASE, '9000000000');
    await page.goto(BASE + '/admin');
    await page.getByText('Add a member').first().click();
    await page.waitForURL((u) => u.pathname === '/admin/add-member', { waitUntil: 'commit' });
    await page.getByTestId('add-phone').fill('9000000001');
    await page.getByTestId('add-check').click();
    await page.getByTestId('add-taken').waitFor();
  });

  await step('admin: adds a bride for 9999999999 — no OTP — fills all 7 steps, reviews, publishes', async () => {
    await page.getByTestId('add-phone').fill('99999 99999');
    await page.getByTestId('add-check').click();
    await page.getByTestId('add-free').waitFor();
    await page.screenshot({ path: `${SHOTS}/t1-add-member.png` });
    await page.getByTestId('add-continue').click();
    await page.getByText('Step 1 of 7').waitFor();
    await page.getByRole('radio', { name: 'Daughter' }).click();
    await page.getByRole('radio', { name: 'Groom' }).click(); // looking for a groom → bride profile
    await page.getByLabel('Full name').fill('Nazia Teamadded');
    await select('Day', '10');
    await select('Month', 'Mar');
    await select('Year', '1999');
    await select('Height', '5′ 3″ (160 cm)');
    await page.getByRole('radio', { name: 'Never married' }).click();
    await select('Mother tongue', 'Urdu');
    await page.screenshot({ path: `${SHOTS}/t2-admin-wizard.png` });
    await next();
    await page.getByText('Step 2 of 7').waitFor();
    // The first save created the account + draft.
    const d1 = await db();
    const u = d1.users.find((x) => x.phone === NEW);
    if (!u || !u.createdBy || u.claimedAt) throw new Error('account not created as team-added');
    await select('City', 'Hyderabad');
    await next(); await page.getByText('Step 3 of 7').waitFor();
    await select('Highest education', "Bachelor's");
    await select('Profession', 'IT');
    await next(); await page.getByText('Step 4 of 7').waitFor();
    await next(); await page.getByText('Step 5 of 7').waitFor();
    await next(); await page.getByText('Step 6 of 7').waitFor();
    await next(); await page.getByText('Step 7 of 7').waitFor();
    await next();
    await page.waitForURL((u2) => u2.pathname === '/admin/member-review', { waitUntil: 'commit' });
    await page.getByText('Nazia').first().waitFor();
    await page.screenshot({ path: `${SHOTS}/t3-admin-review.png`, fullPage: true });
    await page.getByTestId('review-publish').click();
    await page.waitForURL((u2) => u2.pathname.startsWith('/admin/member/'), { waitUntil: 'commit' });
    await page.getByText('added by team · not yet signed in').waitFor();
    await page.screenshot({ path: `${SHOTS}/t4-admin-member.png` });
    const p = (await db()).profiles.find((x) => x.userId === u.id);
    if (p.status !== 'published') throw new Error(`status ${p.status}`);
  });

  await step('admin: the same number cannot be added twice', async () => {
    await page.goto(BASE + '/admin/add-member');
    await page.getByTestId('add-phone').fill('+91 9999999999');
    await page.getByTestId('add-check').click();
    await page.getByTestId('add-taken').waitFor();
  });

  await step('sub-admin: can add a member too (saved as a draft)', async () => {
    await logout();
    await loginWithOtp(page, BASE, '9000000009');
    await page.goto(BASE + '/admin/add-member');
    await page.getByTestId('add-phone').fill('9888877766');
    await page.getByTestId('add-check').click();
    await page.getByTestId('add-continue').click();
    await page.getByText('Step 1 of 7').waitFor();
    await page.getByRole('radio', { name: 'Son' }).click();
    await page.getByRole('radio', { name: 'Bride' }).click();
    await page.getByLabel('Full name').fill('Sameer Subadded');
    await select('Day', '5'); await select('Month', 'Jun'); await select('Year', '1995');
    await select('Height', '5′ 9″ (175 cm)');
    await page.getByRole('radio', { name: 'Never married' }).click();
    await select('Mother tongue', 'Urdu');
    await next(); await page.getByText('Step 2 of 7').waitFor();
    const u = (await db()).users.find((x) => x.phone === '9888877766');
    if (!u || u.createdBy !== 'u_sub') throw new Error(`created by ${u && u.createdBy}`);
  });

  await step('the owner of 9999999999 logs in with OTP → same account, the team\'s biodata, a review note', async () => {
    await logout();
    await loginWithOtp(page, BASE, NEW); // OTP + creates a PIN on this phone
    await page.waitForURL((u) => u.pathname === '/home', { waitUntil: 'commit' });
    await page.getByTestId('team-created-note').waitFor();
    await page.screenshot({ path: `${SHOTS}/t5-owner-home.png` });
    const d = await db();
    const u = d.users.filter((x) => x.phone === NEW);
    if (u.length !== 1) throw new Error(`${u.length} accounts for the number`);
    if (!u[0].claimedAt) throw new Error('not claimed');
    await page.goto(BASE + '/dashboard');
    await page.getByText('Nazia Teamadded').waitFor();
    await page.getByText('Published', { exact: true }).first().waitFor();
    await page.goto(BASE + '/notifications');
    await page.getByText(/Our team created your biodata/).first().waitFor();
  });

  await step('the owner reviews and saves once → the note goes; they now own it', async () => {
    await page.goto(BASE + '/home');
    await page.getByTestId('team-created-review').click();
    await page.getByText('Step 1 of 7').waitFor();
    await next(); await page.getByText('Step 2 of 7').waitFor();
    await page.goto(BASE + '/home');
    await page.waitForTimeout(800);
    if (await page.getByTestId('team-created-note').count()) throw new Error('note still shown');
  });

  await step('admin: the member page now says claimed; team editing is closed', async () => {
    await logout();
    await loginWithOtp(page, BASE, '9000000000');
    const u = (await db()).users.find((x) => x.phone === NEW);
    await page.goto(BASE + `/admin/member/${u.id}`);
    await page.getByText('added by team · claimed').waitFor();
    if (await page.getByTestId('member-edit-biodata').count()) throw new Error('team can still edit');
  });

  await browser.close();
  if (errors.length) { console.log('FAILURES:', errors); process.exit(1); }
  console.log('TEAM MEMBER E2E PASSED');
})();
