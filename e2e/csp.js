// Security headers: the build must run under the production CSP (public/_headers, applied by
// e2e/serve.js) with zero violations, and must refuse to be framed (clickjacking).
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const BASE = 'http://localhost:8081';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const bad = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) bad.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
  const res = await page.goto(BASE + '/');
  const h = res.headers();
  for (const k of ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) if (!h[k]) bad.push(`missing header ${k}`);
  if (!/frame-ancestors 'none'/.test(h['content-security-policy'] || '')) bad.push('CSP allows framing');
  if (/unsafe-eval/.test(h['content-security-policy'] || '')) bad.push('CSP allows eval');
  await loginWithOtp(page, BASE, '9000000001');
  for (const r of ['/home', '/discover', '/boost', '/requests', '/dashboard', '/profile/p_2', '/settings', '/biodata?step=3', '/biodata/preview', '/notifications']) {
    await page.goto(BASE + r);
    await page.waitForTimeout(700);
  }
  // An injected inline script must not run.
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__pwned = 1';
    document.body.appendChild(s);
    return !!window.__pwned;
  });
  if (ran) bad.push('inline script executed');
  else bad.splice(0, bad.length, ...bad.filter((x) => !/inline script/i.test(x))); // that refusal is the point
  await browser.close();
  if (bad.length) {
    console.log('CSP FAILURES:', bad);
    process.exit(1);
  }
  console.log('CSP PASSED');
})();
