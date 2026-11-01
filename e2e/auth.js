// Shared sign-in for the e2e suites. /login is the member card (number always blank + PIN, 2026-11-01);
// "Log in with WhatsApp code" goes to the code flow. An OTP sign-in may be followed by "create your PIN".
const TEST_PIN = '4827';

async function setUpPinIfAsked(page, pin = TEST_PIN) {
  if (!new URL(page.url()).pathname.startsWith('/pin')) return;
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('pin-setup-input').fill(pin);
    await page.getByTestId('pin-continue').click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith('/pin'), { timeout: 10000 });
}

/** OTP sign-in (always works: new number, new browser, or an account without a PIN). */
async function loginWithOtp(page, base, phone, pin = TEST_PIN) {
  await page.goto(base + '/login');
  await page.getByTestId('whatsapp-login').click();
  await page.getByTestId('phone-input').fill(phone);
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456');
  await page.getByTestId('verify-otp').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login') && u.pathname !== '/', { timeout: 10000 });
  await setUpPinIfAsked(page, pin);
  // A brand-new member lands in the guided onboarding (/start/…, covered by e2e/onboarding.js); the older
  // suites exercise the full biodata form, so they continue there.
  if (new URL(page.url()).pathname.startsWith('/start/')) await page.goto(base + '/biodata');
}

module.exports = { loginWithOtp, setUpPinIfAsked, TEST_PIN };
