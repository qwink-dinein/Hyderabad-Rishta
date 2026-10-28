// Screen transitions (owner request 2026-10-28): every move to another screen animates smoothly.
// Samples the page during navigation and checks that screens fade/rise (stack) or shift (tabs)
// in over a few hundred ms — never a hard cut — and settle fully.
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
/** Records, every animation frame for `ms`, the lowest opacity and largest offset of any moving wrapper. */
const sample = (page, ms) =>
  page.evaluate((ms) => new Promise((resolve) => {
    const out = { frames: 0, minOpacity: 1, maxShift: 0, maxRise: 0 };
    const t0 = performance.now();
    const tick = () => {
      out.frames++;
      for (const el of document.querySelectorAll('[style*="opacity"], [style*="transform"]')) {
        const st = el.style;
        const o = parseFloat(st.opacity);
        if (!Number.isNaN(o) && el.getBoundingClientRect().height > 300) out.minOpacity = Math.min(out.minOpacity, o);
        const mx = /translateX\(([-\d.]+)px\)/.exec(st.transform);
        const my = /translateY\(([-\d.]+)px\)/.exec(st.transform);
        if (mx && el.getBoundingClientRect().height > 300) out.maxShift = Math.max(out.maxShift, Math.abs(+mx[1]));
        if (my && el.getBoundingClientRect().height > 300) out.maxRise = Math.max(out.maxRise, Math.abs(+my[1]));
      }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick); else resolve(out);
    };
    requestAnimationFrame(tick);
  }), ms);
const settled = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[style*="opacity"]')].filter((el) => el.getBoundingClientRect().height > 300 && el.offsetParent !== null).every((el) => parseFloat(el.style.opacity) > 0.99 || parseFloat(el.style.opacity) === 0));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await loginWithOtp(page, BASE, '9000000001');
  await page.waitForURL((u) => u.pathname.startsWith('/home'));
  await page.waitForTimeout(800);

  await step('opening a screen (Home → Notifications) fades and rises in', async () => {
    const s = sample(page, 700);
    await page.getByTestId('bell').click();
    const r = await s;
    if (r.minOpacity > 0.6) throw new Error(`no fade seen (min opacity ${r.minOpacity})`);
    if (r.maxRise < 4) throw new Error(`no rise seen (${r.maxRise}px)`);
    await page.waitForTimeout(300);
    if (!(await settled(page))) throw new Error('screen did not settle to full opacity');
  });
  await step('going back animates too', async () => {
    const s = sample(page, 700);
    await page.goBack();
    const r = await s;
    if (r.minOpacity > 0.6) throw new Error(`no fade on back (min opacity ${r.minOpacity})`);
  });
  await step('switching tabs (Home → Discover) shifts smoothly', async () => {
    await page.waitForTimeout(500);
    const s = sample(page, 600);
    await page.getByRole('tab', { name: /Discover/ }).click();
    const r = await s;
    if (r.maxShift < 4 && r.minOpacity > 0.6) throw new Error(`no tab motion (shift ${r.maxShift}px, opacity ${r.minOpacity})`);
  });
  await step('filmstrip of a transition (for the record)', async () => {
    await page.waitForTimeout(500);
    await page.goto(BASE + '/home');
    await page.waitForTimeout(900);
    await page.getByTestId('bell').click();
    for (const [i, t] of [[0, 40], [1, 90], [2, 140], [3, 400]]) {
      await page.waitForTimeout(t - (i ? [40, 90, 140, 400][i - 1] : 0));
      await page.screenshot({ path: `${SHOTS}/t${i}-transition.png` });
    }
  });
  await step('Reduce Motion: a quick fade only, no movement', async () => {
    const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await loginWithOtp(p, BASE, '9000000001');
    await p.waitForURL((u) => u.pathname.startsWith('/home'));
    await p.waitForTimeout(800);
    const s = sample(p, 500);
    await p.getByTestId('bell').click();
    const r = await s;
    if (r.maxRise > 1) throw new Error(`moved ${r.maxRise}px despite Reduce Motion`);
    await ctx.close();
  });

  await browser.close();
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (real.length) { console.log('FAILURES:', real); process.exit(1); }
  console.log('TRANSITIONS E2E PASSED');
})();
