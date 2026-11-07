// Referral-based free Boosts (owner spec 2026-11-02) in the real screens, on the demo backend (one browser =
// one demo "server"). Covers: admin switches Paid ↔ Referral; Boost screen per mode (paid plans hidden only
// in Referral mode, paid flow untouched in Paid mode); Refer & Earn; an invitation link → welcome note →
// code kept through sign-up → the referrer sees the family as "Registered"; admin Referrals list; the
// invited family cannot attach a different code later. Reward rules are covered by __tests__/referral.test.ts
// and supabase/tests/99_referral_boost.test.sql.   node e2e/referral.js [shotsDir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { loginWithOtp } = require('./auth');
const BASE = 'http://localhost:8081';
const SHOTS = process.argv[2] || path.join(__dirname, 'screenshots', 'referral');
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log('✓', name);
  } catch (e) {
    failed++;
    console.log('✗', name, '—', e.message.split('\n')[0]);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true });
  const logout = async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').last().click();
    await page.waitForURL((u) => !u.pathname.startsWith('/settings'), { timeout: 10000 });
  };
  const setMode = async (label) => {
    await page.goto(BASE + '/admin/referrals');
    await page.getByTestId(label === 'Paid Boost' ? 'admin-ref-mode-paid' : 'admin-ref-mode-referral').last().click();
    const save = page.getByTestId('admin-ref-save').last();
    if (await save.isEnabled()) await save.click();
    await page.getByText(`How members get a Boost`).first().waitFor();
    await page.waitForTimeout(400);
  };
  let code = '';

  await step('Referral mode is the default (owner 2026-11-07): no plans, the referral promotion instead', async () => {
    await page.goto(BASE + '/');
    await loginWithOtp(page, BASE, '9000000001');
    await page.goto(BASE + '/boost');
    await page.getByTestId('referral-boost-panel').waitFor({ timeout: 10000 });
    if (await page.getByTestId('plan-d7').count()) throw new Error('plans shown in Referral mode');
    await shot('01-default-referral');
  });

  await step('admin switches to Referral Boost (settings card, saved)', async () => {
    await logout();
    await loginWithOtp(page, BASE, '9000000000');
    await setMode('Referral Boost');
    await shot('02-admin-settings');
  });

  await step('Referral mode: paid plans hidden, referral headline + balance + how it works; Home banner; Profile card', async () => {
    await logout();
    await loginWithOtp(page, BASE, '9000000001');
    await page.goto(BASE + '/boost');
    await page.getByTestId('referral-boost-panel').waitFor({ timeout: 10000 });
    await page.getByText('Refer a Family. Get More Visibility!').first().waitFor();
    if (await page.locator('[data-testid^="plan-"]').count()) throw new Error('a Boost plan is still offered in Referral mode');
    await page.getByTestId('referral-balance').waitFor();
    await shot('03-referral-boost');
    await page.goto(BASE + '/home');
    await page.getByTestId('home-referral-banner').waitFor({ timeout: 10000 });
    await page.goto(BASE + '/dashboard');
    await page.getByTestId('profile-referral-card').waitFor({ timeout: 10000 });
  });

  await step('Refer & Earn: own code, share buttons, counts; no link until the website address is set', async () => {
    await page.goto(BASE + '/refer');
    await page.getByTestId('referral-code').waitFor({ timeout: 10000 });
    code = (await page.getByTestId('referral-code').innerText()).trim();
    if (!/^HR[2-9A-HJKMNP-Z]{4,6}$/.test(code)) throw new Error('code ' + code);
    await page.getByTestId('referral-whatsapp').waitFor();
    await page.getByTestId('referral-share').waitFor();
    await page.getByText('They enter this code when they sign up.').first().waitFor();
    await shot('04-refer');
  });

  await step('an invitation link: remembered, welcome says "A family invited you", code prefilled and valid at sign-up', async () => {
    await logout();
    await page.goto(BASE + `/r/${code}`);
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10000 });
    await page.getByTestId('invited-banner').waitFor({ timeout: 10000 });
    if (!(await page.getByTestId('invited-banner').innerText()).includes(code)) throw new Error('code not shown');
    await shot('05-invited-welcome');
    await page.getByTestId('welcome-find-rishta').click();
    await page.getByTestId('who-daughter').click();
    await page.waitForURL(/\/start\/wants/);
    await page.getByTestId('wants-age-23-27').click();
    await page.getByTestId('wants-region-hyd').click();
    await page.getByTestId('wants-show').click();
    await page.waitForURL(/\/start\/matches/);
    await page.getByTestId('matches-save').click();
    await page.waitForURL(/\/start\/phone/);
    const input = page.getByTestId('referral-code-input');
    await input.waitFor();
    if ((await input.inputValue()) !== code) throw new Error('code not prefilled');
    await page.getByText('Valid').first().waitFor();
    await shot('06-signup-code');
    await page.getByTestId('onb-phone-input').fill('9876511101');
    await page.getByTestId('onb-send-code').click();
    await page.waitForURL(/\/start\/code/);
    await page.getByTestId('onb-otp-input').fill('123456');
    await page.waitForURL(/\/pin/);
    for (let i = 0; i < 2; i++) {
      await page.getByTestId('pin-setup-input').fill('4827');
      await page.getByTestId('pin-continue').click();
    }
    await page.waitForURL(/\/start\/q\/name/);
  });

  await step('a typed wrong code is caught before sign-up', async () => {
    const p2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await p2.goto(BASE + '/');
    await p2.getByTestId('welcome-find-rishta').click();
    await p2.getByTestId('who-son').click();
    await p2.getByTestId('wants-age-23-27').click();
    await p2.getByTestId('wants-region-hyd').click();
    await p2.getByTestId('wants-show').click();
    await p2.getByTestId('matches-save').click();
    await p2.getByTestId('referral-code-input').fill('HRZZZZ');
    await p2.getByTestId('referral-code-input').press('Enter');
    await p2.getByTestId('referral-code-invalid').waitFor({ timeout: 5000 });
    await p2.close();
  });

  await step('the referrer sees the family as an initial + stage only; admin sees it in Referrals', async () => {
    await logout();
    await loginWithOtp(page, BASE, '9000000001');
    await page.goto(BASE + '/refer');
    await page.getByTestId('referral-row').first().waitFor({ timeout: 10000 });
    const row = await page.getByTestId('referral-row').first().innerText();
    if (/9876511101/.test(row)) throw new Error('number leaked to the referrer');
    if (!/Registered|Profile incomplete/.test(row)) throw new Error('stage: ' + row);
    if ((await page.getByTestId('referral-stat-referred').innerText()).trim().charAt(0) !== '1') throw new Error('count');
    await shot('07-refer-with-family');
    await page.goto(BASE + '/notifications');
    await page.getByText('A family joined Hyderabad Rishta with your invitation').first().waitFor({ timeout: 10000 });
    await logout();
    await loginWithOtp(page, BASE, '9000000000');
    await page.goto(BASE + '/admin/referrals');
    await page.getByText('All', { exact: true }).last().click();
    await page.getByTestId('admin-ref-row').first().waitFor({ timeout: 10000 });
    await shot('08-admin-referrals');
    await page.getByTestId('admin-ref-row').first().click();
    await page.getByText('Review referral').first().waitFor();
    await shot('09-admin-detail');
  });

  await step('back to Paid mode: the paid screen is exactly as before (plans, price, Continue)', async () => {
    await setMode('Paid Boost');
    await logout();
    await loginWithOtp(page, BASE, '9000000001');
    await page.goto(BASE + '/boost');
    await page.getByTestId('plan-d14').waitFor({ timeout: 10000 });
    await page.getByTestId('plan-d14').click();
    await page.getByTestId('boost-cta').waitFor();
    if (!/₹200/.test(await page.getByTestId('boost-cta').innerText())) throw new Error('paid CTA price');
    if (await page.getByTestId('referral-boost-panel').count()) throw new Error('referral panel in Paid mode');
  });

  await step('no page errors', async () => {
    if (errors.length) throw new Error(errors.slice(0, 3).join(' | '));
  });
  await browser.close();
  console.log(failed ? `REFERRAL E2E FAILED (${failed})` : 'REFERRAL E2E PASSED');
  process.exit(failed ? 1 : 0);
})();
