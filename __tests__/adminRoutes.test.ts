import { homeHrefFor, isMemberOnlyPath } from '@/domain/routes';

/** Owner report 2026-11-01: a master admin was moved to member screens and asked to create a biodata. */
describe('an admin is never a member', () => {
  it('member-only screens are recognised (admins get sent to the admin console from these)', () => {
    for (const p of ['/home', '/discover', '/shortlist', '/requests', '/dashboard', '/biodata', '/biodata/preview', '/boost', '/activity', '/filters', '/request/abc'])
      expect(isMemberOnlyPath(p)).toBe(true);
  });
  it('admin and shared screens are not', () => {
    for (const p of ['/admin', '/admin/member/x', '/admin/member-biodata', '/notifications', '/settings', '/pin', '/login', '/legal/help', '/', '/homepage-x', '/requests-x'])
      expect(isMemberOnlyPath(p)).toBe(false);
  });
  it('"Home" means the admin console for admins and masters', () => {
    expect(homeHrefFor({ role: 'master' })).toBe('/admin');
    expect(homeHrefFor({ role: 'admin' })).toBe('/admin');
    expect(homeHrefFor({ role: 'user' })).toBe('/home');
    expect(homeHrefFor(null)).toBe('/');
  });
});
