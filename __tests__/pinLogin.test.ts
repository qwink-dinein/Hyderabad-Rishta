import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { afterWrongPin, cleanPin, PIN_OTP_WINDOW_MS, PIN_SOFT_LOCK_MS, pinProblem, SESSION_IDLE_MS, type PinAttemptState } from '@/domain/auth';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS, type DemoDb } from '@/services/demo/demoBackend';
import { memoryKV, type KV } from '@/services/storage';

/** Mini PRD 2026-10-28: OTP registration + 4-digit PIN login, sessions that last until logout. */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);

/** One "server" (shared storage) and any number of phones (each with its own secure storage). */
function world() {
  const server = memoryKV();
  let otpsSent = 0;
  const phone = (secure: KV = memoryKV()) => {
    const b = new DemoBackend({ storage: server, secure, now });
    const requestOtp = b.requestOtp.bind(b);
    b.requestOtp = (cc, p) => {
      otpsSent++;
      return requestOtp(cc, p);
    };
    return { b, secure, restart: () => phone(secure) };
  };
  return { server, phone, otps: () => otpsSent };
}
async function otpLogin(b: DemoBackend, num: string) {
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp('+91', num);
  return b.verifyOtp('+91', num, DEMO_OTP);
}
async function code(p: Promise<unknown>, c: string) {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(c);
  return e as AppError;
}
const NEW = '9666600001';

describe('PIN rules', () => {
  it('needs exactly 4 digits and refuses PINs anyone would guess', () => {
    expect(pinProblem('4827')).toBeNull();
    expect(pinProblem('0591')).toBeNull();
    for (const p of ['123', '12345', 'abcd', '12a4']) expect(pinProblem(p)).toBe('pin.mustBe4');
    for (const p of ['0000', '1111', '1234', '4321', '3456', '9876', '2580', '1212']) expect(pinProblem(p)).toBe('pin.tooEasy');
  });
  it('accepts paste and typing alike', () => {
    expect(cleanPin('48 27')).toBe('4827');
    expect(cleanPin('4827999')).toBe('4827');
    expect(cleanPin('PIN: 4-8-2-7')).toBe('4827');
  });
  it('locks briefly after 5 wrong PINs and fully after 10 in a day', () => {
    let s: PinAttemptState = { streak: 0, recent: [] };
    for (let i = 0; i < 4; i++) s = afterWrongPin(s, 1000 + i);
    expect(s.lockedUntil).toBeUndefined();
    s = afterWrongPin(s, 2000);
    expect(s.lockedUntil).toBe(2000 + PIN_SOFT_LOCK_MS);
    for (let i = 0; i < 5; i++) s = afterWrongPin(s, 3000 + i);
    expect(s.hardLocked).toBe(true);
  });
});

describe('1. First-time registration', () => {
  it('OTP → create PIN → stays logged in, next screen is biodata', async () => {
    const w = world();
    const { b } = w.phone();
    const r = await otpLogin(b, NEW);
    expect(r.isNew).toBe(true);
    expect(r.needsPin).toBe(true);
    const u = await b.setPin('4827');
    expect(u.hasPin).toBe(true);
    expect((await b.getSession())!.id).toBe(r.user.id);
    expect(w.otps()).toBe(1);
  });
  it('the PIN is never stored in plain text', async () => {
    const w = world();
    const { b } = w.phone();
    await otpLogin(b, NEW);
    await b.setPin('4827');
    const raw = (await w.server.getItem('hr.demo.db'))!;
    const db = JSON.parse(raw) as DemoDb;
    expect(db.pins[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(raw.includes('"4827"')).toBe(false);
    // Session tokens are stored only as hashes on the server, too.
    const local = JSON.parse((await w.phone().secure.getItem('hr.auth')) ?? '{}');
    expect(local.token).toBeUndefined(); // a different phone has nothing
  });
  it('rejects weak PINs with a clear reason', async () => {
    const { b } = world().phone();
    await otpLogin(b, NEW);
    const e = await code(b.setPin('1234'), 'validation');
    expect(e.message).toBe('pin.tooEasy');
  });
});

describe('2. Returning login with PIN (no OTP)', () => {
  async function registered() {
    const w = world();
    const p = w.phone();
    await otpLogin(p.b, NEW);
    await p.b.setPin('4827');
    await p.b.logout();
    return { w, p };
  }

  it('prefills the number and logs in with the right PIN — no OTP sent', async () => {
    const { w, p } = await registered();
    const sent = w.otps();
    expect(await p.b.getSession()).toBeNull();
    expect(await p.b.getLoginHint()).toEqual({ countryCode: '+91', phone: NEW, canUsePin: true });
    const r = await p.b.pinLogin('+91', NEW, '4827');
    expect(r.user.phone).toBe(NEW);
    expect(await p.b.getSession()).not.toBeNull();
    expect(w.otps()).toBe(sent);
  });

  it('a wrong PIN shows attempts left; 5 in a row lock it for 15 minutes (server-side, survives restart)', async () => {
    const { p } = await registered();
    const e1 = await code(p.b.pinLogin('+91', NEW, '0000'), 'invalid_pin');
    expect(e1.details?.attemptsLeft).toBe(4);
    for (let i = 0; i < 3; i++) await code(p.b.pinLogin('+91', NEW, '1111'), 'invalid_pin');
    const restarted = p.restart(); // counters were saved, a restart doesn't reset them
    const locked = await code(restarted.b.pinLogin('+91', NEW, '2222'), 'pin_locked');
    expect(locked.details?.retryAt).toBeTruthy();
    await code(restarted.b.pinLogin('+91', NEW, '4827'), 'pin_locked'); // even the right PIN waits
    advance(PIN_SOFT_LOCK_MS + 1000);
    await restarted.b.pinLogin('+91', NEW, '4827');
  });

  it('10 wrong PINs in a day: only Forgot PIN (OTP) unlocks', async () => {
    const { p } = await registered();
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < 5; i++) await p.b.pinLogin('+91', NEW, '0000').catch(() => undefined);
      advance(PIN_SOFT_LOCK_MS + 1000);
    }
    const e = await code(p.b.pinLogin('+91', NEW, '4827'), 'pin_locked');
    expect(e.details?.reset).toBe(true);
    advance(6 * 3600_000);
    await code(p.b.pinLogin('+91', NEW, '4827'), 'pin_locked');
    await otpLogin(p.b, NEW); // Forgot PIN
    await p.b.setPin('5931');
    await p.b.logout();
    await p.b.pinLogin('+91', NEW, '5931');
  });

  it('the PIN alone is not enough: another phone must verify by OTP', async () => {
    const { w } = await registered();
    const other = w.phone();
    await code(other.b.pinLogin('+91', NEW, '4827'), 'device_not_trusted');
    // Unknown numbers look identical (no account probing).
    await code(other.b.pinLogin('+91', '9666600999', '4827'), 'device_not_trusted');
    await otpLogin(other.b, NEW);
    expect((await other.b.getSession())!.hasPin).toBe(true); // returning user: no PIN setup, no biodata redo
  });

  it('the same number typed differently still works', async () => {
    const { p } = await registered();
    await p.b.pinLogin('+91', `0${NEW}`, '4827');
  });

  it('a suspended account cannot log in with the PIN', async () => {
    const { w, p } = await registered();
    await p.b.pinLogin('+91', NEW, '4827');
    const uid = (await p.b.getSession())!.id;
    await p.b.logout();
    const admin = w.phone();
    await otpLogin(admin.b, DEMO_ADMIN_PHONE);
    await admin.b.adminSetUserDeactivated(uid, true);
    await code(p.restart().b.pinLogin('+91', NEW, '4827'), 'account_suspended');
  });
});

describe('3. Forgot PIN', () => {
  it('OTP → new PIN → logged in; every other phone is signed out', async () => {
    const w = world();
    const a = w.phone();
    await otpLogin(a.b, NEW);
    await a.b.setPin('4827');
    const bPhone = w.phone();
    await otpLogin(bPhone.b, NEW); // second phone, already signed in
    expect(await bPhone.b.getSession()).not.toBeNull();
    // Phone A forgot the PIN.
    await a.b.logout();
    await otpLogin(a.b, NEW);
    await a.b.setPin('6203');
    expect(await a.b.getSession()).not.toBeNull();
    expect(await bPhone.restart().b.getSession()).toBeNull(); // revoked
    await a.b.logout();
    await code(a.b.pinLogin('+91', NEW, '4827'), 'invalid_pin'); // old PIN is dead
    await a.b.pinLogin('+91', NEW, '6203');
  });

  it('the OTP allows ONE PIN change, within 10 minutes', async () => {
    const { b } = world().phone();
    await otpLogin(b, NEW);
    await b.setPin('4827');
    await code(b.setPin('5931'), 'otp_required'); // needs the current PIN now
    await b.setPin('5931', '4827'); // change with current PIN
    await otpLogin(b, NEW);
    advance(PIN_OTP_WINDOW_MS + 1000);
    await code(b.setPin('7140'), 'otp_required');
  });

  it('changing the PIN with a wrong current PIN counts towards the lock', async () => {
    const { b } = world().phone();
    await otpLogin(b, NEW);
    await b.setPin('4827');
    const e = await code(b.setPin('5931', '0000'), 'invalid_pin');
    expect(e.details?.attemptsLeft).toBe(4);
  });
});

describe('4. Staying logged in', () => {
  it('survives app restarts without OTP or PIN', async () => {
    const w = world();
    const p = w.phone();
    await otpLogin(p.b, NEW);
    await p.b.setPin('4827');
    for (let i = 0; i < 3; i++) {
      advance(30 * 86400000);
      expect((await p.restart().b.getSession())!.phone).toBe(NEW);
    }
  });

  it('logout revokes the session on the server; the old token is useless', async () => {
    const w = world();
    const p = w.phone();
    await otpLogin(p.b, NEW);
    const stolen = await p.secure.getItem('hr.auth');
    await p.b.logout();
    const thief = w.phone(memoryKV({ 'hr.auth': stolen! }));
    expect(await thief.b.getSession()).toBeNull();
  });

  it('a session unused for 180 days expires (security policy)', async () => {
    const w = world();
    const p = w.phone();
    await otpLogin(p.b, NEW);
    advance(SESSION_IDLE_MS + 86400000);
    expect(await p.restart().b.getSession()).toBeNull();
  });

  it('suspension and admin deletion revoke sessions immediately', async () => {
    const w = world();
    const m = w.phone();
    const r = await otpLogin(m.b, NEW);
    const admin = w.phone();
    await otpLogin(admin.b, DEMO_ADMIN_PHONE);
    await admin.b.adminSetUserDeactivated(r.user.id, true);
    expect(await m.restart().b.getSession()).toBeNull();
    await admin.b.adminSetUserDeactivated(r.user.id, false);
    expect(await m.restart().b.getSession()).toBeNull(); // must sign in again
  });
});

describe('Migration: accounts from before PIN login', () => {
  it('a member signed in before the update stays signed in, then sets a PIN after verifying by OTP', async () => {
    const server = memoryKV();
    const first = new DemoBackend({ storage: server, now });
    await first.getPricing(); // creates the store
    const db = JSON.parse((await server.getItem('hr.demo.db'))!) as DemoDb;
    db.sessionUserId = 'u_demo';
    delete (db as Partial<DemoDb>).sessions;
    delete (db as Partial<DemoDb>).devices;
    delete (db as Partial<DemoDb>).pins;
    await server.setItem('hr.demo.db', JSON.stringify(db));

    const phone = new DemoBackend({ storage: server, secure: memoryKV(), now });
    const me = await phone.getSession();
    expect(me!.id).toBe('u_demo');
    expect(me!.hasPin).toBe(false);
    expect((await phone.getMyProfile())!.id).toBe('p_1'); // nothing lost
    await code(phone.setPin('4827'), 'otp_required'); // must prove the number first
    await otpLogin(phone, DEMO_USER_PHONE);
    await phone.setPin('4827');
    await phone.logout();
    await phone.pinLogin('+91', DEMO_USER_PHONE, '4827');
  });
});
