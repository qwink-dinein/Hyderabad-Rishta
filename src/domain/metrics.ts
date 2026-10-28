import { isBoostActive, profileTypeOf } from './privacy';
import type {
  Announcement,
  AnnouncementDelivery,
  AnnouncementSegment,
  ContactRequest,
  DashboardMetrics,
  Profile,
  Shortlist,
  User,
  ViewEvent,
} from './types';

/** Profile-reach metrics are computed from recorded events only (PRD §13). */
export function dashboardMetrics(
  profile: Profile | undefined,
  data: { views: ViewEvent[]; shortlists: Shortlist[]; requests: ContactRequest[] },
  now = new Date(),
): DashboardMetrics {
  if (!profile) {
    return { status: 'none', views: 0, uniqueViewers: 0, shortlistedBy: 0, requestsReceived: 0, requestsAccepted: 0, boostActive: false };
  }
  // Owner's own views are excluded at write time AND here (defence in depth).
  const views = data.views.filter((v) => v.profileId === profile.id && v.viewerUserId !== profile.userId);
  const received = data.requests.filter((r) => r.toProfileId === profile.id);
  return {
    status: profile.status,
    views: views.length,
    uniqueViewers: new Set(views.map((v) => v.viewerUserId)).size,
    shortlistedBy: data.shortlists.filter((s) => s.profileId === profile.id && s.userId !== profile.userId).length,
    requestsReceived: received.length,
    requestsAccepted: received.filter((r) => r.status === 'accepted').length,
    boostActive: isBoostActive(profile, now),
    boostUntil: profile.boostUntil,
  };
}

/** Which users an announcement targets. Deactivated users and admins are excluded. */
export function audienceFor(segment: AnnouncementSegment, users: User[], profiles: Profile[]): User[] {
  const byUser = new Map(profiles.filter((p) => !p.deletedAt).map((p) => [p.userId, p]));
  return users.filter((u) => {
    if (u.deactivatedAt || u.deletedAt || u.role !== 'user') return false;
    const p = byUser.get(u.id);
    switch (segment) {
      case 'all':
        return true;
      case 'brides':
        return !!p && profileTypeOf(p) === 'bride';
      case 'grooms':
        return !!p && profileTypeOf(p) === 'groom';
      case 'published':
        return p?.status === 'published';
      case 'unpublished':
        return !p || p.status !== 'published';
    }
  });
}

export interface AnnouncementStats {
  targeted: number;
  inAppAvailable: number;
  pushSubmitted: number;
  pushDelivered: number;
  pushFailed: number;
  pushNotConfigured: number;
  uniqueViewers: number;
  unread: number;
  clicks: number;
  viewRate: number; // 0..1
}

/**
 * Honest readership analytics (PRD §14): a "view" is recorded only when the user opens the
 * announcement in-app. In-app availability, push submission and delivery are reported separately.
 */
export function announcementStats(a: Announcement, deliveries: AnnouncementDelivery[]): AnnouncementStats {
  const d = deliveries.filter((x) => x.announcementId === a.id);
  const viewed = d.filter((x) => !!x.viewedAt).length;
  return {
    targeted: d.length,
    inAppAvailable: d.filter((x) => !!x.inAppAt).length,
    pushSubmitted: d.filter((x) => x.pushStatus === 'submitted' || x.pushStatus === 'delivered' || x.pushStatus === 'failed').length,
    pushDelivered: d.filter((x) => x.pushStatus === 'delivered').length,
    pushFailed: d.filter((x) => x.pushStatus === 'failed').length,
    pushNotConfigured: d.filter((x) => x.pushStatus === 'not_configured').length,
    uniqueViewers: viewed,
    unread: d.length - viewed,
    clicks: d.filter((x) => !!x.clickedAt).length,
    viewRate: d.length ? viewed / d.length : 0,
  };
}

export function isAnnouncementLive(a: Announcement, now = new Date()): boolean {
  if (a.status !== 'published') return false;
  if (a.expiresAt && new Date(a.expiresAt).getTime() < now.getTime()) return false;
  return true;
}
