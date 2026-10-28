// Shared sign-in for the e2e suites. With PIN login (2026-10-28) an OTP sign-in may be followed by
// "create your PIN", and the login screen may open in PIN mode for a number used before on this browser.
const TEST_PIN = '4827';

async function setUpPinIfAsked(page, pin = TEST_PIN) {
  if (!new URL(page.url()).pathname.startsWith('/pin')) return;
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('pin-setup-input').fill(pin);
    await page.getByTestId('pin-continue').click();
  }
  await page.waitForURL((u) => !u.pathname.startsWith('/pin'), { timeout: 10000 });
}

/** OTP sign-in (always works: new number, new browser, or "Use a different number"). */
async function loginWithOtp(page, base, phone, pin = TEST_PIN) {
  await page.goto(base + '/login');
  const phoneInput = page.getByTestId('phone-input');
  const pinInput = page.getByTestId('pin-input');
  await Promise.race([phoneInput.waitFor({ timeout: 10000 }), pinInput.waitFor({ timeout: 10000 })]);
  if (await pinInput.isVisible()) await page.getByTestId('other-number').click();
  await phoneInput.fill(phone);
  await page.getByTestId('send-otp').click();
  await page.getByTestId('otp-input').fill('123456');
  await page.getByTestId('verify-otp').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 });
  await setUpPinIfAsked(page, pin);
}

module.exports = { loginWithOtp, setUpPinIfAsked, TEST_PIN };
