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
    await page.getByText('A little about him').waitFor();
    if (await page.getByText('Are you looking for a bride or a groom?').count()) throw new Error('bride/groom asked although implied'); // asks about the son, not the partner
    await page.getByText('His age').waitFor();
    await page.getByText('Where does he live?').waitFor();
    if (await page.getByTestId('wants-side').count()) throw new Error('asked bride/groom although implied');
  });
  await step('myself: bride/groom on its own screen, then only questions about me', async () => {
    const p5 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await p5.goto(BASE + '/');
    await p5.getByTestId('welcome-find-rishta').click();
    await p5.getByTestId('who-self').click();
    await p5.waitForURL(/\/start\/side/);
    await p5.getByText('Are you looking for a bride or a groom?').waitFor();
    await p5.getByTestId('side-groom').click();
    await p5.waitForURL(/\/start\/wants/);
    await p5.getByText('A little about you').last().waitFor();
    await p5.getByText('Your age').last().waitFor();
    await p5.getByText('Where do you live?').last().waitFor();
    if (await p5.getByText('I am looking for').count()) throw new Error('partner question mixed into the about-you screen');
    await p5.close();
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
    await at(/\/start\/q\/name/);
  });
  await step('leave halfway → reopening the app offers "continue where I left off"', async () => {
    await page.goto(BASE + '/');
    await at(/\/start\/resume/);
    await page.getByTestId('resume-continue').click();
    await at(/\/start\/q\/name/);
  });
  const L = (id) => page.getByTestId(id).last();
  await step('one question per screen: name → date of birth → height, with "1 of 8" and a "Next: …" button', async () => {
    await L('onb-count').waitFor();
    if ((await L('onb-count').innerText()) !== '1 of 8') throw new Error('counter: ' + (await L('onb-count').innerText()));
    if (await L('q-next').isEnabled()) throw new Error('Next enabled with no name');
    await L('q-name-input').fill('Imran Ahmed');
    await page.getByText('Next: date of birth').last().waitFor();
    await L('q-next').click();
    await at(/\/start\/q\/dob/);
    await L('dob-year-1997').click();
    await L('dob-month-3').click();
    await L('dob-day-12').click();
    await L('q-age').waitFor();
    await shot('03-dob');
    await L('q-next').click();
    await at(/\/start\/q\/height/);
    await L('q-height-wheel-198').click(); // 6′ 6″ — every inch is there
    await page.getByText('6′ 6″ · 198 cm').last().waitFor();
    await L('q-next').click();
    await at(/\/start\/q\/marital/);
  });
  await step('marital: one tap moves on; "divorced" adds the children question (counter becomes 9)', async () => {
    await shot('04-marital');
    await L('q-marital-divorced').click();
    await at(/\/start\/q\/children/);
    if ((await L('onb-count').innerText()) !== '5 of 9') throw new Error('counter: ' + (await L('onb-count').innerText()));
    if (await L('q-livewith').count()) throw new Error('live-with shown with no children');
    await L('q-children-plus').click(); // 0
    await L('q-children-plus').click(); // 1
    await L('q-livewith-yes').click();
    await L('q-note').fill('Our son is 6 and lives with us');
    await L('q-next').click();
    await at(/\/start\/q\/tongue/);
    await L('q-tongue-urdu').click();
    await at(/\/start\/q\/city/);
    await L('q-place').waitFor(); // Hyderabad pre-filled from the earlier answer
    await page.getByText("Yes, that's right").last().click();
    await at(/\/start\/q\/education/);
  });
  await step('education one tap; profession "Other" asks to write it; Finish publishes; win screen; on to Discover', async () => {
    await L('q-education-bachelors').click();
    await at(/\/start\/q\/profession/);
    await L('q-profession-other').click();
    if (await L('q-next').isEnabled()) throw new Error('finish enabled without the written profession');
    await L('q-profession-other-text').fill('Software engineer');
    await L('q-next').click();
    await at(/\/start\/live/);
    await page.getByText(/biodata is live|sent for review/).first().waitFor();
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('hr.demo.db')));
    const me = db.users.find((u) => u.phone === '9876500091');
    const p = db.profiles.find((x) => x.userId === me.id);
    const b = p.biodata.basic;
    if (b.createdFor !== 'son' || b.lookingFor !== 'bride' || b.heightCm !== 198 || b.children !== 1 || b.childrenLiveWith !== 'yes') throw new Error('answers not saved: ' + JSON.stringify(b));
    if (p.biodata.preferences.ageMin !== 18 || p.biodata.preferences.ageMax !== 27) throw new Error('partner age range (from his 23–27) not kept: ' + JSON.stringify(p.biodata.preferences));
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

  await step('stuck draft (who/bride-groom never saved) → Finish goes back to the first question, then publishes', async () => {
    const p4 = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const at4 = (re) => p4.waitForURL(re, { timeout: 10000 });
    await p4.goto(BASE + '/');
    await p4.getByTestId('welcome-find-rishta').click();
    await p4.getByTestId('who-daughter').last().click();
    await p4.getByTestId('wants-age-28-32').last().click();
    await p4.getByTestId('wants-region-hyd').last().click();
    await p4.getByTestId('wants-show').last().click();
    await p4.getByTestId('matches-save').last().click();
    await p4.getByTestId('onb-phone-input').fill('9876500092');
    await p4.getByTestId('onb-send-code').click();
    await p4.getByTestId('onb-otp-input').fill('123456');
    await at4(/\/pin/);
    for (let i = 0; i < 2; i++) { await p4.getByTestId('pin-setup-input').fill('4827'); await p4.getByTestId('pin-continue').click(); }
    await at4(/\/start\/q\/name/);
    // Reproduce the reported state: the draft lacks who/bride-groom and this phone forgot the answers.
    await p4.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('hr.demo.db'));
      const me = db.users.find((u) => u.phone === '9876500092');
      const pr = db.profiles.find((x) => x.userId === me.id);
      pr.biodata.basic.createdFor = ''; pr.biodata.basic.lookingFor = '';
      Object.assign(pr.biodata.basic, { fullName: 'Ayesha Khan', dob: '1998-05-04', heightCm: 160, maritalStatus: 'never_married', motherTongue: 'urdu' });
      pr.biodata.career = { ...pr.biodata.career, education: 'bachelors', profession: 'it' };
      localStorage.setItem('hr.demo.db', JSON.stringify(db));
      for (const k of Object.keys(localStorage)) if (k.includes('hr.onboarding.v1')) localStorage.setItem(k, JSON.stringify({ active: true, step: 'profession', answers: {} }));
    });
    await p4.goto(BASE + '/start/q/profession');
    await p4.getByTestId('q-profession-it').last().click(); // last question: one tap tries to finish
    await at4(/\/start\/who/);
    await p4.getByText('Please tell us who this biodata is for first.').first().waitFor();
    // Signed in already: answering again saves straight to the biodata, nothing typed is lost.
    await p4.getByTestId('who-daughter').last().click();
    await p4.getByTestId('wants-age-28-32').last().click();
    await p4.getByTestId('wants-region-hyd').last().click();
    await p4.getByTestId('wants-show').last().click();
    await p4.getByTestId('matches-save').last().click();
    await at4(/\/start\/q\/name/);
    const L4 = (id) => p4.getByTestId(id).last();
    if ((await L4('q-name-input').inputValue()) !== 'Ayesha Khan') throw new Error('name lost');
    for (const q of ['name', 'dob', 'height']) { await at4(new RegExp('/start/q/' + q)); await L4('q-next').click(); }
    await at4(/\/start\/q\/marital/);
    await L4('q-marital-never_married').click();
    await at4(/\/start\/q\/tongue/);
    await L4('q-tongue-urdu').click();
    await at4(/\/start\/q\/city/);
    await L4('q-next').click();
    await at4(/\/start\/q\/education/);
    await L4('q-education-bachelors').click();
    await at4(/\/start\/q\/profession/);
    await L4('q-profession-it').click();
    await at4(/\/start\/live/);
    const b = await p4.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('hr.demo.db'));
      const me = db.users.find((u) => u.phone === '9876500092');
      return db.profiles.find((x) => x.userId === me.id).biodata.basic;
    });
    if (b.createdFor !== 'daughter' || b.lookingFor !== 'groom') throw new Error('answers not saved: ' + JSON.stringify(b));
    await p4.close();
  });

  await browser.close();
  console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'ONBOARDING E2E PASSED');
  process.exit(errors.length ? 1 : 0);
})();
