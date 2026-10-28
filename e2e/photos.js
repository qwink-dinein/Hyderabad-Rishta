// Photo uploads (owner request 2026-10-28): originals up to 5 MB accepted and compressed on the device;
// larger files and non-photos (svg can carry scripts) refused with a clear message.
const { chromium } = require('playwright');
const SHOTS = process.argv[2] || require('path').join(__dirname, 'screenshots');
require('fs').mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:8081';
const errors = [];
const step = async (name, fn) => {
  try { await fn(); console.log('✓', name); }
  catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(name); }
};
/** A noisy JPEG (noise defeats compression) of roughly `target` bytes, made in the browser. */
const noisyJpeg = (page, side) =>
  page.evaluate(async (n) => {
    const c = document.createElement('canvas');
    c.width = n; c.height = n;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0;
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, side);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(BASE + '/login');
  await page.getByTestId('phone-input').fill('9876500888');
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456');
  await page.getByTestId('verify-otp').click();
  await page.getByTestId('photo-slot-1').waitFor({ timeout: 15000 });

  const upload = async (slot, file) => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId(`photo-slot-${slot}`).click();
    await (await chooser).setFiles(file);
  };
  const big = Buffer.from(await noisyJpeg(page, 2400), 'base64');
  const huge = Buffer.from(await noisyJpeg(page, 2800), 'base64');
  console.log(`  test files: ${(big.length / 1048576).toFixed(1)} MB and ${(huge.length / 1048576).toFixed(1)} MB`);

  await step('a 4.5 MB photo (old limit was 1.5 MB) is accepted and shrunk', async () => {
    if (big.length <= 4 * 1048576 || big.length >= 5 * 1048576) throw new Error(`fixture size ${big.length}`);
    await upload(1, { name: 'wedding.jpg', mimeType: 'image/jpeg', buffer: big });
    await page.getByRole('button', { name: /Replace: Main photo/ }).waitFor({ timeout: 20000 });
    const src = await page.locator('img').evaluateAll((els) => els.map((e) => e.src).find((s) => s.startsWith('data:image/jpeg')) || '');
    const stored = Math.floor((src.length - src.indexOf(',') - 1) * 0.75);
    console.log(`  stored after compression: ${(stored / 1024).toFixed(0)} KB (picked ${(big.length / 1024).toFixed(0)} KB)`);
    if (!stored || stored > 1.5 * 1048576) throw new Error(`stored ${stored} bytes`);
    await page.screenshot({ path: `${SHOTS}/90-photo-accepted.png` });
  });
  await step('a photo over 5 MB is refused with a clear message', async () => {
    if (huge.length <= 5 * 1048576) throw new Error(`fixture size ${huge.length}`);
    await upload(2, { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: huge });
    await page.getByText('under 5 MB').waitFor({ timeout: 10000 });
    await page.screenshot({ path: `${SHOTS}/91-photo-too-large.png` });
  });
  await step('an SVG (can carry scripts) is refused', async () => {
    await upload(2, { name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
    await page.getByText('Please choose a JPG, PNG, WEBP or HEIC photo.').waitFor({ timeout: 10000 });
  });

  await browser.close();
  const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (real.length) { console.log('FAILURES:', real); process.exit(1); }
  console.log('PHOTO E2E PASSED');
})();
