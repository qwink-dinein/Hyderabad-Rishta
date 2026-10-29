// QA crawler: visits EVERY screen as every role, in English and Urdu (RTL), at phone widths, and
// reports: page crashes, console errors, error screens, horizontal overflow, controls without an
// accessible name, and touch targets that are too small. `node e2e/crawl.js [--strict]`
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8081';
const SHOTS = path.join(__dirname, 'screenshots', 'crawl');
fs.mkdirSync(SHOTS, { recursive: true });
const STRICT = process.argv.includes('--strict');

const PUBLIC = ['/', '/language', '/login', '/login?next=biodata', '/recover', '/legal/privacy', '/legal/terms', '/legal/help', '/does-not-exist'];
const MEMBER = ['/home', '/discover', '/boost', '/requests', '/dashboard', '/shortlist', '/activity', '/notifications', '/settings', '/filters', '/profile/p_2', '/profile/p_4', '/request/p_8', '/biodata', '/biodata?step=3', '/biodata/preview', '/pin?mode=change&next=/settings'];
const ADMIN = ['/admin', '/admin/search', '/admin/alerts', '/admin/profiles', '/admin/users', '/admin/requests', '/admin/reports', '/admin/announcements', '/admin/pricing', '/admin/orders', '/admin/trash', '/admin/audit', '/admin/team', '/admin/member/u_2', '/settings', '/notifications'];
const ROLES = [
  { name: 'visitor', phone: null, routes: PUBLIC },
  { name: 'new-member', phone: '9812300001', routes: ['/home', '/discover', '/boost', '/requests', '/dashboard', '/shortlist', '/settings', '/biodata'] },
  { name: 'member', phone: '9000000001', routes: MEMBER },
  { name: 'master', phone: '9000000000', routes: ADMIN },
  { name: 'sub-admin', phone: '9000000009', routes: ['/admin', '/admin/team', '/admin/pricing', '/admin/trash', '/admin/member/u_2'] },
];
const WIDTHS = [360, 320];
const LANGS = ['en', 'ur'];

const issues = [];
const add = (sev, role, lang, width, route, kind, detail) => issues.push({ sev, role, lang, width, route, kind, detail });

async function audit(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && el.offsetParent !== null;
    };
    const out = { overflow: 0, unnamed: [], small: [], errorScreen: false };
    out.overflow = document.documentElement.scrollWidth - window.innerWidth;
    out.errorScreen = /Something went wrong|This screen doesn't exist/i.test(document.body.innerText);
    const ctrls = [...document.querySelectorAll('[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio],button,a[href],input,textarea,select')].filter(vis);
    for (const el of ctrls) {
      const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || '').trim();
      const tag = `${el.getAttribute('role') || el.tagName.toLowerCase()}${el.dataset.testid ? '#' + el.dataset.testid : ''}`;
      if (!name && !(el.tagName === 'INPUT' && el.style.opacity && +el.style.opacity < 0.1)) out.unnamed.push(tag + ' ' + el.outerHTML.slice(0, 120));
      const r = el.getBoundingClientRect();
      // Inline text links inside a paragraph are exempt (WCAG 2.5.8 inline exception).
      const inline = getComputedStyle(el).display === 'inline' || (el.getAttribute('role') === 'link' && el.closest('[dir]') && el.parentElement && el.parentElement.innerText.length > (el.innerText || '').length + 5);
      if (!inline && (r.width < 24 || r.height < 24) && el.tagName !== 'INPUT') out.small.push(`${tag} "${name.slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch();
  for (const role of ROLES) {
    for (const lang of LANGS) {
      const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
      const page = await ctx.newPage();
      let current = '';
      page.on('pageerror', (e) => add('high', role.name, lang, 0, current, 'pageerror', e.message.slice(0, 200)));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) add('high', role.name, lang, 0, current, 'console', m.text().slice(0, 200));
      });
      await page.goto(BASE + '/');
      await page.evaluate((l) => {
        try {
          localStorage.setItem('hr.lang', l);
        } catch {}
      }, lang);
      if (role.phone) await loginWithOtp(page, BASE, role.phone);
      if (lang === 'ur') {
        await page.goto(BASE + '/settings');
        const ur = page.getByRole('button', { name: 'اردو' }).first();
        if (await ur.count()) await ur.click().catch(() => undefined);
        else {
          const sw = page.getByText('اردو').first();
          if (await sw.count()) await sw.click().catch(() => undefined);
        }
        await page.waitForTimeout(400);
      }
      for (const route of role.routes) {
        for (const w of WIDTHS) {
          current = route;
          await page.setViewportSize({ width: w, height: 780 });
          await page.goto(BASE + route);
          await page.waitForTimeout(900);
          const a = await audit(page);
          if (a.errorScreen && route !== '/does-not-exist') add('high', role.name, lang, w, route, 'error-screen', 'shows an error screen');
          if (a.overflow > 1) add('high', role.name, lang, w, route, 'overflow', `${a.overflow}px wider than the screen`);
          for (const u of a.unnamed) add('med', role.name, lang, w, route, 'unnamed-control', u);
          for (const s of a.small) add('low', role.name, lang, w, route, 'small-target', s);
          if (w === 360) await page.screenshot({ path: path.join(SHOTS, `${role.name}-${lang}${route.replace(/[/?&=]/g, '_')}.png`), fullPage: true });
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
  // De-duplicate (same issue at both widths / many routes) for the summary.
  const key = (i) => `${i.kind}|${i.detail}`;
  const grouped = {};
  for (const i of issues) (grouped[key(i)] ??= { ...i, where: new Set() }).where.add(`${i.role}/${i.lang}/${i.width}:${i.route}`);
  const list = Object.values(grouped).sort((a, b) => ({ high: 0, med: 1, low: 2 })[a.sev] - ({ high: 0, med: 1, low: 2 })[b.sev]);
  fs.writeFileSync(path.join(SHOTS, 'report.json'), JSON.stringify(list.map((g) => ({ ...g, where: [...g.where] })), null, 2));
  for (const g of list) console.log(`[${g.sev}] ${g.kind}: ${g.detail}  (${g.where.size}× e.g. ${[...g.where][0]})`);
  const high = list.filter((g) => g.sev === 'high').length;
  const med = list.filter((g) => g.sev === 'med').length;
  console.log(`\nCRAWL: ${list.length} distinct issues (high ${high}, med ${med}, low ${list.length - high - med})`);
  if (high || (STRICT && med)) process.exit(1);
  console.log('CRAWL PASSED');
})();
