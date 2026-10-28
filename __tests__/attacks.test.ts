import { DEMO_ADMIN_PHONE, DEMO_OTP, DEMO_SUBADMIN_PHONE, DEMO_USER_PHONE } from '@/data/seed';
import { MAX_PHOTO_BYTES, MAX_UPLOAD_BYTES, safeDeepLink, stripUnsafe, unsafeText, uploadProblem } from '@/domain/security';
import { EMPTY_FILTERS } from '@/domain/search';
import { AppError } from '@/services/backend';
import { DemoBackend, MAX_OTP_FAILS_PER_HOUR, RESEND_COOLDOWN_MS } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/**
 * Owner request 2026-10-28: "try to break it and fix the vulnerabilities".
 * Every test here is an attack a hostile member (or a careless admin) could try against the app's
 * backend rules. The SQL twin is supabase/tests/60_attacks.test.sql.
 */
let clock = new Date('2026-10-01T09:00:00Z').getTime();
const now = () => new Date(clock);
const advance = (ms: number) => (clock += ms);
const make = () => new DemoBackend({ storage: memoryKV(), now });
const GROOM = DEMO_USER_PHONE; // u_demo / p_1
const BRIDE = '9000000102'; // u_2 / p_2

async function as(b: DemoBackend, phone: string) {
  await b.logout();
  advance(RESEND_COOLDOWN_MS + 1);
  await b.requestOtp('+91', phone);
  await b.verifyOtp('+91', phone, DEMO_OTP);
}
async function code(p: Promise<unknown>, c: string) {
  const e = await p.then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(AppError);
  expect((e as AppError).code).toBe(c);
}
const jpeg = (bytes: number) => `data:image/jpeg;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;

describe('IDOR: acting on other members’ records', () => {
  it('cannot accept, withdraw, poke or consent on a conversation you are not part of', async () => {
    const b = make();
    await as(b, BRIDE);
    await code(b.respondToRequest('r_1', 'accepted'), 'not_found'); // r_1 is u_0 → u_demo
    await code(b.withdrawRequest('r_3'), 'not_found'); // r_3 is u_demo → u_6
    await code(b.pokeRequest('r_3'), 'not_found');
    await code(b.setConsent('r_2', { photos: true, phone: true, fullBiodata: true }), 'not_found');
    await code(b.offerPhone('r_2', true, 'k1'), 'not_found');
  });

  it('cannot accept or withdraw someone else’s phone offer', async () => {
    const b = make();
    await as(b, BRIDE);
    await code(b.respondToPhoneOffer('po_1', 'accepted'), 'not_found');
    await code(b.withdrawPhoneOffer('po_1'), 'not_found');
  });

  it('cannot read, mark or click another member’s notifications', async () => {
    const b = make();
    await as(b, GROOM);
    await b.toggleShortlist('p_2'); // notifies u_2
    await as(b, BRIDE);
    const theirs = (await b.getNotifications())[0];
    expect(theirs).toBeTruthy();
    await as(b, GROOM);
    expect((await b.getNotifications()).some((n) => n.id === theirs.id)).toBe(false);
    await code(b.markNotificationRead(theirs.id), 'not_found');
  });

  it('cannot pay for (and so publish) someone else’s order', async () => {
    const b = make();
    await as(b, '9000000131'); // u_31 owns the draft p_31
    await code(b.completePayment('ord_does_not_exist', 'success'), 'not_found');
  });

  it('cannot see drafts, pending or deleted profiles — not even by shortlisting them', async () => {
    const b = make();
    await as(b, GROOM);
    await code(b.getProfile('p_31'), 'not_found'); // draft
    await code(b.getProfile('p_30'), 'not_found'); // pending
    await code(b.toggleShortlist('p_31'), 'not_found');
    await code(b.sendRequest('p_31', { offerPhone: false, consent: false, idempotencyKey: 'k31' }), 'not_found');
  });

  it('a member cannot reach admin or master actions', async () => {
    const b = make();
    await as(b, GROOM);
    await code(b.adminListUsers(), 'forbidden');
    await code(b.adminSetProfileStatus('p_2', 'paused'), 'forbidden');
    await code(b.adminSearch('HR-10002'), 'forbidden');
    await code(b.masterAddSubAdmin('+91', BRIDE), 'forbidden');
    await as(b, DEMO_SUBADMIN_PHONE);
    await code(b.masterAddSubAdmin('+91', BRIDE), 'forbidden');
  });
});

describe('Input abuse: oversized and malformed data', () => {
  it('rejects a biodata stuffed with huge text', async () => {
    const b = make();
    await as(b, GROOM);
    const mine = (await b.getMyProfile())!;
    const huge = { ...mine.biodata, basic: { ...mine.biodata.basic, aboutMe: 'x'.repeat(200_000) } };
    await code(b.saveDraft(huge, 1), 'validation');
    const junk = { ...mine.biodata, extra: 'y'.repeat(50_000) } as typeof mine.biodata;
    await code(b.saveDraft(junk, 1), 'validation');
    const manyCities = { ...mine.biodata, preferences: { ...mine.biodata.preferences, cities: Array.from({ length: 500 }, (_, i) => `c${i}`) } };
    await code(b.saveDraft(manyCities, 1), 'validation');
  });

  it('rejects photos that are not images from the phone (scripts, remote trackers, svg)', async () => {
    const b = make();
    await as(b, GROOM);
    const mine = (await b.getMyProfile())!;
    for (const uri of ['javascript:alert(1)', 'https://tracker.example/pixel.gif', 'http://x/y.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGgxPg==', '']) {
      await code(b.saveDraft({ ...mine.biodata, photos: [{ id: 'a', uri }] }, 1), 'validation');
    }
    await code(b.saveDraft({ ...mine.biodata, photos: [{ id: 'z'.repeat(500), uri: jpeg(1000) }] }, 1), 'validation');
  });

  it('accepts real photos and refuses one that is still over the stored-size limit', async () => {
    const b = make();
    await as(b, GROOM);
    const mine = (await b.getMyProfile())!;
    await b.saveDraft({ ...mine.biodata, photos: [{ id: 'a', uri: jpeg(200_000) }, { id: 'b', uri: 'file:///data/user/0/x/cache/p.jpg' }] }, 1);
    await code(b.saveDraft({ ...mine.biodata, photos: [{ id: 'a', uri: jpeg(MAX_PHOTO_BYTES + 10_000) }] }, 1), 'validation');
  });

  it('clamps the wizard step instead of trusting it', async () => {
    const b = make();
    await as(b, '9000000131');
    const p = (await b.getMyProfile())!;
    expect((await b.saveDraft(p.biodata, 9999)).lastStep).toBeLessThanOrEqual(7);
  });

  it('rejects giant idempotency keys and messages', async () => {
    const b = make();
    await as(b, GROOM);
    await code(b.sendRequest('p_2', { offerPhone: false, consent: false, idempotencyKey: 'k'.repeat(5000) }), 'validation');
    await code(b.sendRequest('p_2', { offerPhone: false, consent: false, idempotencyKey: 'k2', message: 'm'.repeat(5000) }), 'validation');
    await code(b.offerPhone('r_2', true, 'k'.repeat(5000)), 'validation');
  });

  it('rejects junk push tokens and unknown languages', async () => {
    const b = make();
    await as(b, GROOM);
    await code(b.registerPushDevice(`ExponentPushToken[${'a'.repeat(5000)}]`, 'ios'), 'validation');
    await code(b.setLanguage('xx' as 'en'), 'validation');
    expect((await b.getSession())!.language).toBe('en');
  });

  it('ignores unknown push-preference keys and non-boolean consent values', async () => {
    const b = make();
    await as(b, GROOM);
    const out = await b.setPushPrefs({ enabled: false, __proto__: { polluted: true }, evil: 'x' } as never);
    expect(Object.keys(out).sort()).toEqual(['activity', 'announcements', 'enabled', 'interests', 'showNames']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    await b.setConsent('r_2', { photos: 'yes' as never, phone: true, fullBiodata: 1 as never });
    const v = (await b.getRequests()).find((r) => r.request.id === 'r_2')!;
    expect(v.myConsent).toEqual({ photos: false, phone: false, fullBiodata: false });
  });

  it('caps search page size and ignores negative pages', async () => {
    const b = make();
    await as(b, GROOM);
    const r = await b.searchProfiles({ ...EMPTY_FILTERS }, -5, 100_000);
    expect(r.items.length).toBeLessThanOrEqual(50);
    expect(r.page).toBe(0);
  });

  it('caps admin search input', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    expect(await b.adminSearch('a'.repeat(10_000))).toEqual([]);
  });
});

describe('Reports cannot be abused', () => {
  it('only known reasons, not your own profile, not a ghost profile', async () => {
    const b = make();
    await as(b, GROOM);
    await code(b.reportProfile('p_2', '<script>'), 'validation');
    await code(b.reportProfile('p_1', 'fake'), 'invalid_state');
    await code(b.reportProfile('p_nope', 'fake'), 'not_found');
    await code(b.reportProfile('p_31', 'fake'), 'not_found'); // drafts are invisible, so unreportable
  });

  it('one open report per profile, and a daily cap against report-bombing', async () => {
    const b = make();
    await as(b, GROOM);
    await b.reportProfile('p_2', 'fake', 'd'.repeat(5000));
    await code(b.reportProfile('p_2', 'scam'), 'duplicate');
    for (let i = 3; i <= 11; i++) await b.reportProfile(`p_${i}`, 'other');
    await code(b.reportProfile('p_12', 'other'), 'rate_limited');
    await as(b, DEMO_ADMIN_PHONE);
    const mine = (await b.adminListReports()).find((r) => r.profileId === 'p_2')!;
    expect(mine.details!.length).toBeLessThanOrEqual(1000);
  });
});

describe('Blocking cannot be abused', () => {
  it('cannot block yourself or a profile that does not exist', async () => {
    const b = make();
    await as(b, GROOM);
    await code(b.blockProfile('p_1'), 'invalid_state');
    await code(b.blockProfile('p_nope'), 'not_found');
  });
});

describe('Links stay inside the app', () => {
  it('safeDeepLink allows only internal paths', () => {
    expect(safeDeepLink('/requests')).toBe('/requests');
    expect(safeDeepLink('/profile/p_2?tab=1')).toBe('/profile/p_2?tab=1');
    for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil.example', 'tel:123', '/a b', undefined, '', '/'.repeat(600)])
      expect(safeDeepLink(bad)).toBe('/notifications');
  });

  it('admins cannot publish announcements that link or load images from outside', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    const base = { title: { en: 'Hi' }, body: { en: 'Body' }, segment: 'all' as const };
    await code(b.adminSaveAnnouncement({ ...base, deepLink: 'https://evil.example' }), 'validation');
    await code(b.adminSaveAnnouncement({ ...base, deepLink: 'javascript:alert(1)' }), 'validation');
    await code(b.adminSaveAnnouncement({ ...base, imageUrl: 'http://insecure.example/a.png' }), 'validation');
    await code(b.adminSaveAnnouncement({ ...base, title: { en: 'T'.repeat(5000) } }), 'validation');
    const ok = await b.adminSaveAnnouncement({ ...base, deepLink: '/biodata', imageUrl: 'https://cdn.example/a.png' });
    await code(b.adminSaveAnnouncement({ ...base, id: ok.id, deepLink: '//evil.example' }), 'validation');
    const edited = await b.adminSaveAnnouncement({ ...base, id: ok.id, status: 'published', createdBy: 'u_x' } as never);
    expect(edited.status).toBe('draft');
    expect(edited.createdBy).toBe('u_admin');
  });
});

describe('Photo uploads (owner request: allow up to 5 MB)', () => {
  it('accepts real photo types up to 5 MB, before compression', () => {
    expect(MAX_UPLOAD_BYTES).toBe(5 * 1024 * 1024);
    expect(uploadProblem({ mimeType: 'image/jpeg', uri: 'file:///a.jpg', fileSize: 4.9 * 1024 * 1024 })).toBeNull();
    expect(uploadProblem({ mimeType: 'image/heic', uri: 'ph://x', fileSize: 3_000_000 })).toBeNull();
    expect(uploadProblem({ uri: 'file:///DCIM/IMG_1.PNG', fileSize: 1000 })).toBeNull();
    expect(uploadProblem({ uri: jpeg(4_000_000) })).toBeNull();
  });
  it('refuses bigger files and non-photos (svg can carry scripts)', () => {
    expect(uploadProblem({ mimeType: 'image/jpeg', uri: 'file:///a.jpg', fileSize: 5 * 1024 * 1024 + 1 })).toBe('v.photoTooLarge');
    expect(uploadProblem({ uri: jpeg(6_000_000) })).toBe('v.photoTooLarge');
    expect(uploadProblem({ mimeType: 'image/svg+xml', uri: 'file:///a.svg', fileSize: 10 })).toBe('v.photoType');
    expect(uploadProblem({ mimeType: 'application/pdf', uri: 'file:///a.pdf', fileSize: 10 })).toBe('v.photoType');
    expect(uploadProblem({ uri: 'file:///a.gif', fileSize: 10 })).toBe('v.photoType');
  });
});

describe('Security round 2: OTP guessing across resends', () => {
  it('a new code does not reset the hourly wrong-guess budget', async () => {
    const b = make();
    await b.logout();
    const PHONE = '9812300555';
    let wrong = 0;
    // Attacker: guess until locked out, ask for a new code, repeat.
    for (let round = 0; round < 4; round++) {
      advance(RESEND_COOLDOWN_MS + 1);
      const sent = await b.requestOtp('+91', PHONE).then(() => true, () => false);
      if (!sent) break;
      for (let i = 0; i < 5; i++) {
        const e = await b.verifyOtp('+91', PHONE, '000000').then(() => null, (x: AppError) => x);
        if (e?.code === 'invalid_otp') wrong++;
      }
    }
    expect(wrong).toBe(MAX_OTP_FAILS_PER_HOUR);
    // Even the right code is refused until the hour has passed — and no new code can be sent.
    await code(b.verifyOtp('+91', PHONE, DEMO_OTP), 'rate_limited');
    await code(b.requestOtp('+91', PHONE), 'rate_limited');
    advance(3600_000 + 1);
    await b.requestOtp('+91', PHONE);
    await b.verifyOtp('+91', PHONE, DEMO_OTP);
    expect((await b.getSession())?.phone).toBe(PHONE);
  });
});

describe('Security round 2: invisible spoofing characters', () => {
  const RLO = '‮';
  it('detects bidi overrides, zero-width spaces and control codes but allows Urdu/Telugu joiners', () => {
    expect(unsafeText(`Imran ${RLO}moc.live`)).toBe(true);
    expect(unsafeText('call​me')).toBe(true);
    expect(unsafeText('⁦x⁩')).toBe(true);
    expect(unsafeText('bell\u0007')).toBe(true);
    expect(unsafeText('﻿hi')).toBe(true);
    expect(unsafeText('می‌ں')).toBe(false); // ZWNJ
    expect(unsafeText('క్‍ష')).toBe(false); // ZWJ
    expect(unsafeText('line one\nline two\ttab')).toBe(false);
    expect(stripUnsafe(`a${RLO}b​c`)).toBe('abc');
  });

  it('a biodata with a spoofed name is refused; an interest message and report are cleaned', async () => {
    const b = make();
    await as(b, GROOM);
    const mine = (await b.getMyProfile())!;
    const spoof = { ...mine.biodata, basic: { ...mine.biodata.basic, fullName: `Imran ${RLO}moc.live` } };
    await code(b.saveDraft(spoof, mine.lastStep), 'validation');
    const req = await b.sendRequest('p_12', { message: `Salaam${RLO}⁦ hi​`, offerPhone: false, consent: false, idempotencyKey: 'k-bidi' });
    expect(req.message).toBe('Salaam hi');
    await b.reportProfile('p_6', 'fake', `${RLO}fake﻿`);
    await as(b, DEMO_ADMIN_PHONE);
    expect((await b.adminListReports()).find((r) => r.profileId === 'p_6')!.details).toBe('fake');
  });

  it('admins cannot publish an announcement with hidden characters', async () => {
    const b = make();
    await as(b, DEMO_ADMIN_PHONE);
    await code(b.adminSaveAnnouncement({ title: { en: `Offer${RLO}` }, body: { en: 'x' }, segment: 'all' } as never), 'validation');
  });
});
