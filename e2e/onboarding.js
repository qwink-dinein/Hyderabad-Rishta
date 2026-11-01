// Onboarding E2E (owner request 2026-11-01): welcome → who → wants → real matches → number → WhatsApp code → PIN →
// 7 answers (wheels, follow-ups) → live → Discover; members' login card; leave halfway → resume; Urdu reads right.
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
  const browser = await browser_();
  async function browser_() { return chromium.launch(); }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const shot = (n) => page.screenshot({ path: `${SHOTS}/onb-${n}.png` });
  const at = (re) => page.waitForURL(re, { timeout: 10000 });

  await step('welcome: one promise, gold "Find a rishta", member log in', async () => {
    await page.goto(BASE + '/');
    await page.getByText('Assalamu alaikum.').first().waitFor({ timeout: 15000 });
    await page.getByTestId('welcome-find-rishta').waitFor();
    await page.getByTestId('welcome-member-login').waitFor();
    await shot('01-welcome');
  });
  await step('who: one tap moves on (no Continue button); "my son" implies a bride', async () => {
    await page.getByTestId('welcome-find-rishta').click();
    await at(/\/start\/who/);
    await page.getByTestId('who-son').click();
    await at(/\/start\/wants/);
    await page.getByText('What kind of bride are you looking for?').waitFor();
    if (await page.getByTestId('wants-side').count()) throw new Error('asked bride/groom although implied');
  });
  await step('wants: button waits for age + place, then shows real matches before any number', async () => {
    if (await page.getByTestId('wants-show').isEnabled()) throw new Error('enabled before answers');
    await page.getByTestId('wants-age-23-27').click();
    await page.getByTestId('wants-region-hyd').click();
    await page.getByTestId('wants-show').click();
    await at(/\/start\/matches/);
    await page.getByText(/brides? match/).first().waitFor();
    const list = await page.getByTestId('matches-list').innerText();
    if (/HR-\d|\+91|9000000/.test(list)) throw new Error('preview leaked a code or number');
    await shot('02-matches');
  });
  await step('sign-up: one number, WhatsApp code checked on the 6th digit, then PIN', async () => {
    await page.getByTestId('matches-save').click();
    await at(/\/start\/phone/);
    await page.getByTestId('onb-phone-input').fill('9876500091');
    await page.getByTestId('onb-send-code').click();
    await at(/\/start\/code/);
    await page.getByTestId('onb-otp-input').fill('123456'); // no Verify tap needed
    await at(/\/pin/);
    for (let i = 0; i < 2; i++) { await page.getByTestId('pin-setup-input').fill('4827'); await page.getByTestId('pin-continue').click(); }
    await at(/\/start\/about/);
  });
  await step('leave halfway → reopening the app offers "continue where I left off"', async () => {
    await page.goto(BASE + '/');
    await at(/\/start\/resume/);
    await page.getByTestId('resume-continue').click();
    await at(/\/start\/about/);
  });
  await step('about: name, date of birth wheels, height from the full scroll list', async () => {
    if (await page.getByTestId('about-next').isEnabled()) throw new Error('Next enabled with nothing filled');
    await page.getByTestId('about-name').fill('Imran Ahmed');
    await page.getByTestId('dob-year-1997').click();
    await page.getByTestId('dob-month-3').click();
    await page.getByTestId('dob-day-12').click();
    await page.getByText('Age: ').waitFor();
    await page.getByTestId('about-height').click();
    await page.getByTestId('about-height-sheet').waitFor();
    await page.getByTestId('about-height-wheel-198').click(); // 6′ 6″ — every inch is there
    await page.getByTestId('about-height-done').click();
    await page.getByText('6′ 6″ · 198 cm').waitFor();
    await shot('03-about');
    await page.getByTestId('about-next').click();
    await at(/\/start\/more/);
  });
  await step('more: children only after "divorced" (required, 0 fine); live-with + note only with children', async () => {
    if (await page.getByTestId('more-children').count()) throw new Error('children asked before marital status');
    await page.getByTestId('more-marital-divorced').click();
    await page.getByTestId('more-children').waitFor();
    if (await page.getByTestId('more-livewith').count()) throw new Error('live-with shown with no children');
    await page.getByTestId('more-children-plus').click(); // 0
    await page.getByTestId('more-children-plus').click(); // 1
    await page.getByTestId('more-livewith').waitFor();
    await page.getByTestId('more-livewith-yes').click();
    await page.getByTestId('more-note').fill('Our son is 6 and lives with us');
    await page.getByTestId('more-tongue-urdu').click();
    await page.getByTestId('more-place').waitFor(); // Hyderabad pre-filled from the earlier answer
    await shot('04-more');
    await page.getByTestId('more-next').click();
    await at(/\/start\/work/);
  });
  await step('work: "Other" asks to write it; Finish publishes; win screen; on to Discover', async () => {
    await page.getByLabel(/^Highest education:/).first().click();
    await page.getByText("Bachelor's", { exact: true }).first().click();
    await page.getByLabel(/^Profession:/).first().click();
    await page.getByText('Other', { exact: true }).last().click();
    if (await page.getByTestId('work-finish').isEnabled()) throw new Error('finish enabled without the written profession');
    await page.getByTestId('work-profession-other').fill('Software engineer');
    await page.getByTestId('work-finish').click();
    await at(/\/start\/live/);
    await page.getByText(/biodata is live|sent for review/).first().waitFor();
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));
    const me = db.users.find((u) => u.phone === '9876500091');
    const p = db.profiles.find((x) => x.userId === me.id);
    const b = p.biodata.basic;
    if (b.createdFor !== 'son' || b.lookingFor !== 'bride' || b.heightCm !== 198 || b.children !== 1 || b.childrenLiveWith !== 'yes') throw new Error('answers not saved: ' + JSON.stringify(b));
    if (p.biodata.preferences.ageMin !== 23 || p.biodata.preferences.ageMax !== 27) throw new Error('partner age range not kept');
    await shot('05-live');
    await page.getByTestId('live-see-matches').click();
    await at(/\/discover/);
  });
  await step('reopening after finishing goes Home (no resume prompt)', async () => {
    await page.goto(BASE + '/');
    await at(/\/home/);
  });
  await step('member login card: blank number, logs in by itself on the 4th PIN digit', async () => {
    const p2 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await p2.goto(BASE + '/');
    await p2.getByTestId('welcome-member-login').click();
    await p2.waitForURL(/\/login/);
    if ((await p2.getByTestId('login-phone').inputValue()) !== '') throw new Error('number prefilled');
    await p2.getByTestId('login-phone').fill('9000000001');
    // A demo member on a fresh browser: the device is new, so a one-time WhatsApp code is sent automatically.
    await p2.getByTestId('pin-input').fill('1234');
    await p2.waitForFunction(() => location.pathname !== '/login' || document.body.innerText.includes('WhatsApp'), null, { timeout: 10000 });
    await p2.close();
  });
  await step('Urdu: right-to-left, age range reads 23–27', async () => {
    const p3 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await p3.goto(BASE + '/');
    await p3.getByText('اردو').first().click();
    await p3.waitForFunction(() => document.documentElement.dir === 'rtl');
    await p3.getByTestId('welcome-find-rishta').click();
    await p3.getByTestId('who-daughter').click();
    await p3.waitForURL(/\/start\/wants/);
    const label = await p3.getByTestId('wants-age-23-27').innerText();
    if (!/23–27/.test(label.replace(/[⁦-⁩]/g, ''))) throw new Error('age label: ' + label);
    await p3.screenshot({ path: `${SHOTS}/onb-06-urdu.png` });
    await p3.close();
  });

  await browser.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ONBOARDING E2E PASSED');
  process.exit(errors.length ? 1 : 0);
})();
