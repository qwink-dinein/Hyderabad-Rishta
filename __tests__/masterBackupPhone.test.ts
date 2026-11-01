import { createHmac } from 'crypto';
import { backupPhone, type BackupDeps } from '../supabase/functions/master-backup-phone/backup';

/** Task #35: master backup phone on the live backend — own WhatsApp code, never signs the number in. */
function harness(o: { caller?: string | null; waplifyStatus?: number; rpcError?: { message: string; hint?: string }; verifyOk?: boolean } = {}) {
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const sends: { url: string; body: Record<string, unknown> }[] = [];
  const deps: BackupDeps = {
    caller: async (jwt) => (jwt ? (o.caller === undefined ? 'master-1' : o.caller) : null),
    rpc: async (fn, args) => {
      rpcs.push({ fn, args });
      if (o.rpcError) throw Object.assign(new Error(o.rpcError.message), { hint: o.rpcError.hint });
      return fn === 'backup_code_verify' ? (o.verifyOk ?? true) : null;
    },
    hmac: async (m) => createHmac('sha256', 'server-secret').update(m).digest('hex'),
    newCode: () => '482913',
    waplify: { apiKey: 'wapl_test', templateName: 'hr_login_otp', codeKeys: ['1'] },
    send: {
      fetch: async (url, init) => {
        sends.push({ url, body: JSON.parse(init.body) });
        const status = o.waplifyStatus ?? 200;
        return { status, headers: { get: () => null }, json: async () => (status === 200 ? { status: 'success' } : { status: 'error' }) };
      },
    },
  };
  return { deps, rpcs, sends };
}
const hash = (code: string, num = '+919876543210') => createHmac('sha256', 'server-secret').update(`backup:master-1:${num}:${code}`).digest('hex');

it('send: stores only a keyed hash and delivers the code on WhatsApp to the normalised number', async () => {
  const h = harness();
  const r = await backupPhone(h.deps, 'jwt', { action: 'send', countryCode: '+91', phone: '098765 43210' });
  expect(r).toEqual({ status: 200, body: { sent: true } });
  expect(h.rpcs[0]).toEqual({ fn: 'backup_code_issue', args: { p_master: 'master-1', p_cc: '+91', p_phone: '9876543210', p_hash: hash('482913') } });
  expect(JSON.stringify(h.rpcs)).not.toContain('482913'); // the code itself never reaches the database
  expect(h.sends[0].body).toMatchObject({ template_name: 'hr_login_otp', contact_phone: '919876543210', body_data: { '1': '482913' }, url_button_data: '482913' });
  expect(JSON.stringify(r)).not.toContain('482913'); // nor the app
});

it('verify: right code saves the phone; wrong code is refused', async () => {
  const ok = harness();
  expect(await backupPhone(ok.deps, 'jwt', { action: 'verify', countryCode: '+91', phone: '9876543210', code: '482913' })).toEqual({ status: 200, body: { verified: true } });
  expect(ok.rpcs[0].args.p_hash).toBe(hash('482913'));
  const bad = harness({ verifyOk: false });
  expect(await backupPhone(bad.deps, 'jwt', { action: 'verify', countryCode: '+91', phone: '9876543210', code: '000000' })).toMatchObject({ status: 400, body: { error: 'invalid_otp' } });
  expect((await backupPhone(bad.deps, 'jwt', { action: 'verify', countryCode: '+91', phone: '9876543210', code: '12' })).body.error).toBe('invalid_otp');
});

it('refuses missing sign-in, bad numbers, and maps database rules and limits', async () => {
  expect((await backupPhone(harness().deps, null, { action: 'send', countryCode: '+91', phone: '9876543210' })).status).toBe(401);
  expect((await backupPhone(harness().deps, 'jwt', { action: 'send', countryCode: '+91', phone: '12345' })).body.error).toBe('validation');
  expect((await backupPhone(harness({ rpcError: { message: 'forbidden' } }).deps, 'jwt', { action: 'send', countryCode: '+91', phone: '9876543210' })).status).toBe(403);
  const limited = await backupPhone(harness({ rpcError: { message: 'rate_limited', hint: '42' } }).deps, 'jwt', { action: 'send', countryCode: '+91', phone: '9876543210' });
  expect(limited).toEqual({ status: 429, body: { error: 'rate_limited', retryAfter: 42 } });
  expect((await backupPhone(harness({ rpcError: { message: 'otp_expired' } }).deps, 'jwt', { action: 'verify', countryCode: '+91', phone: '9876543210', code: '482913' })).status).toBe(410);
  expect((await backupPhone(harness({ rpcError: { message: 'boom' } }).deps, 'jwt', { action: 'send', countryCode: '+91', phone: '9876543210' })).status).toBe(503);
});

it('a number WhatsApp cannot reach is reported, not hidden', async () => {
  const r = await backupPhone(harness({ waplifyStatus: 400 }).deps, 'jwt', { action: 'send', countryCode: '+91', phone: '9876543210' });
  expect(r).toMatchObject({ status: 400, body: { error: 'send_failed' } });
});
