import type { SearchFilters } from '@/domain/search';
import type { AnnouncementStats } from '@/domain/metrics';
import type {
  AdminMember,
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
  PhoneOffer,
  PokeEligibility,
  PricingChange,
  PricingConfig,
  Profile,
  ProfileStatus,
  PublicProfile,
  PushPrefs,
  Report,
  SecurityStatus,
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
  | 'phone_taken'
  | 'fee_disabled'
  | 'not_accepting'
  | 'incomplete_biodata'
  | 'profile_removed'
  | 'boost_active'
  | 'invalid_pin'
  | 'pin_locked'
  | 'pin_not_set'
  | 'device_not_trusted'
  | 'otp_required'
  | 'invalid_state'
  | 'account_removed'
  | 'account_suspended'
  | 'invalid_recovery_code'
  | 'declined_recently'
  | 'consent_required'
  | 'poke_wait'
  | 'poke_used'
  | 'poke_limit'
  | 'poke_optout'
  | 'expired';

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
  /** What I have consented to share with the other party (photos / full biodata). */
  myConsent: ConsentScopes;
  /** Phone-number offers in each direction (latest). Numbers themselves only appear in `other.contact`. */
  myOffer?: PhoneOffer;
  theirOffer?: PhoneOffer;
  /** Gentle-reminder availability for the sender. */
  poke: PokeEligibility;
  /** My own number, masked (e.g. ••••••1234) — for the "offer my number" confirmation. */
  myPhoneMasked: string;
}

export interface SendInterestInput {
  message?: string;
  /** Offer my phone number with the interest (revealed only if they accept). */
  offerPhone: boolean;
  /** Must be true when offerPhone is true: explicit consent checkbox. */
  consent: boolean;
  /** Client-generated; repeated submits (double taps, retries) return the same request. */
  idempotencyKey: string;
}

export interface ConnectionMetrics {
  interests: number;
  accepted: number;
  declined: number;
  expired: number;
  blocked: number;
  phoneOffers: number;
  phoneShared: number;
  pokes: number;
  pokedThenAnswered: number;
  /** 0..1 */
  acceptanceRate: number;
  sharingRate: number;
  pokeResponseRate: number;
  medianResponseHours?: number;
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
  trash: number;
  requireApproval: boolean;
  connections: ConnectionMetrics;
  push: PushHealth;
  boosts: { active: number; visible: number };
}

/** Push pipeline health for admins (counts only — never tokens or message text). */
export interface PushHealth {
  devices: number;
  usersWithDevices: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
  skipped: number;
  /** Demo mode has no push provider: messages that WOULD have been sent. */
  notConfigured: number;
}

export interface PushSettings {
  prefs: PushPrefs;
  /** How many phones are registered for this account. */
  devices: number;
}

export interface AdminRequestRow extends ContactRequest {
  fromName: string;
  toName: string;
  fromCode: string;
  toCode: string;
}

/** One search hit in the admin console. Phone always masked. */
export interface MemberRow {
  userId: string;
  profileId?: string;
  code?: string;
  name?: string;
  phoneMasked: string;
  role: User['role'];
  profileStatus?: ProfileStatus;
  city?: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deletedAt?: string;
  /** Added by the team without OTP; `claimedAt` once the owner has logged in. */
  addedByTeam?: boolean;
  claimedAt?: string;
}

/** Admin "add a member" (owner request 2026-10-29): the number's owner later claims it with OTP. */
export interface AdminPhoneCheck {
  available: boolean;
  countryCode: string;
  phone: string;
  /** When taken: the existing account (open it instead of creating a duplicate). */
  existingUserId?: string;
}
export interface AdminMemberDraft {
  profile: Profile;
  userId: string;
  phoneMasked: string;
  /** The owner has logged in: from now on only they edit the biodata. */
  claimed: boolean;
}

/** Everything an admin needs to act on one member, on one screen. */
export interface MemberDetail {
  member: MemberRow;
  user: Omit<User, 'phone'> & { phoneMasked: string };
  profile?: Profile;
  requests: AdminRequestRow[];
  reportsAbout: Report[];
  reportsBy: Report[];
  orders: Order[];
}

export interface TrashItem {
  kind: 'user' | 'profile';
  id: string;
  label: string;
  deletedAt: string;
  deletedBy?: string;
  reason?: string;
  purgeAt: string;
}

export interface RecipientRow {
  userId: string;
  profileCode?: string;
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
  /** OTP: registration, a new phone, Forgot PIN, or first PIN for an older account. Trusts this phone. */
  verifyOtp(countryCode: string, phone: string, code: string): Promise<{ user: User; isNew: boolean; needsPin: boolean }>;
  /** Returning login on a phone that verified this number before. Never sends an OTP. */
  pinLogin(countryCode: string, phone: string, pin: string): Promise<{ user: User }>;
  /** Create/reset (right after an OTP) or change (with the current PIN). Other phones are signed out on reset/change. */
  setPin(pin: string, currentPin?: string): Promise<User>;
  /** Prefill for the login screen: last number used on this phone and whether PIN login is possible here. */
  getLoginHint(): Promise<{ countryCode: string; phone: string; canUsePin: boolean } | null>;
  getSession(): Promise<User | null>;
  /** Revokes this phone's session; keeps the device key so the PIN works next time. */
  logout(): Promise<void>;
  setLanguage(lang: Lang): Promise<void>;
  deactivateAccount(): Promise<void>;
  deleteAccount(): Promise<void>;

  // own profile
  getMyProfile(): Promise<Profile | null>;
  saveDraft(biodata: Biodata, lastStep: number): Promise<Profile>;
  submitForPublication(): Promise<{ profile: Profile; order?: Order }>;
  setPaused(paused: boolean): Promise<Profile>;
  /** `planId` picks a Boost option (default: the shortest available). Price/duration come from the server's config. */
  startBoost(planId?: string): Promise<{ profile: Profile; order: Order }>;
  completePayment(orderId: string, outcome: 'success' | 'failure'): Promise<{ order: Order; profile: Profile }>;
  getMyOrders(): Promise<Order[]>;
  getDashboard(): Promise<DashboardMetrics>;

  // discovery
  searchProfiles(filters: SearchFilters, page: number, pageSize?: number): Promise<Page<PublicProfile>>;
  getProfile(profileId: string): Promise<PublicProfile>;
  getShortlistIds(): Promise<string[]>;
  getShortlist(): Promise<PublicProfile[]>;
  /**
   * Boosted profiles for the Featured section: every active, published boost the viewer is eligible
   * to see, regardless of the viewer's filters, in a fair per-viewer daily rotation. Records impressions.
   */
  getFeatured(limit?: number): Promise<PublicProfile[]>;
  toggleShortlist(profileId: string): Promise<boolean>;

  // requests & consent
  sendRequest(toProfileId: string, input: SendInterestInput): Promise<ContactRequest>;
  getRequests(): Promise<RequestView[]>;
  respondToRequest(requestId: string, decision: 'accepted' | 'declined'): Promise<ContactRequest>;
  withdrawRequest(requestId: string): Promise<ContactRequest>;
  setConsent(requestId: string, scopes: ConsentScopes): Promise<void>;
  getRequestStatusWith(profileId: string): Promise<RequestView | null>;
  /** After acceptance, either side may offer their number; the other must accept before it is revealed. */
  offerPhone(requestId: string, consent: boolean, idempotencyKey: string): Promise<PhoneOffer>;
  respondToPhoneOffer(offerId: string, decision: 'accepted' | 'declined'): Promise<PhoneOffer>;
  /** Withdraw my offer before it is accepted. */
  withdrawPhoneOffer(offerId: string): Promise<PhoneOffer>;
  pokeRequest(requestId: string): Promise<void>;
  setAllowReminders(allow: boolean): Promise<void>;

  // safety
  reportProfile(profileId: string, reason: string, details?: string): Promise<void>;
  blockProfile(profileId: string): Promise<void>;
  unblockProfile(profileId: string): Promise<void>;
  getBlockedIds(): Promise<string[]>;
  getBlockedProfiles(): Promise<{ profileId: string; code: string; name: string }[]>;

  // notifications
  getNotifications(): Promise<NotificationView[]>;
  // push (phones)
  /** Binds this phone's Expo push token to the signed-in account (moving it from any other account). */
  registerPushDevice(token: string, platform: 'ios' | 'android'): Promise<void>;
  /** Removes this phone (call before logout so a shared phone stops receiving this account's alerts). */
  unregisterPushDevice(token: string): Promise<void>;
  getPushSettings(): Promise<PushSettings>;
  setPushPrefs(patch: Partial<PushPrefs>): Promise<PushPrefs>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
  recordNotificationClick(id: string): Promise<void>;

  // pricing
  getPricing(): Promise<PricingConfig>;

  // admin
  adminStats(): Promise<AdminStats>;
  adminListProfiles(status?: ProfileStatus): Promise<(Profile & { phoneMasked: string })[]>;
  adminSetProfileStatus(profileId: string, status: ProfileStatus, note?: string): Promise<Profile>;
  adminListUsers(): Promise<(User & { profileStatus?: ProfileStatus; profileCode?: string })[]>;
  adminSetUserDeactivated(userId: string, deactivated: boolean): Promise<void>;
  adminUpdatePricing(cfg: PricingConfig): Promise<PricingConfig>;
  adminPricingHistory(): Promise<PricingChange[]>;
  adminListOrders(): Promise<(Order & { profileCode: string })[]>;
  adminListReports(): Promise<(Report & { profileName: string; profileCode: string; profileUserId?: string })[]>;
  adminResolveReport(reportId: string, status: 'resolved' | 'dismissed', pauseProfile?: boolean): Promise<void>;
  adminListAnnouncements(): Promise<(Announcement & { stats: AnnouncementStats })[]>;
  adminSaveAnnouncement(a: Partial<Announcement> & Pick<Announcement, 'title' | 'body' | 'segment'>): Promise<Announcement>;
  adminPublishAnnouncement(id: string, scheduledAt?: string): Promise<Announcement>;
  adminArchiveAnnouncement(id: string): Promise<Announcement>;
  adminAudiencePreview(segment: AnnouncementSegment): Promise<number>;
  adminRecipientReport(id: string): Promise<RecipientRow[]>;
  adminAuditLog(): Promise<(AuditEvent & { targetLabel?: string })[]>;
  /** Search by profile ID (HR-10023), name, city or phone digits. Phone searches are audited. */
  adminSearch(query: string): Promise<MemberRow[]>;
  adminGetMember(userId: string): Promise<MemberDetail>;
  /** Is this number free for a new team-added member? (normalised, one number = one account) */
  adminCheckPhone(countryCode: string, phone: string): Promise<AdminPhoneCheck>;
  /** Creates the account for this number (no OTP) with its biodata as a draft. */
  adminCreateMember(input: { countryCode: string; phone: string; biodata: Biodata; lastStep: number }): Promise<AdminMemberDraft>;
  /** Edits a team-added biodata until its owner claims the account. */
  adminSaveMemberBiodata(profileId: string, biodata: Biodata, lastStep: number): Promise<AdminMemberDraft>;
  adminGetMemberDraft(profileId: string): Promise<AdminMemberDraft>;
  /** Publishes a complete team-added biodata (the team is the approver; no fee is charged). */
  adminPublishMember(profileId: string): Promise<AdminMemberDraft>;

  // admin — full moderation rights (master + sub-admins)
  adminSetRequireApproval(requireApproval: boolean): Promise<{ requireApproval: boolean; pending: number }>;
  adminApproveAllPending(): Promise<number>;
  adminDeleteProfile(profileId: string, reason: string): Promise<void>;
  adminRemovePhoto(profileId: string, photoId: string): Promise<void>;
  adminDeleteUser(userId: string, reason: string): Promise<void>;
  adminListRequests(): Promise<AdminRequestRow[]>;
  adminDeleteRequest(requestId: string): Promise<void>;
  adminDeleteReport(reportId: string): Promise<void>;
  adminDeleteAnnouncement(id: string): Promise<void>;
  adminCancelOrder(orderId: string): Promise<void>;
  adminListTrash(): Promise<TrashItem[]>;

  // master only
  masterRestore(kind: 'user' | 'profile', id: string): Promise<void>;
  masterPurge(kind: 'user' | 'profile', id: string): Promise<void>;
  masterListAdmins(): Promise<AdminMember[]>;
  masterAddSubAdmin(countryCode: string, phone: string): Promise<{ id: string }>;
  masterRemoveSubAdmin(userId: string): Promise<void>;
  masterTransfer(toUserId: string, otp: string): Promise<void>;
  masterSecurityStatus(): Promise<SecurityStatus>;
  masterGenerateRecoveryCodes(otp: string): Promise<string[]>;
  masterSetBackupPhone(countryCode: string, phone: string, otp: string): Promise<void>;
  masterCancelRecovery(): Promise<void>;

  // public (logged out): lost-phone recovery for the master account
  recoverMaster(countryCode: string, phone: string, otp: string, code: string): Promise<{ status: 'completed' | 'pending'; completesAt?: string }>;
}
