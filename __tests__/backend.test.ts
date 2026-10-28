import { buildSeed, DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_USER_PHONE } from '@/data/seed';
import { EMPTY_FILTERS } from '@/domain/search';
import type { Biodata } from '@/domain/types';
import { AppError } from '@/services/backend';
import { DemoBackend, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/**
 * Integration tests for the critical journeys (PRD §22) against the demo backend,
 * which enforces the same rules the Supabase RLS policies do.
 */

let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);

function makeBackend() {
  return new DemoBackend({ storage: memoryKV(), now });
}

async function login(b: DemoBackend, phone: string) {
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp('+91', phone);
  return b.verifyOtp('+91', phone, DEMO_OTP);
}

const validBiodata = (): Biodata => {
  const b = JSON.parse(JSON.stringify(buildSeed().profiles[0].biodata)) as Biodata;
  b.basic.fullName = 'New Bride Test';
  return b;
};

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect(e.code).toBe(code));
}

describe('auth', () => {
  it('registers new users and recognises returning users', async () => {
    const b = makeBackend();
    const first = await login(b, '9123456789');
    expect(first.isNew).toBe(true);
    await b.logout();
    const demo = await login(b, DEMO_USER_PHONE);
    expect(demo.isNew).toBe(false);
  });

  it('rejects wrong OTP, then locks after max attempts', async () => {
    const b = makeBackend();
    advance(RESEND_COOLDOWN_MS + 1);
    await b.requestOtp('+91', '9123456780');
    for (let i = 0; i < 5; i++) await expectCode(b.verifyOtp('+91', '9123456780', '000000'), 'invalid_otp');
    await expectCode(b.verifyOtp('+91', '9123456780', DEMO_OTP), 'rate_limited');
  });

  it('enforces resend cooldown and OTP expiry', async () => {
    const b = makeBackend();
    advance(RESEND_COOLDOWN_MS + 1);
    await b.requestOtp('+91', '9123400000');
    await expectCode(b.requestOtp('+91', '9123400000'), 'rate_limited');
    advance(11 * 60 * 1000);
    await expectCode(b.verifyOtp('+91', '9123400000', DEMO_OTP), 'otp_expired');
  });

  it('requires a session for protected calls', async () => {
    const b = makeBackend();
    await expectCode(b.getMyProfile(), 'unauthenticated');
  });
});

describe('biodata → publication → discovery', () => {
  it('saves drafts, blocks incomplete publication, publishes via admin approval', async () => {
    const b = makeBackend();
    await login(b, '9111111111');
    const empty = { ...validBiodata(), basic: { ...validBiodata().basic, fullName: '' } };
    await b.saveDraft(empty, 1);
    await expectCode(b.submitForPublication(), 'incomplete_biodata');

    await b.saveDraft(validBiodata(), 7);
    const { profile, order } = await b.submitForPublication();
    expect(order).toBeUndefined(); // brides publish free by default
    expect(profile.status).toBe('pending');

    // Not discoverable while pending
    await b.logout();
    await login(b, DEMO_USER_PHONE);
    const before = await b.searchProfiles(EMPTY_FILTERS, 0, 100);
    expect(before.items.map((p) => p.id)).not.toContain(profile.id);

    await b.logout();
    await login(b, DEMO_ADMIN_PHONE);
    await b.adminSetProfileStatus(profile.id, 'published');
    await b.logout();
    await login(b, DEMO_USER_PHONE);
    const after = await b.searchProfiles(EMPTY_FILTERS, 0, 100);
    expect(after.items.map((p) => p.id)).toContain(profile.id);
  });

  it('publishes without photos and supports up to 3 photos only', async () => {
    const b = makeBackend();
    await login(b, '9111111112');
    const bd = validBiodata();
    bd.photos = [1, 2, 3, 4].map((i) => ({ id: String(i), uri: `u${i}` }));
    await expectCode(b.saveDraft(bd, 0), 'validation');
    bd.photos = [];
    await b.saveDraft(bd, 7);
    expect((await b.submitForPublication()).profile.status).toBe('pending');
  });

  it('never returns phone numbers or hidden fields from discovery', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    const page = await b.searchProfiles(EMPTY_FILTERS, 0, 50);
    const json = JSON.stringify(page);
    expect(json).not.toMatch(/90000001\d\d/);
    expect(page.items.every((p) => p.profileType === 'bride')).toBe(true); // groom sees brides
  });

  it('paginates', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    const p0 = await b.searchProfiles(EMPTY_FILTERS, 0, 5);
    const p1 = await b.searchProfiles(EMPTY_FILTERS, 1, 5);
    expect(p0.items).toHaveLength(5);
    expect(p0.hasMore).toBe(true);
    expect(new Set([...p0.items, ...p1.items].map((p) => p.id)).size).toBe(p0.items.length + p1.items.length);
  });

  it('records views excluding the owner and de-duplicates refreshes', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    const before = (await b.getDashboard()).views;
    await b.getProfile('p_1'); // own profile
    expect((await b.getDashboard()).views).toBe(before);
    await b.logout();
    await login(b, '9222222222');
    await b.getProfile('p_1');
    await b.getProfile('p_1');
    await b.logout();
    await login(b, DEMO_USER_PHONE);
    expect((await b.getDashboard()).views).toBe(before + 1);
  });
});

describe('shortlist', () => {
  it('persists and is private to the user', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    expect(await b.toggleShortlist('p_2')).toBe(true);
    expect(await b.getShortlistIds()).toEqual(['p_2']);
    await b.logout();
    await login(b, '9333333333');
    expect(await b.getShortlistIds()).toEqual([]);
  });
});

describe('contact requests & consent (PRD §12)', () => {
  it('acceptance alone reveals nothing; explicit consent reveals only granted scopes', async () => {
    const b = makeBackend();
    // demo groom (p_1) sends to bride p_2
    await login(b, DEMO_USER_PHONE);
    const req = await b.sendRequest('p_2', 'Assalamu alaikum');
    await expectCode(b.sendRequest('p_2'), 'duplicate');
    await b.logout();

    await login(b, '9000000102'); // owner of p_2
    await b.respondToRequest(req.id, 'accepted');
    await b.logout();

    await login(b, DEMO_USER_PHONE);
    let view = await b.getProfile('p_2');
    expect(view.contact).toBeUndefined();
    await b.logout();

    await login(b, '9000000102');
    await b.setConsent(req.id, { photos: false, phone: true, fullBiodata: false });
    await b.logout();

    await login(b, DEMO_USER_PHONE);
    view = await b.getProfile('p_2');
    expect(view.contact?.phone).toBe('9000000102');
    const notes = await b.getNotifications();
    expect(notes.some((n) => n.type === 'request_accepted')).toBe(true);
    expect(notes.some((n) => n.type === 'contact_shared')).toBe(true);
  });

  it('only the recipient can respond; consent requires acceptance', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    const req = await b.sendRequest('p_6');
    await expectCode(b.respondToRequest(req.id, 'accepted'), 'not_found');
    await expectCode(b.setConsent(req.id, { photos: true, phone: true, fullBiodata: true }), 'invalid_state');
  });

  it('requires a published profile to send requests', async () => {
    const b = makeBackend();
    await login(b, '9444444444');
    await expectCode(b.sendRequest('p_2'), 'invalid_state');
  });

  it('blocking hides profiles both ways and closes pending requests', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    await b.blockProfile('p_0');
    const ids = (await b.searchProfiles(EMPTY_FILTERS, 0, 50)).items.map((p) => p.id);
    expect(ids).not.toContain('p_0');
    await expectCode(b.getProfile('p_0'), 'not_found');
    const r1 = (await b.getRequests()).find((r) => r.request.id === 'r_1');
    expect(r1?.request.status).toBe('declined');
  });
});

describe('pricing & payments (PRD §8)', () => {
  it('free mode never creates a payable order; paid mode requires simulated payment', async () => {
    const b = makeBackend();
    await login(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await b.adminUpdatePricing({ ...cfg, requireApproval: false, publication: { ...cfg.publication, bride: { mode: 'paid', amount: 299 } } });
    await b.logout();

    await login(b, '9555555555');
    await b.saveDraft(validBiodata(), 7);
    const { order, profile } = await b.submitForPublication();
    expect(profile.status).toBe('draft');
    expect(order).toMatchObject({ amount: 299, status: 'pending', simulated: true, terms: { autoRenew: false } });

    // Price changes later do not alter the existing order
    await b.logout();
    await login(b, DEMO_ADMIN_PHONE);
    const cfg2 = await b.getPricing();
    await b.adminUpdatePricing({ ...cfg2, publication: { ...cfg2.publication, bride: { mode: 'paid', amount: 999 } } });
    await b.logout();
    await login(b, '9555555555');
    const again = await b.submitForPublication();
    expect(again.order?.amount).toBe(299);

    const failed = await b.completePayment(order!.id, 'failure');
    expect(failed.profile.status).toBe('draft');
    const retry = await b.submitForPublication();
    expect(retry.order?.amount).toBe(999); // failed order is not reused; new order uses current price
    const paid = await b.completePayment(retry.order!.id, 'success');
    expect(paid.profile.status).toBe('published');
  });

  it('boost uses the configured duration and free boosts bypass payment', async () => {
    const b = makeBackend();
    await login(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await b.adminUpdatePricing({ ...cfg, boostDays: 3, boost: { bride: { mode: 'free', amount: 0 }, groom: { mode: 'free', amount: 0 } } });
    await b.logout();
    await login(b, DEMO_USER_PHONE);
    const { order, profile } = await b.startBoost();
    expect(order.status).toBe('free');
    expect(new Date(profile.boostUntil!).getTime() - clock).toBe(3 * 86400000);
  });

  it('records pricing audit history and rejects invalid config', async () => {
    const b = makeBackend();
    await login(b, DEMO_ADMIN_PHONE);
    const cfg = await b.getPricing();
    await expectCode(b.adminUpdatePricing({ ...cfg, boostDays: 0 }), 'validation');
    await b.adminUpdatePricing({ ...cfg, boostDays: 10 });
    const hist = await b.adminPricingHistory();
    expect(hist[0].before.boostDays).toBe(7);
    expect(hist[0].after.boostDays).toBe(10);
  });
});

describe('admin authorisation', () => {
  it('rejects admin calls from regular users', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    await expectCode(b.adminStats(), 'forbidden');
    await expectCode(b.adminUpdatePricing(await b.getPricing()), 'forbidden');
    await expectCode(b.adminRecipientReport('a_welcome'), 'forbidden');
  });
});

describe('announcements & readership (PRD §14)', () => {
  it('delivers in-app, counts a view only on open, audits recipient report access', async () => {
    const b = makeBackend();
    await login(b, DEMO_ADMIN_PHONE);
    const audience = await b.adminAudiencePreview('all');
    const a = await b.adminSaveAnnouncement({ title: { en: 'Eid Mubarak' }, body: { en: 'Greetings' }, segment: 'all', pushEnabled: true });
    await b.adminPublishAnnouncement(a.id);
    await b.logout();

    await login(b, DEMO_USER_PHONE);
    let notes = await b.getNotifications();
    const n = notes.find((x) => x.announcementId === a.id)!;
    expect(n.announcement?.title.en).toBe('Eid Mubarak');
    await b.markAllNotificationsRead(); // bulk read is NOT a view
    await b.logout();

    await login(b, DEMO_ADMIN_PHONE);
    let stats = (await b.adminListAnnouncements()).find((x) => x.id === a.id)!.stats;
    expect(stats.targeted).toBe(audience);
    expect(stats.uniqueViewers).toBe(0);
    expect(stats.pushSubmitted).toBe(0);
    expect(stats.pushNotConfigured).toBe(audience);
    await b.logout();

    await login(b, DEMO_USER_PHONE);
    await b.markNotificationRead(n.id);
    await b.recordNotificationClick(n.id);
    await b.logout();

    await login(b, DEMO_ADMIN_PHONE);
    stats = (await b.adminListAnnouncements()).find((x) => x.id === a.id)!.stats;
    expect(stats.uniqueViewers).toBe(1);
    expect(stats.clicks).toBe(1);
    const report = await b.adminRecipientReport(a.id);
    expect(report.every((r) => r.maskedPhone.includes('•'))).toBe(true);
    expect((await b.adminAuditLog()).some((e) => e.action === 'announcement.recipient_report_viewed')).toBe(true);
    notes = [];
  });

  it('publishes scheduled announcements when due and hides expired ones', async () => {
    const b = makeBackend();
    await login(b, DEMO_ADMIN_PHONE);
    const a = await b.adminSaveAnnouncement({ title: { en: 'Later' }, body: { en: 'x' }, segment: 'grooms', expiresAt: new Date(clock + 3 * 3600000).toISOString() });
    await b.adminPublishAnnouncement(a.id, new Date(clock + 3600000).toISOString());
    await b.logout();
    await login(b, DEMO_USER_PHONE);
    expect((await b.getNotifications()).some((n) => n.announcementId === a.id)).toBe(false);
    advance(3600000);
    expect((await b.getNotifications()).some((n) => n.announcementId === a.id)).toBe(true);
    advance(3 * 3600000);
    expect((await b.getNotifications()).some((n) => n.announcementId === a.id)).toBe(false);
  });
});

describe('account lifecycle', () => {
  it('deletes all personal data on account deletion', async () => {
    const b = makeBackend();
    await login(b, DEMO_USER_PHONE);
    await b.deleteAccount();
    await login(b, DEMO_ADMIN_PHONE);
    const users = await b.adminListUsers();
    expect(users.some((u) => u.id === 'u_demo')).toBe(false);
    expect((await b.adminListProfiles()).some((p) => p.id === 'p_1')).toBe(false);
  });
});
