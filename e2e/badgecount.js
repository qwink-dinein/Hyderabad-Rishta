// Owner check 2026-10-29: "whenever someone sends a request to a user, the Requests icon in the tab bar
// shows 1/2/3/4 based on how many she received". Four members send interest to one member, one after
// another (same browser = same demo server); after each, the receiver's Requests tab shows the new count.
// Answering one brings it back down.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';
const RECEIVER = { phone: '9000000105', profile: 'p_5' };
const SENDERS = ['9000000102', '9000000108', '9000000110', '9000000114'];

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const logout = async () => {
    await page.goto(BASE + '/settings');
    await page.getByTestId('logout').click();
    await page.getByTestId('cta-find').waitFor();
  };
  const badge = async (expected) => {
    // The tab's accessible name carries the count ("Requests, 3 new interests"); the visible badge shows the number.
    await page.waitForFunction(
      (n) => {
        const tab = document.querySelector('[role="tab"][aria-label^="Requests"]');
        const m = (tab?.innerText || '').match(/^\s*(\d+)/);
        if (n === 0) return !m;
        if (!m || Number(m[1]) !== n) return false;
        // Visible, not just in the page: the red badge has finished its pop-in animation (full size).
        const el = [...tab.querySelectorAll('div')].find((d) => d.children.length === 0 && d.textContent.trim() === String(n));
        const r = el?.getBoundingClientRect();
        return !!r && r.width >= 16 && r.height >= 16 && getComputedStyle(el).opacity === '1';
      },
      expected,
      { timeout: 8000 },
    );
  };
  try {
    for (let i = 0; i < SENDERS.length; i++) {
      await loginWithOtp(page, BASE, SENDERS[i]);
      await page.goto(BASE + '/profile/' + RECEIVER.profile);
      await page.getByTestId('express-interest').click();
      await page.getByTestId('connect-intro').click();
      await page.getByTestId('preview-request').click();
      await page.getByTestId('confirm-send').click();
      await page.waitForURL((u) => u.pathname === '/profile/' + RECEIVER.profile, { waitUntil: 'commit' });
      await page.getByTestId('interest-sent').waitFor();
      await logout();
      await loginWithOtp(page, BASE, RECEIVER.phone);
      await badge(i + 1);
      await page.screenshot({ path: `${SHOTS}/badge-${i + 1}.png` });
      console.log(`✓ after ${i + 1} interest(s) the receiver's Requests tab shows ${i + 1}`);
      await logout();
    }
    // Answering one interest lowers the count at once.
    await loginWithOtp(page, BASE, RECEIVER.phone);
    await page.goto(BASE + '/requests');
    await page.getByRole('button', { name: /^Accept/ }).first().click();
    await badge(3);
    console.log('✓ accepting one brings the badge back to 3');
  } catch (e) {
    errors.push(e.message.split('\n')[0]);
    await page.screenshot({ path: `${SHOTS}/fail-badgecount.png` }).catch(() => undefined);
  }
  await browser.close();
  if (errors.length) {
    console.log('BADGE COUNT E2E FAILED:', errors.join(' | '));
    process.exit(1);
  }
  console.log('BADGE COUNT E2E PASSED');
})();
