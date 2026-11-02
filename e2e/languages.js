// All four app languages (owner request 2026-11-02: English, Urdu, Roman Urdu, Telugu).
// Switching from Settings changes the whole app at once, keeps every bit of the member's data,
// survives a reload, uses the right direction (Urdu right-to-left, Roman Urdu left-to-right),
// and Roman Urdu never shows Urdu script. Runs on a phone-size and a desktop-size window.
// node e2e/languages.js [shotsDir]   (web build served on :8081)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { loginWithOtp } = require('./auth');
const BASE = 'http://localhost:8081';
const SHOTS = process.argv[2] || path.join(__dirname, 'screenshots', 'languages');
fs.mkdirSync(SHOTS, { recursive: true });

// What each language must show on Home, and the radio's accessible name in Settings.
const LANGS = [
  { code: 'en', name: 'English', home: 'Here’s what’s new for you today', settings: 'Language', dir: 'ltr' },
  { code: 'ur', name: 'اردو', home: 'آج آپ کے لیے نیا کیا ہے', settings: 'زبان', dir: 'rtl' },
  { code: 'ur-Latn', name: 'Urdu', home: 'Aaj aap ke liye kya naya hai', settings: 'Zabaan', dir: 'ltr' },
  { code: 'te', name: 'తెలుగు', home: 'ఈరోజు మీకోసం కొత్తవి', settings: 'భాష', dir: 'ltr' },
];

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

// Member data without the parts that are meant to change (the language preference, timestamps).
const memberData = (page) =>
  page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('hr.demo.db') || '{}');
    const me = (db.users || []).find((u) => u.phone && u.phone.endsWith('9000000001'));
    const prof = (db.profiles || []).find((p) => me && p.userId === me.id);
    return JSON.stringify({ biodata: prof && prof.biodata, status: prof && prof.status, shortlist: (db.shortlists || []).filter((s) => me && s.userId === me.id).length });
  });

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ label: 'phone', width: 360, height: 780 }, { label: 'desktop', width: 1280, height: 860 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/');
    await loginWithOtp(page, BASE, '9000000001');
    await page.goto(BASE + '/home');
    await page.waitForTimeout(800);
    const before = await memberData(page);

    await step(`${vp.label}: Settings lists English, Urdu, Roman Urdu, Telugu in that order`, async () => {
      await page.goto(BASE + '/settings');
      await page.getByRole('radio', { name: 'English' }).first().waitFor();
      const names = await page.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText.trim()));
      if (JSON.stringify(names) !== JSON.stringify(LANGS.map((l) => l.name))) throw new Error('order: ' + names.join(' | '));
    });

    for (const l of LANGS) {
      await step(`${vp.label}: ${l.code} — whole app switches, data kept, survives reload, ${l.dir}`, async () => {
        await page.goto(BASE + '/settings');
        await page.getByRole('radio', { name: l.name, exact: true }).first().click();
        await page.getByText(l.settings, { exact: true }).first().waitFor({ timeout: 5000 });
        await page.goto(BASE + '/home');
        await page.getByText(l.home).first().waitFor({ timeout: 8000 });
        await page.reload();
        await page.getByText(l.home).first().waitFor({ timeout: 8000 });
        const st = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, saved: localStorage.getItem('hr.lang'), text: document.body.innerText }));
        if (st.dir !== l.dir) throw new Error(`direction ${st.dir}`);
        if (st.saved !== l.code || st.lang !== l.code) throw new Error(`saved ${st.saved} / html lang ${st.lang}`);
        if (l.code === 'ur-Latn' && /[؀-ۿ]{2,}/.test(st.text.replace(/اردو/g, ''))) throw new Error('Urdu script in Roman Urdu');
        if ((await memberData(page)) !== before) throw new Error('member data changed');
        await page.screenshot({ path: path.join(SHOTS, `${vp.label}-${l.code}-home.png`) });
        for (const r of ['/discover', '/requests', '/biodata', '/notifications']) {
          await page.goto(BASE + r);
          await page.waitForTimeout(700);
          if (/Something went wrong/.test(await page.evaluate(() => document.body.innerText))) throw new Error('error screen on ' + r);
          await page.screenshot({ path: path.join(SHOTS, `${vp.label}-${l.code}${r.replace(/\//g, '-')}.png`) });
        }
      });
    }

    await step(`${vp.label}: validation messages in Roman Urdu`, async () => {
      await page.goto(BASE + '/settings');
      await page.getByRole('radio', { name: 'Urdu', exact: true }).first().click();
      await page.goto(BASE + '/biodata?step=0');
      const name = page.locator('input[aria-label="Poora naam"]').first();
      await name.waitFor({ timeout: 8000 });
      const old = await name.inputValue();
      await name.fill('A');
      await name.blur();
      await page.getByText('Poora naam likhiye').first().waitFor({ timeout: 5000 });
      await name.fill(old);
    });
    await ctx.close();
  }
  await browser.close();
  console.log(failed ? `LANGUAGES E2E FAILED (${failed})` : 'LANGUAGES E2E PASSED');
  process.exit(failed ? 1 : 0);
})();
