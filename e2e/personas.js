// Owner spec 2026-10-29: no photo → the default Hyderabadi bride/groom portrait (never initials),
// chosen by the PROFILE's type; an uploaded photo wins; removing it restores the portrait.
const { chromium } = require('playwright');
const { loginWithOtp } = require('./auth');
const SHOTS = require('path').join(__dirname, 'screenshots');
const BASE = 'http://localhost:8081';
// 1×1 JPEG
const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const portraitLoaded = (page, kind) =>
    page.waitForFunction((k) => [...document.querySelectorAll(`[data-testid="persona-${k}"] img`)].some((i) => i.complete && i.naturalWidth > 0), kind, { timeout: 10000 });
  for (const [phone, want, name] of [['9000000001', 'bride', 'groom-viewer'], ['9000000102', 'groom', 'bride-viewer']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.on('pageerror', (e) => errors.push(e.message));
    await loginWithOtp(page, BASE, phone);
    await page.goto(BASE + '/discover');
    await portraitLoaded(page, want);
    if (await page.getByTestId(`persona-${want === 'bride' ? 'groom' : 'bride'}`).count()) errors.push(`${name}: wrong portrait on Discover`);
    await page.screenshot({ path: `${SHOTS}/persona-${name}-discover.png` });
    await page.goto(BASE + '/requests');
    await page.waitForTimeout(1200);
    if (await page.getByTestId(`persona-${want}`).count()) await portraitLoaded(page, want); // this member may have no requests
    await page.screenshot({ path: `${SHOTS}/persona-${name}-requests.png` });
    await page.close();
  }
  // Uploaded photo wins; removing it restores the portrait (own profile preview, groom u_demo/p_1).
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await loginWithOtp(page, BASE, '9000000001');
  const setPhotos = (photos) =>
    page.evaluate((ph) => {
      const db = JSON.parse(localStorage.getItem('hr.demo.db'));
      const b = db.profiles.find((p) => p.id === 'p_1').biodata;
      b.photos = ph;
      b.privacy.photoVisibility = 'public'; // the preview shows what others see
      localStorage.setItem('hr.demo.db', JSON.stringify(db));
    }, photos);
  await setPhotos([{ id: 'ph1', uri: PHOTO }]);
  await page.goto(BASE + '/biodata/preview');
  await page.waitForFunction(() => [...document.querySelectorAll('img')].some((i) => i.src.startsWith('data:image/jpeg')), null, { timeout: 10000 });
  if (await page.getByTestId('persona-groom').count()) errors.push('portrait shown although a photo exists');
  await setPhotos([]);
  await page.goto(BASE + '/biodata/preview');
  await portraitLoaded(page, 'groom');
  await page.screenshot({ path: `${SHOTS}/persona-own-preview.png` });
  await browser.close();
  if (errors.length) { console.log('FAIL', errors); process.exit(1); }
  console.log('PERSONAS E2E PASSED');
})();
