// UX states checklist (owner request 2026-11-01), in the real app (web build): offline banner and recovery,
// errors that say what went wrong and how to fix it, no-results suggestions, permission denied with a way
// back, unsaved biodata kept and restorable after the app is closed, inline validation as you type, and the
// success sheet (confirm → celebrate → next step).
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('✓', name);
    } catch (e) {
      errors.push(`${name}: ${e.message.split('\n')[0]}`);
      await page.screenshot({ path: `${SHOTS}/fail-states-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
    }
  };

  await loginWithOtp(page, BASE, '9000000001');

  await step('4. no internet: banner explains, content stays, "Back online" on reconnect', async () => {
    await page.goto(BASE + '/discover');
    await page.locator('[data-testid^="list-card-"]').first().waitFor({ timeout: 15000 });
    await context.setOffline(true);
    await page.getByTestId('offline-banner').getByText("You're offline").waitFor({ timeout: 5000 });
    if (!(await page.locator('[data-testid^="list-card-"]').count())) throw new Error('content disappeared while offline');
    await page.screenshot({ path: `${SHOTS}/st-1-offline.png` });
    await context.setOffline(false);
    await page.getByTestId('online-banner').getByText('Back online').waitFor({ timeout: 5000 });
  });

  await step('6. no search results: suggestions instead of a dead end', async () => {
    await page.getByTestId('discover-search').fill('zzzz-nobody');
    await page.getByTestId('discover-search').press('Enter');
    await page.getByTestId('no-results-suggestions').waitFor({ timeout: 10000 });
    await page.getByText('No profiles found for “zzzz-nobody”').waitFor();
    await page.getByText(/Try a different spelling/).waitFor();
    await page.getByText('Remove “zzzz-nobody”').click(); // suggestion removes the search
    await page.locator('[data-testid^="list-card-"]').first().waitFor({ timeout: 10000 });
  });

  await step('7. permission denied: a member opening the admin area is told why and taken back', async () => {
    await page.goto(BASE + '/admin');
    await page.getByText('The admin area is only for the Hyderabad Rishta team').waitFor({ timeout: 10000 });
    await page.waitForURL((u) => u.pathname === '/discover');
  });

  await step('9. validation: the mistake is flagged at the field as soon as it is edited', async () => {
    await page.goto(BASE + '/biodata?step=0');
    const name = page.getByLabel('Full name');
    await name.waitFor({ timeout: 10000 });
    await name.fill('A');
    await page.getByText('Please enter the full name').waitFor({ timeout: 3000 }); // before pressing Save & continue
    await name.fill('Arif Hussain');
    await page.waitForTimeout(300);
    if (await page.getByText('Please enter the full name').count()) throw new Error('error stayed after fixing it');
  });

  await step('8. unsaved biodata is kept on the phone and can be restored after the app is closed', async () => {
    await page.getByLabel('Full name').fill('Arif Hussain Restored');
    await page.waitForTimeout(1200); // kept on the phone after a short pause in typing
    await page.reload(); // app closed and opened again, nothing saved to the server
    await page.getByTestId('draft-restore').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/st-2-draft.png` });
    await page.getByTestId('draft-restore-btn').click();
    const value = await page.getByLabel('Full name').inputValue();
    if (value !== 'Arif Hussain Restored') throw new Error(`restored "${value}"`);
  });

  await step('10. success: sending an interest confirms, celebrates and offers the next step', async () => {
    await page.goto(BASE + '/discover');
    await page.getByTestId('discover-tab-all').click();
    const btn = page.locator('[data-testid^="card-express-"]').filter({ hasText: 'Send Interest' }).first();
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await page.waitForURL((u) => u.searchParams.get('express') === '1');
    // The interest form: introduce yourself, preview, then send.
    await page.getByTestId('connect-intro').click();
    await page.getByTestId('preview-request').click();
    await page.getByTestId('confirm-send').click();
    await page.getByTestId('success-sheet').getByText('Interest sent').waitFor({ timeout: 10000 });
    await page.getByTestId('success-secondary').getByText('View my requests').waitFor();
    await page.screenshot({ path: `${SHOTS}/st-3-success.png` });
    await page.getByTestId('success-primary').click();
    await page.getByTestId('success-sheet').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  });

  await step('99 % explained: the card names the exact field and opens the form right at it', async () => {
    // Clear one recommended field on the demo member (everything else filled) → stuck at 99 %.
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('hr.demo.db'));
      const p = d.profiles.find((x) => x.userId === 'u_demo');
      p.biodata.religion.namaz = undefined;
      if (!p.biodata.photos.length) p.biodata.photos = [{ id: 'e2ephoto1', uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==' }]; // a photo counts toward 100 % (2026-11-01)
      localStorage.setItem('hr.demo.db', JSON.stringify(d));
    });
    await page.goto(BASE + '/home');
    await page.getByTestId('completion-card').waitFor({ timeout: 10000 });
    await page.getByTestId('completion-next').getByText('Still missing: Namaz').waitFor();
    await page.getByTestId('completion-cta').click();
    await page.waitForURL((u) => u.pathname === '/biodata' && u.searchParams.get('step') === '3' && u.searchParams.get('focus') === 'namaz');
    const target = page.getByTestId('field-focus-target');
    await target.getByText('Namaz').waitFor({ timeout: 10000 });
    await target.getByText('Counts toward 100%').waitFor(); // not "optional"
    await page.waitForTimeout(900); // scrolled into view
    const box = await target.boundingBox();
    if (!box || box.y < 0 || box.y > 860) throw new Error(`field not on screen (y=${box && box.y})`);
    await page.screenshot({ path: `${SHOTS}/st-5-jump-to-field.png` });
    await target.getByText('Regularly').click();
    await page.getByTestId('wizard-percent').getByText('100%').waitFor({ timeout: 5000 });
  });

  await step('biodata progress: exact fields left per section, % rises as fields are filled', async () => {
    const p2 = await (await browser.newContext({ viewport: { width: 400, height: 860 } })).newPage();
    try {
      await loginWithOtp(p2, BASE, '9811110000'); // brand-new member → biodata form
      await p2.waitForURL((u) => u.pathname.startsWith('/biodata'), { timeout: 10000 });
      await p2.getByTestId('wizard-progress').waitFor();
      const pct = async () => Number((await p2.getByTestId('wizard-percent').innerText()).match(/\d+/)[0]);
      const left = p2.getByTestId('wizard-left');
      await left.getByText('Still needed to publish:').waitFor();
      await left.getByText(/Basic \(this step\)/).waitFor();
      await left.getByText(/Full name/).waitFor();
      await left.getByText(/Location/).waitFor(); // later sections are named too
      await p2.getByTestId('step-left-0').waitFor(); // "N left" on the section tab
      const before = await pct();
      await p2.getByLabel('Full name').fill('Arif Hussain');
      await p2.waitForFunction((b) => Number(document.querySelector('[data-testid="wizard-percent"]').innerText.match(/\d+/)[0]) > b, before, { timeout: 3000 });
      const text = await left.innerText();
      if (/Full name/.test(text)) throw new Error('filled field still listed as needed');
      await p2.screenshot({ path: `${SHOTS}/st-4-progress.png` });
    } finally {
      await p2.close();
    }
  });

  await browser.close();
  if (errors.length) {
    console.log('STATES E2E FAILED:\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('STATES E2E PASSED');
})();
