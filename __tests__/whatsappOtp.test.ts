/**
 * @jest-environment node
 */
import { createHmac, randomBytes } from 'crypto';
import { sendOtp, toWaplifyPhone, verifyHook, type SendDeps, type WaplifyConfig } from '../supabase/functions/send-whatsapp-otp/send';

/** Owner choice 2026-10-29: login codes go on WhatsApp through Waplify (no SMS fallback). */
const rawKey = randomBytes(32).toString('base64');
const SECRET = `v1,whsec_${rawKey}`;
const NOW = 1_800_000_000;
const sign = (id: string, ts: number, body: string, key = rawKey) => createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
const hdrs = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe('hook signature (Standard Webhooks)', () => {
  const body = JSON.stringify({ user: { phone: '919876543210' }, sms: { otp: '123456' } });
  it('accepts a correct, fresh signature (also among several)', async () => {
    const sig = sign('msg_1', NOW, body);
    expect(await verifyHook(SECRET, hdrs({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(NOW), 'webhook-signature': `v1,${sig}` }), body, NOW)).toBe(true);
    expect(await verifyHook(SECRET, hdrs({ 'webhook-id': 'msg_1', 'webhook-timestamp': String(NOW), 'webhook-signature': `v1,AAAA v1,${sig}` }), body, NOW + 60)).toBe(true);
  });
  it('rejects a tampered body, wrong key, old timestamp or missing headers', async () => {
    const sig = sign('msg_1', NOW, body);
    const h = { 'webhook-id': 'msg_1', 'webhook-timestamp': String(NOW), 'webhook-signature': `v1,${sig}` };
    expect(await verifyHook(SECRET, hdrs(h), body.replace('123456', '000000'), NOW)).toBe(false);
    expect(await verifyHook(`v1,whsec_${randomBytes(32).toString('base64')}`, hdrs(h), body, NOW)).toBe(false);
    expect(await verifyHook(SECRET, hdrs(h), body, NOW + 6 * 60)).toBe(false); // replay after 5 minutes
    expect(await verifyHook(SECRET, hdrs({ ...h, 'webhook-signature': `v2,${sig}` }), body, NOW)).toBe(false);
    expect(await verifyHook(SECRET, hdrs({ 'webhook-id': 'msg_1' }), body, NOW)).toBe(false);
    expect(await verifyHook('', hdrs(h), body, NOW)).toBe(false);
  });
});

it('formats numbers the way Waplify wants (country code, no +)', () => {
  expect(toWaplifyPhone('919876543210')).toBe('919876543210');
  expect(toWaplifyPhone('+91 98765-43210')).toBe('919876543210');
  expect(toWaplifyPhone('12025550123')).toBe('12025550123');
  for (const bad of ['', '12', '0919876543210', 'abc', 919876543210, null]) expect(toWaplifyPhone(bad)).toBeNull();
});

describe('sending through Waplify', () => {
  const cfg: WaplifyConfig = { apiKey: 'wapl_test', templateName: 'hr_login_otp', codeKeys: ['1'] };
  const payload = { user: { id: 'u1', phone: '919876543210' }, sms: { otp: '482913' } };
  function fake(status: number, json: unknown, headers: Record<string, string> = {}) {
    const calls: { url: string; init: { method: string; headers: Record<string, string>; body: string } }[] = [];
    const logs: string[] = [];
    const deps: SendDeps = {
      fetch: async (url, init) => {
        calls.push({ url, init });
        return { status, headers: { get: (k: string) => headers[k] ?? null }, json: async () => json };
      },
      log: (m) => logs.push(m),
    };
    return { deps, calls, logs };
  }

  it('sends the approved template with the code to 91XXXXXXXXXX and replies {} to Supabase', async () => {
    const f = fake(200, { status: 'success', message_id: 'wamid.X' });
    const r = await sendOtp(cfg, f.deps, payload);
    expect(r).toEqual({ status: 200, body: {} });
    expect(f.calls[0].url).toBe('https://server.waplify.io/api/v1/messages/send');
    expect(f.calls[0].init.headers.Authorization).toBe('Bearer wapl_test');
    expect(JSON.parse(f.calls[0].init.body)).toEqual({ template_name: 'hr_login_otp', contact_phone: '919876543210', contact_name: 'Hyderabad Rishta member', body_data: { '1': '482913' } });
  });

  it('fills every configured body_data key with the code (e.g. body + copy-code button)', async () => {
    const f = fake(200, { status: 'success' });
    await sendOtp({ ...cfg, codeKeys: ['1', 'button_1'] }, f.deps, payload);
    expect(JSON.parse(f.calls[0].init.body).body_data).toEqual({ '1': '482913', button_1: '482913' });
  });

  it('maps Waplify errors to messages members understand, never leaking the code or full number', async () => {
    const busy = fake(429, { error: 'rate_limit_exceeded' }, { 'Retry-After': '32', 'X-Request-ID': 'req-9' });
    expect(await sendOtp(cfg, busy.deps, payload)).toEqual({ status: 429, body: { error: { http_code: 429, message: 'Too many codes are being sent right now. Please try again in 32 seconds.' } } });
    expect(busy.logs[0]).toContain('req=req-9');
    for (const l of busy.logs) {
      expect(l).not.toContain('482913');
      expect(l).not.toContain('919876543210');
    }
    expect((await sendOtp(cfg, fake(400, { error: 'bad_request' }).deps, payload)).status).toBe(400);
    for (const s of [401, 403, 404, 500]) expect((await sendOtp(cfg, fake(s, { error: 'x' }).deps, payload)).status).toBe(503);
    // Accepted HTTP but not "success" is not treated as sent.
    expect((await sendOtp(cfg, fake(200, { status: 'queued?' }).deps, payload)).status).toBe(503);
    const down: SendDeps = { fetch: async () => { throw new Error('ECONNRESET'); } };
    expect((await sendOtp(cfg, down, payload)).status).toBe(503);
  });

  it('refuses malformed hook payloads and a missing configuration without calling Waplify', async () => {
    const f = fake(200, { status: 'success' });
    for (const bad of [null, {}, { user: { phone: '12' }, sms: { otp: '123456' } }, { user: { phone: '919876543210' }, sms: { otp: 'abc' } }])
      expect((await sendOtp(cfg, f.deps, bad)).status).toBe(400);
    expect((await sendOtp({ ...cfg, apiKey: '' }, f.deps, payload)).status).toBe(500);
    expect(f.calls).toHaveLength(0);
  });
});
