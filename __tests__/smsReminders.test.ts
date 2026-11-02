/**
 * @jest-environment node
 */
import { displayName, runOnce, withinSendingHours, type DueReminder } from '../supabase/functions/onboarding-reminders/remind';
import { sendOtp, type SendDeps, type SmsConfig, type WaplifyConfig } from '../supabase/functions/send-whatsapp-otp/send';

/** SMS backup for login codes + onboarding reminders on WhatsApp (owner request 2026-11-02). */
const WA: WaplifyConfig = { apiKey: 'wapl_test', templateName: 'login_code', codeKeys: ['1'] };
const MSG91: SmsConfig = { provider: 'msg91', authKey: 'msgkey', templateId: 'tpl123' };
const TWILIO: SmsConfig = { provider: 'twilio', accountSid: 'AC1', authToken: 'tok', from: '+15550000000' };
const payload = { user: { phone: '919876543210' }, sms: { otp: '483920' } };

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };
function fake(responses: Record<string, { status: number; json: unknown }>) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const deps: SendDeps = {
    fetch: async (url, init) => {
      calls.push({ url, init });
      const key = Object.keys(responses).find((k) => url.includes(k));
      const r = key ? responses[key] : { status: 500, json: {} };
      return { status: r.status, headers: { get: () => null }, json: async () => r.json };
    },
    log: (m) => logs.push(m),
  };
  return { deps, calls, logs };
}

describe('login codes: SMS backup', () => {
  it('WhatsApp works → no SMS is sent (no extra cost)', async () => {
    const f = fake({ waplify: { status: 200, json: { status: 'success' } } });
    const r = await sendOtp(WA, f.deps, payload, { sms: MSG91 });
    expect(r.status).toBe(200);
    expect(f.calls.map((c) => c.url).some((u) => u.includes('msg91'))).toBe(false);
  });

  it('number not on WhatsApp → the same code goes by SMS (MSG91, own code, DLT template)', async () => {
    const f = fake({ waplify: { status: 400, json: { status: 'error', error: 'invalid_contact' } }, msg91: { status: 200, json: { type: 'success' } } });
    const r = await sendOtp(WA, f.deps, payload, { sms: MSG91 });
    expect(r.status).toBe(200);
    const sms = f.calls.find((c) => c.url.includes('msg91'))!;
    const u = new URL(sms.url);
    expect(u.searchParams.get('otp')).toBe('483920');
    expect(u.searchParams.get('mobile')).toBe('919876543210');
    expect(u.searchParams.get('template_id')).toBe('tpl123');
    expect(sms.init.headers.authkey).toBe('msgkey');
  });

  it('member asked for SMS → SMS first; WhatsApp only if SMS fails', async () => {
    const ok = fake({ msg91: { status: 200, json: { type: 'success' } }, waplify: { status: 200, json: { status: 'success' } } });
    expect((await sendOtp(WA, ok.deps, payload, { sms: MSG91, preferSms: true })).status).toBe(200);
    expect(ok.calls.map((c) => c.url).some((u) => u.includes('waplify'))).toBe(false);
    const smsDown = fake({ msg91: { status: 500, json: { type: 'error' } }, waplify: { status: 200, json: { status: 'success' } } });
    expect((await sendOtp(WA, smsDown.deps, payload, { sms: MSG91, preferSms: true })).status).toBe(200);
    expect(smsDown.calls.map((c) => c.url).some((u) => u.includes('waplify'))).toBe(true);
  });

  it('Twilio format: +number, the code in the text, basic auth', async () => {
    const f = fake({ waplify: { status: 503, json: {} }, twilio: { status: 201, json: { sid: 'SM1' } } });
    expect((await sendOtp(WA, f.deps, payload, { sms: TWILIO })).status).toBe(200);
    const t = f.calls.find((c) => c.url.includes('twilio'))!;
    const body = new URLSearchParams(t.init.body);
    expect(body.get('To')).toBe('+919876543210');
    expect(body.get('Body')).toContain('483920');
    expect(t.init.headers.Authorization).toBe(`Basic ${Buffer.from('AC1:tok').toString('base64')}`);
  });

  it('without an SMS provider it behaves exactly as before; rate limits are not bypassed by SMS', async () => {
    const f = fake({ waplify: { status: 400, json: { status: 'error' } } });
    expect((await sendOtp(WA, f.deps, payload)).status).toBe(400);
    const half = fake({ waplify: { status: 400, json: {} } });
    expect((await sendOtp(WA, half.deps, payload, { sms: { provider: 'msg91', authKey: '', templateId: '' } })).status).toBe(400);
    const busy = fake({ waplify: { status: 429, json: {} }, msg91: { status: 200, json: { type: 'success' } } });
    expect((await sendOtp(WA, busy.deps, payload, { sms: MSG91 })).status).toBe(429);
    expect(busy.calls.some((c) => c.url.includes('msg91'))).toBe(false);
  });

  it('never logs the code or the full number', async () => {
    const f = fake({ waplify: { status: 400, json: { status: 'error' } }, msg91: { status: 500, json: { type: 'error' } } });
    await sendOtp(WA, f.deps, payload, { sms: MSG91 });
    expect(f.logs.join(' ')).not.toMatch(/483920|9876543210/);
  });
});

describe('onboarding reminders', () => {
  const cfg = { apiKey: 'wapl_test', templates: { en: 'finish_biodata_en', ur: 'finish_biodata_ur' } };
  const due: DueReminder[] = [
    { user_id: 'u1', phone: '919876543210', name: 'Imran Ahmed', lang: 'en', n: 1 },
    { user_id: 'u2', phone: '971501234567', name: null, lang: 'ur', n: 2 },
  ];
  const noonIst = new Date('2026-11-02T06:30:00Z'); // 12:00 in India

  it('only between 09:00 and 20:30 India time', () => {
    expect(withinSendingHours(new Date('2026-11-02T03:29:00Z'))).toBe(false); // 08:59 IST
    expect(withinSendingHours(new Date('2026-11-02T03:30:00Z'))).toBe(true); // 09:00 IST
    expect(withinSendingHours(new Date('2026-11-02T15:00:00Z'))).toBe(true); // 20:30 IST
    expect(withinSendingHours(new Date('2026-11-02T15:01:00Z'))).toBe(false);
  });

  it('first name only, or a neutral phrase in the member’s language', () => {
    expect(displayName('Imran Ahmed', 'en')).toBe('Imran');
    expect(displayName('', 'en')).toBe('your family member');
    expect(displayName(null, 'ur')).toBe('آپ کے گھر والے');
  });

  it('sends nothing until the template is set, and nothing at night', async () => {
    const rpc = jest.fn();
    const f = fake({});
    expect(await runOnce({ apiKey: 'k', templates: { en: '' } }, { ...f.deps, rpc }, noonIst)).toMatchObject({ skipped: 'not configured' });
    expect(await runOnce(cfg, { ...f.deps, rpc }, new Date('2026-11-02T18:00:00Z'))).toMatchObject({ skipped: 'quiet hours' });
    expect(rpc).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
  });

  it('sends each due reminder in the member’s language and reports every outcome', async () => {
    const results: unknown[] = [];
    const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'claim_onboarding_reminders') return due;
      results.push(args);
      return null;
    });
    const f = fake({ waplify: { status: 200, json: { status: 'success' } } });
    const out = await runOnce(cfg, { ...f.deps, rpc }, noonIst);
    expect(out).toEqual({ sent: 2, failed: 0 });
    const bodies = f.calls.map((c) => JSON.parse(c.init.body));
    expect(bodies[0]).toMatchObject({ template_name: 'finish_biodata_en', contact_phone: '919876543210', body_data: { '1': 'Imran' } });
    expect(bodies[1]).toMatchObject({ template_name: 'finish_biodata_ur', body_data: { '1': 'آپ کے گھر والے' } });
    expect(results).toEqual([
      { p_user: 'u1', p_ok: true, p_error: null },
      { p_user: 'u2', p_ok: true, p_error: null },
    ]);
  });

  it('a failed send is recorded (and counted, so it is never retried as a third message)', async () => {
    const results: { p_ok: boolean; p_error: string | null }[] = [];
    const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'claim_onboarding_reminders') return [due[0]];
      results.push(args as never);
      return null;
    });
    const f = fake({ waplify: { status: 400, json: { status: 'error', error: 'template_not_approved' } } });
    expect(await runOnce(cfg, { ...f.deps, rpc }, noonIst)).toEqual({ sent: 0, failed: 1 });
    expect(results[0]).toMatchObject({ p_ok: false });
    expect(f.logs.join(' ')).not.toMatch(/9876543210|Imran/);
  });
});
