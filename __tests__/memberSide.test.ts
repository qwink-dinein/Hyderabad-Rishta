import { DEMO_OTP } from '@/data/seed';
import { EMPTY_FILTERS } from '@/domain/search';
import { DemoBackend } from '@/services/demo/demoBackend';
import { memoryKV } from '@/services/storage';

/** Owner report 2026-11-01: a bride only ever sees grooms and a groom only brides — no filter can change it. */
describe('members only see the opposite side', () => {
  const cases = [
    ['groom', '9000000001', 'bride'],
    ['bride', '9000000102', 'groom'],
  ] as const;
  for (const [who, phone, expected] of cases) {
    for (const show of [undefined, 'bride', 'groom'] as const) {
      it(`${who} with the ${show ?? 'no'} filter sees only ${expected}s everywhere`, async () => {
        const b = new DemoBackend({ storage: memoryKV(), secure: memoryKV() });
        await b.requestOtp('+91', phone);
        await b.verifyOtp('+91', phone, DEMO_OTP);
        const f = { ...EMPTY_FILTERS, show };
        const s = await b.getDiscoverSections(f);
        const feed = await b.getDiscoverFeed(f, { pageSize: 50 });
        const search = await b.searchProfiles(f, 0, 50);
        const featured = await b.getFeatured();
        const all = [...s.featured, ...s.recommended, ...s.recent, ...s.newSince, ...feed.items, ...search.items, ...featured];
        expect(all.length).toBeGreaterThan(0);
        expect(all.every((p) => p.profileType === expected)).toBe(true);
      });
    }
  }
});
