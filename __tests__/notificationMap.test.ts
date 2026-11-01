import { mapNotification } from '@/services/supabase/map';
import en from '@/i18n/en';
import ur from '@/i18n/ur';
import te from '@/i18n/te';

/**
 * Owner report 2026-11-01 (real Android build): the bell opened "Something went wrong" for every account.
 * Cause: get_notifications returns an all-null `announcement` object on ordinary notifications, which the app
 * took for a real announcement and then read its (null) title. These rows are copied from the live server.
 */
const nullAnnouncement = { id: null, body: null, title: null, deepLink: null, imageUrl: null, priority: null };
const live = [
  { id: 'n1', body: '', type: 'request_received', params: { name: 'Test3', offered: '1' }, read_at: null, user_id: 'u', deep_link: '/requests', created_at: '2026-11-01T12:55:36Z', announcement: nullAnnouncement, announcement_id: null },
  { id: 'n2', body: '', type: 'team_created', params: {}, read_at: null, user_id: 'u', deep_link: '/biodata/preview', created_at: '2026-11-01T12:38:20Z', announcement: nullAnnouncement, announcement_id: null },
  { id: 'n3', body: '', type: 'admin_alert', params: { code: 'HR-10034', kind: 'pending_profile' }, read_at: '2026-11-01T12:38:47Z', user_id: 'u', deep_link: '/admin/member/x', created_at: '2026-11-01T12:33:34Z', announcement: nullAnnouncement, announcement_id: null },
  { id: 'n4', body: '', type: 'boost_started', params: { until: '2026-11-08T12:54:00Z' }, read_at: null, user_id: 'u', deep_link: '/boost', created_at: '2026-11-01T12:54:00Z', announcement: nullAnnouncement, announcement_id: null },
  { id: 'n5', body: '', type: 'profile_rejected', params: { note: 'Change it' }, read_at: null, user_id: 'u', deep_link: '/biodata', created_at: '2026-11-01T12:59:30Z', announcement: nullAnnouncement, announcement_id: null },
  { id: 'n6', body: '', type: 'profile_viewed', params: { count: '1' }, read_at: null, user_id: 'u', deep_link: '/activity', created_at: '2026-11-01T12:40:10Z', announcement: nullAnnouncement, announcement_id: null },
  { id: 'n7', body: '', type: 'announcement', params: {}, read_at: null, user_id: 'u', deep_link: null, created_at: '2026-11-01T12:42:38Z', announcement: { id: 'a1', body: { en: 'Hi' }, title: { en: 'Hi' }, deepLink: null, imageUrl: null, priority: 'normal' }, announcement_id: 'a1' },
];

describe('notifications from the live server', () => {
  it('ordinary notifications carry no announcement; a real announcement keeps it', () => {
    const m = live.map((r) => mapNotification(r as never));
    expect(m.filter((n) => n.announcement).map((n) => n.id)).toEqual(['n7']);
    expect(m.find((n) => n.id === 'n7')?.announcement?.title).toEqual({ en: 'Hi' });
  });

  it('every notification type the server sends has its text in English, Urdu and Telugu', () => {
    for (const dict of [en, ur, te]) {
      const t = (dict as unknown as { notifications: { t: Record<string, string> } }).notifications.t;
      for (const r of live) {
        const key = r.type === 'request_received' && r.params.offered ? 'request_received_offer' : r.type;
        expect(typeof t[key]).toBe('string');
      }
    }
  });
});
