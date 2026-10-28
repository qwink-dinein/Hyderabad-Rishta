import type { SearchFilters } from '@/domain/search';
import type { AnnouncementStats } from '@/domain/metrics';
import type {
  Announcement,
  AnnouncementDelivery,
  AnnouncementSegment,
  AppNotification,
  AuditEvent,
  Biodata,
  ConsentScopes,
  ContactRequest,
  DashboardMetrics,
  Lang,
  Order,
  PricingChange,
  PricingConfig,
  Profile,
  ProfileStatus,
  PublicProfile,
  Report,
  User,
} from '@/domain/types';

export type ErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'rate_limited'
  | 'invalid_otp'
  | 'otp_expired'
  | 'blocked'
  | 'duplicate'
  | 'fee_disabled'
  | 'not_accepting'
  | 'incomplete_biodata'
  | 'invalid_state';

/** All backend failures carry a stable code; the UI maps it to `err.<code>`. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export interface OtpRequestResult {
  /** True when no SMS provider is configured — the UI must label this clearly. */
  demo: boolean;
  resendAvailableAt: string;
  resendsLeft: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  hasMore: boolean;
}

export interface RequestView {
  request: ContactRequest;
  /** The other party's privacy-projected profile. */
  other: PublicProfile;
  direction: 'received' | 'sent';
  /** What I have consented to share with the other party. */
  myConsent: ConsentScopes;
}

export interface NotificationView extends AppNotification {
  announcement?: Pick<Announcement, 'id' | 'title' | 'body' | 'priority' | 'deepLink' | 'imageUrl'>;
}

export interface AdminStats {
  users: number;
  activeUsers: number;
  profiles: Record<ProfileStatus, number>;
  brides: number;
  grooms: number;
  openReports: number;
  revenue: number;
  simulatedRevenue: number;
  requests: number;
  acceptedRequests: number;
}

export interface RecipientRow {
  userId: string;
  maskedPhone: string;
  delivery: AnnouncementDelivery;
}

/**
 * The backend contract. Two implementations:
 *  - DemoBackend (offline, persisted locally, clearly labelled) — default for localhost/Expo Go.
 *  - Supabase (RLS + RPC) — see supabase/migrations and services/supabase.
 * Every method enforces authorisation itself; the UI hiding a button is never the control.
 */
export interface Backend {
  readonly kind: 'demo' | 'supabase';

  // auth
  requestOtp(countryCode: string, phone: string): Promise<OtpRequestResult>;
  verifyOtp(countryCode: string, phone: string, code: string): Promise<{ user: User; isNew: boolean }>;
  getSession(): Promise<User | null>;
  logout(): Promise<void>;
  setLanguage(lang: Lang): Promise<void>;
  deactivateAccount(): Promise<void>;
  deleteAccount(): Promise<void>;

  // own profile
  getMyProfile(): Promise<Profile | null>;
  saveDraft(biodata: Biodata, lastStep: number): Promise<Profile>;
  submitForPublication(): Promise<{ profile: Profile; order?: Order }>;
  setPaused(paused: boolean): Promise<Profile>;
  startBoost(): Promise<{ profile: Profile; order: Order }>;
  completePayment(orderId: string, outcome: 'success' | 'failure'): Promise<{ order: Order; profile: Profile }>;
  getMyOrders(): Promise<Order[]>;
  getDashboard(): Promise<DashboardMetrics>;

  // discovery
  searchProfiles(filters: SearchFilters, page: number, pageSize?: number): Promise<Page<PublicProfile>>;
  getProfile(profileId: string): Promise<PublicProfile>;
  getShortlistIds(): Promise<string[]>;
  getShortlist(): Promise<PublicProfile[]>;
  toggleShortlist(profileId: string): Promise<boolean>;

  // requests & consent
  sendRequest(toProfileId: string, message?: string): Promise<ContactRequest>;
  getRequests(): Promise<RequestView[]>;
  respondToRequest(requestId: string, decision: 'accepted' | 'declined'): Promise<ContactRequest>;
  withdrawRequest(requestId: string): Promise<ContactRequest>;
  setConsent(requestId: string, scopes: ConsentScopes): Promise<void>;
  getRequestStatusWith(profileId: string): Promise<RequestView | null>;

  // safety
  reportProfile(profileId: string, reason: string, details?: string): Promise<void>;
  blockProfile(profileId: string): Promise<void>;
  unblockProfile(profileId: string): Promise<void>;
  getBlockedIds(): Promise<string[]>;

  // notifications
  getNotifications(): Promise<NotificationView[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  recordNotificationClick(id: string): Promise<void>;

  // pricing
  getPricing(): Promise<PricingConfig>;

  // admin
  adminStats(): Promise<AdminStats>;
  adminListProfiles(status?: ProfileStatus): Promise<(Profile & { phoneMasked: string })[]>;
  adminSetProfileStatus(profileId: string, status: ProfileStatus, note?: string): Promise<Profile>;
  adminListUsers(): Promise<(User & { profileStatus?: ProfileStatus })[]>;
  adminSetUserDeactivated(userId: string, deactivated: boolean): Promise<void>;
  adminUpdatePricing(cfg: PricingConfig): Promise<PricingConfig>;
  adminPricingHistory(): Promise<PricingChange[]>;
  adminListOrders(): Promise<Order[]>;
  adminListReports(): Promise<(Report & { profileName: string })[]>;
  adminResolveReport(reportId: string, status: 'resolved' | 'dismissed', pauseProfile?: boolean): Promise<void>;
  adminListAnnouncements(): Promise<(Announcement & { stats: AnnouncementStats })[]>;
  adminSaveAnnouncement(a: Partial<Announcement> & Pick<Announcement, 'title' | 'body' | 'segment'>): Promise<Announcement>;
  adminPublishAnnouncement(id: string, scheduledAt?: string): Promise<Announcement>;
  adminArchiveAnnouncement(id: string): Promise<Announcement>;
  adminAudiencePreview(segment: AnnouncementSegment): Promise<number>;
  adminRecipientReport(id: string): Promise<RecipientRow[]>;
  adminAuditLog(): Promise<AuditEvent[]>;
}
