import { AppError } from '@/services/backend';
import { mapNotification, mapOrder, mapPricing, mapProfile, mapPublicProfile, mapRequest, mapUser, toAppError } from '@/services/supabase/map';

/** Database rows → app types, and server errors → the app's error codes (Supabase adapter). */
describe('row mapping', () => {
  it('maps users, profiles, requests and orders from snake_case', () => {
    expect(mapUser({ id: 'u', country_code: '+91', phone: '9876543210', role: 'master', language: 'ur', created_at: 't', claimed_at: 'c' }, true)).toMatchObject({
      id: 'u', countryCode: '+91', phone: '9876543210', role: 'master', language: 'ur', hasPin: true, claimedAt: 'c',
    });
    const p = mapProfile({ id: 'p', code: 'HR-1', user_id: 'u', biodata: { basic: {} }, status: 'draft', last_step: 3, created_at: 'a', updated_at: 'b', boost_until: null, created_by_admin: 'adm' });
    expect(p).toMatchObject({ id: 'p', code: 'HR-1', userId: 'u', status: 'draft', lastStep: 3, createdByAdminId: 'adm' });
    expect(p.boostUntil).toBeUndefined();
    expect(mapRequest({ id: 'r', from_user_id: 'a', from_profile_id: 'pa', to_user_id: 'b', to_profile_id: 'pb', status: 'pending', created_at: 't', expires_at: 'e', pokes: null })).toMatchObject({ pokes: [], fromProfileId: 'pa' });
    expect(mapOrder({ id: 'o', user_id: 'u', profile_id: 'p', kind: 'boost', amount: '100', currency: 'INR', status: 'pending', terms: { planId: 'd7', boostDays: 7, pricingVersion: 2 }, simulated: false, created_at: 't' })).toMatchObject({
      amount: 100, terms: { planId: 'd7', boostDays: 7, autoRenew: false },
    });
  });

  it('turns notification params into strings and keeps announcement text', () => {
    const n = mapNotification({ id: 'n', user_id: 'u', type: 'payment', params: { amount: 100, status: 'paid' }, created_at: 't', announcement: { id: 'a', title: { en: 'Hi' } } });
    expect(n.params).toEqual({ amount: '100', status: 'paid' });
    expect(n.announcement).toMatchObject({ title: { en: 'Hi' } });
  });

  it('reads the pricing row (plans, connection rules) with safe defaults', () => {
    const cfg = mapPricing({ version: 3, currency: 'INR', require_approval: true, boost_days: 7, poke_wait_hours: 24, config: { publication: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'paid', amount: 99 } } } });
    expect(cfg.version).toBe(3);
    expect(cfg.publication.groom).toEqual({ mode: 'paid', amount: 99 });
    expect(cfg.boostPlans.length).toBeGreaterThan(0);
    expect(cfg.pokeWaitHours).toBe(24);
  });

  it('fills projection fields the UI relies on', () => {
    const p = mapPublicProfile({ id: 'p', displayName: 'Sana', code: 'HR-2' });
    expect(p.photos).toEqual([]);
    expect(p.granted).toEqual({ photos: false, phone: false, fullBiodata: false });
    expect(p.acceptsRequests).toBe(true);
  });
});

describe('error mapping', () => {
  it('uses the app code our SQL raises', () => {
    expect(toAppError({ message: 'boost_active', hint: '2026-11-01T00:00:00Z' })).toMatchObject({ code: 'boost_active', details: { until: '2026-11-01T00:00:00Z' } });
    expect(toAppError({ message: 'forbidden: only the master manages sub-admins', code: '42501' }).code).toBe('forbidden');
    expect(toAppError({ message: 'incomplete_biodata', code: 'P0001' }).code).toBe('incomplete_biodata');
  });
  it('falls back to SQLSTATE, HTTP status and auth messages', () => {
    expect(toAppError({ message: 'x', code: '28000' }).code).toBe('unauthenticated');
    expect(toAppError({ message: 'x', code: 'P0002' }).code).toBe('not_found');
    expect(toAppError({ message: 'dup', code: '23505' }).code).toBe('duplicate');
    expect(toAppError({ message: 'check', code: '23514' }).code).toBe('validation');
    expect(toAppError({ message: 'For security purposes, you can only request this after 42 seconds', status: 429 }).code).toBe('rate_limited');
    expect(toAppError({ message: 'JWT expired' }).code).toBe('unauthenticated');
    const e = new AppError('poke_used');
    expect(toAppError(e)).toBe(e);
  });
});

describe('chunked secure storage for the login session', () => {
  it('round-trips values larger than one secure-storage entry and cleans up', async () => {
    const { chunkedKV } = jest.requireActual('@/services/supabase/client') as typeof import('@/services/supabase/client');
    const { memoryKV } = jest.requireActual('@/services/storage') as typeof import('@/services/storage');
    const raw = memoryKV();
    const kv = chunkedKV(raw);
    const big = 'x'.repeat(5000) + 'end';
    await kv.setItem('s', big);
    expect(await raw.getItem('s.n')).toBe('3');
    expect(await kv.getItem('s')).toBe(big);
    await kv.setItem('s', 'small');
    expect(await raw.getItem('s.1')).toBeNull();
    expect(await kv.getItem('s')).toBe('small');
    await kv.removeItem('s');
    expect(await kv.getItem('s')).toBeNull();
  });
});
