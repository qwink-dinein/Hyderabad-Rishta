import { pinLogin, type LoginDeps } from '../supabase/functions/pin-login/login';

/** The pin-login Edge Function core: validates input, lets the DB decide, issues a session only on ok. */
const DEVICE = '0b5c1e2a-3f4d-4a6b-9c8d-7e6f5a4b3c2d';
const SECRET = 'k'.repeat(64);
function fake(result: Record<string, unknown>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const minted: string[] = [];
  const deps: LoginDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      return result;
    },
    mintSession: async (userId) => {
      minted.push(userId);
      return { access_token: 'a', refresh_token: 'r', expires_in: 3600 };
    },
  };
  return { deps, calls, minted };
}
const body = (over: Record<string, unknown> = {}) => ({ countryCode: '+91', phone: '09888800001', deviceId: DEVICE, deviceSecret: SECRET, pin: '4827', ...over });

it('normalises the number and issues a session only when the database says ok', async () => {
  const f = fake({ ok: true, user_id: 'u1', phone: '+919888800001' });
  const r = await pinLogin(f.deps, body());
  expect(r.status).toBe(200);
  expect(f.calls[0].args).toMatchObject({ p_country_code: '+91', p_phone: '9888800001', p_pin: '4827' });
  expect(f.minted).toEqual(['u1']);
});

it.each([
  [{ ok: false, error: 'invalid_pin', attempts_left: 3 }, 401, { error: 'invalid_pin', attemptsLeft: 3 }],
  [{ ok: false, error: 'pin_locked', retry_at: '2026-10-28T10:00:00Z' }, 423, { error: 'pin_locked', retryAt: '2026-10-28T10:00:00Z' }],
  [{ ok: false, error: 'pin_locked', reset: true }, 423, { reset: true }],
  [{ ok: false, error: 'device_not_trusted' }, 401, { error: 'device_not_trusted' }],
  [{ ok: false, error: 'account_suspended' }, 403, { error: 'account_suspended' }],
])('refusal %j → %i, no session', async (db, status, shape) => {
  const f = fake(db);
  const r = await pinLogin(f.deps, body());
  expect(r.status).toBe(status);
  expect(r.body).toMatchObject(shape);
  expect(f.minted).toEqual([]);
});

it.each([
  ['bad PIN', { pin: '48a7' }],
  ['short PIN', { pin: '482' }],
  ['bad number', { phone: '12345' }],
  ['bad device id', { deviceId: 'x' }],
  ['short device key', { deviceSecret: 'short' }],
  ['huge device key', { deviceSecret: 'k'.repeat(5000) }],
])('rejects %s before touching the database', async (_n, over) => {
  const f = fake({ ok: true, user_id: 'u1' });
  const r = await pinLogin(f.deps, body(over));
  expect(r.status).toBe(400);
  expect(f.calls).toHaveLength(0);
});

it('garbage bodies are a 400, never a crash', async () => {
  for (const b of [null, 'x', 42, [], { pin: 4827 }]) expect((await pinLogin(fake({}).deps, b)).status).toBe(400);
});
