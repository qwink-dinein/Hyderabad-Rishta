/**
 * Core domain model. Mirrors the Supabase schema in supabase/migrations.
 * Keep this file framework-free so it can be shared by the app, tests and edge functions.
 */

export type Lang = 'en' | 'ur' | 'te';
/** `admin` = sub-admin (everything except team & recovery); `master` = exactly one owner account. */
export type Role = 'user' | 'admin' | 'master';
export const isAdminRole = (r?: Role) => r === 'admin' || r === 'master';

/** What the profile owner is looking for. The profile itself is the opposite type. */
export type LookingFor = 'bride' | 'groom';
/** Profile type is used for pricing and discovery ("brides" / "grooms"). */
export type ProfileType = 'bride' | 'groom';

export type ProfileStatus = 'draft' | 'pending' | 'published' | 'paused' | 'rejected';

export type Visibility = 'public' | 'onConsent' | 'hidden';

export interface User {
  id: string;
  countryCode: string;
  phone: string; // private — never leaves the backend except to its owner or with consent
  role: Role;
  language: Lang;
  createdAt: string;
  deactivatedAt?: string;
  /** Who deactivated: the user themself (undone by logging in) or an admin (a suspension). */
  deactivatedBy?: string;
  /** Soft-deleted by an admin (in Trash, restorable by the master for 30 days). */
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
  /** Set when the team removed this account's biodata: no new biodata on this number until the account is deleted. */
  profileRemovedAt?: string;
  /** Whether a quick-login PIN is set (computed; the PIN itself never leaves the server). */
  hasPin?: boolean;
  /** Phone-notification preferences (server-side so every device honours them). */
  pushPrefs?: PushPrefs;
}

/** Push categories. `account` (approvals, payments, safety, security) cannot be switched off in-app. */
export type PushCategory = 'interests' | 'activity' | 'account' | 'announcements';

export interface PushPrefs {
  /** Master switch for this account's phones. */
  enabled: boolean;
  interests: boolean;
  activity: boolean;
  announcements: boolean;
  /** Show the other person's name on the lock screen (off by default — family phones). */
  showNames: boolean;
}

export interface PushDevice {
  token: string; // Expo push token, e.g. ExponentPushToken[xxxx]
  userId: string;
  platform: 'ios' | 'android';
  createdAt: string;
  lastSeenAt: string;
}

export type PushOutboxStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'skipped';

export interface PushOutboxItem {
  id: string;
  notificationId: string;
  userId: string;
  token?: string;
  category: PushCategory;
  title: string;
  body: string;
  data: { notificationId: string; deepLink?: string };
  status: PushOutboxStatus;
  /** Why it was skipped/failed: no_device, disabled, category_off, rate_limited, not_configured, DeviceNotRegistered… */
  reason?: string;
  attempts: number;
  createdAt: string;
  sentAt?: string;
  ticketId?: string;
}

export interface Photo {
  id: string;
  uri: string;
}

export interface BasicInfo {
  createdFor: string;
  lookingFor: LookingFor;
  fullName: string;
  dob: string; // YYYY-MM-DD
  heightCm: number;
  maritalStatus: string;
  /** Required when marital status is anything other than never married. */
  children?: number;
  motherTongue: string;
  aboutMe?: string;
}

export interface LocationInfo {
  country: string;
  state: string;
  district?: string;
  city: string;
  locality?: string;
  nativePlace?: string;
  nationality?: string;
  livingAbroad?: boolean;
  willingToRelocate?: string; // yes | no | maybe
}

export interface CareerInfo {
  education: string;
  educationOther?: string;
  educationDetails?: string;
  profession: string;
  professionOther?: string;
  professionDetails?: string;
  employmentType?: string;
  employer?: string;
  income?: string; // income band key or 'undisclosed'
  workLocation?: string;
}

export interface ReligionInfo {
  maslak?: string;
  /** School / sub-group within the maslak, e.g. Sunni → Hanafi. */
  subMaslak?: string;
  maslakOther?: string;
  namaz?: string;
  fasting?: string;
  hajj?: string;
  umrah?: string;
  dargah?: string;
  expectations?: string;
  compatibilityImportance?: string;
}

export interface FamilyInfo {
  familyType?: string;
  familyValues?: string;
  fatherOccupation?: string;
  motherOccupation?: string;
  siblings?: number;
  brothers?: number;
  sisters?: number;
  residence?: string;
  description?: string;
}

export interface PartnerPreferences {
  ageMin?: number;
  ageMax?: number;
  heightMin?: number;
  heightMax?: number;
  maritalStatus: string[];
  education: string[];
  profession: string[];
  countries: string[];
  states: string[];
  cities: string[];
  motherTongues: string[];
  religious?: string;
  relocation?: string;
  expectations?: string;
}

export interface PrivacySettings {
  displayName: 'full' | 'first' | 'initials';
  photoVisibility: Visibility;
  incomeVisibility: Visibility;
  familyVisibility: Visibility;
  acceptContactRequests: boolean;
  /** Gentle reminders (pokes) from people whose interest is pending. Undefined = allowed. */
  allowReminders?: boolean;
}

export interface Biodata {
  basic: BasicInfo;
  photos: Photo[];
  location: LocationInfo;
  career: CareerInfo;
  religion: ReligionInfo;
  family: FamilyInfo;
  preferences: PartnerPreferences;
  privacy: PrivacySettings;
}

export interface Profile {
  id: string;
  /** Human-friendly, sequential, never reused (e.g. HR-10023). Shown to members and admins. */
  code: string;
  userId: string;
  biodata: Biodata;
  status: ProfileStatus;
  adminNote?: string;
  publishedAt?: string;
  boostUntil?: string;
  /** Which boost end-time each lifecycle notice was already sent for (idempotent scheduler). */
  boostNotices?: { ending?: string; ended?: string };
  /** When the current (possibly extended) boost period began. */
  boostStartedAt?: string;
  /** Last weekly "boost your profile" reminder sent to the owner. */
  boostRemindedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Last completed wizard step — powers "save and continue". */
  lastStep: number;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
}

/** Scopes a profile owner can consent to share after a request is accepted. */
export interface ConsentScopes {
  photos: boolean;
  phone: boolean;
  fullBiodata: boolean;
}

/**
 * What a viewer is allowed to see. Built ONLY by `projectProfile` (domain/privacy.ts),
 * which is the single gatekeeper for field-level visibility.
 */
export interface PublicProfile {
  id: string;
  profileType: ProfileType;
  displayName: string;
  age: number;
  heightCm: number;
  maritalStatus: string;
  children?: number;
  motherTongue: string;
  aboutMe?: string;
  createdFor: string;
  acceptsRequests: boolean;
  photos: Photo[];
  photosHidden: boolean;
  location: Omit<LocationInfo, 'nativePlace'> & { nativePlace?: string };
  career: Omit<CareerInfo, 'income' | 'employer'> & { income?: string; employer?: string };
  religion: ReligionInfo;
  family?: FamilyInfo;
  familyHidden: boolean;
  preferences: PartnerPreferences;
  boosted: boolean;
  publishedAt?: string;
  /** Only present when the owner explicitly consented to share it with this viewer. */
  contact?: { countryCode: string; phone: string };
  /** Scopes the viewer has been granted (for UI hints). */
  granted: ConsentScopes;
  code: string;
  /** The viewer's history with this profile (latest interest either way), for badges. */
  relation?: Relation;
}

export interface Relation {
  status: RequestStatus;
  direction: 'sent' | 'received';
  at: string;
}

export type FeeMode = 'free' | 'paid' | 'disabled';
export interface Fee {
  mode: FeeMode;
  amount: number; // in minor-free whole currency units (INR)
}

/** One Boost option the admin configures (owner PRD 2026-10-29: 7 / 14 / 30 days, prices per type). */
export interface BoostPlan {
  /** Stable id stored on orders (e.g. "d7"). */
  id: string;
  days: number;
  fee: Record<ProfileType, Fee>;
  enabled: boolean;
  /** "Popular" label — only when the admin deliberately sets it. */
  popular: boolean;
}

export interface PricingConfig {
  version: number;
  currency: string;
  publication: Record<ProfileType, Fee>;
  /** Boost options shown on the Boost screen. The default selection is the shortest available one. */
  boostPlans: BoostPlan[];
  /** Derived summary of the default plan (kept in sync on save; read by older code and SQL). */
  boost: Record<ProfileType, Fee>;
  boostDays: number;
  requireApproval: boolean;
  /** Connection rules (admin-configurable). */
  requestExpiryDays: number;
  pokeWaitHours: number;
  pokeMaxPer7Days: number;
  updatedAt: string;
  updatedBy?: string;
}

export type OrderKind = 'publication' | 'boost';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'free' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  profileId: string;
  kind: OrderKind;
  amount: number;
  currency: string;
  status: OrderStatus;
  /** Snapshot of the terms at purchase time — later price changes never alter it. */
  terms: { pricingVersion: number; boostDays?: number; planId?: string; autoRenew: false };
  simulated: boolean;
  createdAt: string;
}

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'blocked';

export interface ContactRequest {
  id: string;
  fromUserId: string;
  fromProfileId: string;
  toUserId: string;
  toProfileId: string;
  message?: string;
  status: RequestStatus;
  createdAt: string;
  respondedAt?: string;
  expiresAt: string;
  /** Timestamps of gentle reminders (max one per request). Never changes the status. */
  pokes: string[];
}

/** Phone-number sharing has its own lifecycle, independent of the interest request. */
export type PhoneOfferStatus = 'offered' | 'accepted' | 'declined' | 'withdrawn' | 'expired';

export interface PhoneOffer {
  id: string;
  requestId: string;
  fromUserId: string;
  toUserId: string;
  status: PhoneOfferStatus;
  /** True when offered together with the initial interest (revealed when the interest is accepted). */
  withInterest: boolean;
  consentText: string;
  consentAt: string;
  createdAt: string;
  respondedAt?: string;
}

export type PokeBlockReason = 'status' | 'wait' | 'used' | 'limit' | 'optout' | 'not_sender';
export interface PokeEligibility {
  canPoke: boolean;
  reason?: PokeBlockReason;
  availableAt?: string;
}

export interface AnalyticsEvent {
  id: string;
  name: string;
  at: string;
  userId?: string;
  props?: Record<string, string | number | boolean>;
}

export interface ConsentRecord {
  id: string;
  requestId: string;
  grantorUserId: string;
  grantorProfileId: string;
  granteeUserId: string;
  scopes: ConsentScopes;
  createdAt: string;
  updatedAt: string;
}

export type NotificationType =
  | 'request_received'
  | 'request_accepted'
  | 'request_declined'
  | 'contact_shared'
  | 'profile_approved'
  | 'profile_rejected'
  | 'profile_published'
  | 'boost_started'
  | 'payment'
  | 'safety'
  | 'security'
  | 'admin_alert'
  | 'phone_offer_received'
  | 'phone_offer_accepted'
  | 'phone_offer_declined'
  | 'phone_offer_withdrawn'
  | 'poke'
  | 'request_expired'
  | 'profile_viewed'
  | 'profile_shortlisted'
  | 'boost_ending'
  | 'boost_ended'
  | 'boost_reminder'
  | 'announcement';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  params: Record<string, string>;
  deepLink?: string;
  announcementId?: string;
  readAt?: string;
  createdAt: string;
}

export type Localized = Partial<Record<Lang, string>> & { en: string };

export type AnnouncementSegment = 'all' | 'brides' | 'grooms' | 'published' | 'unpublished';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface Announcement {
  id: string;
  title: Localized;
  body: Localized;
  imageUrl?: string;
  priority: 'normal' | 'high';
  deepLink?: string;
  segment: AnnouncementSegment;
  status: AnnouncementStatus;
  pushEnabled: boolean;
  scheduledAt?: string;
  expiresAt?: string;
  publishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type PushStatus = 'not_requested' | 'not_configured' | 'submitted' | 'delivered' | 'failed';

export interface AnnouncementDelivery {
  announcementId: string;
  userId: string;
  inAppAt: string;
  pushStatus: PushStatus;
  viewedAt?: string;
  clickedAt?: string;
}

export interface ViewEvent {
  profileId: string;
  viewerUserId: string;
  at: string;
}

export interface Shortlist {
  userId: string;
  profileId: string;
  createdAt: string;
}

export interface Report {
  id: string;
  reporterUserId: string;
  profileId: string;
  reason: string;
  details?: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
}

export interface Block {
  userId: string;
  blockedProfileId: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  target?: string;
  meta?: Record<string, unknown>;
  at: string;
}

export interface PricingChange {
  id: string;
  adminId: string;
  before: PricingConfig;
  after: PricingConfig;
  at: string;
}

export interface DashboardMetrics {
  status: ProfileStatus | 'none';
  views: number;
  uniqueViewers: number;
  shortlistedBy: number;
  requestsReceived: number;
  requestsAccepted: number;
  boostActive: boolean;
  boostUntil?: string;
  /** Active boost AND published — a paused profile is not featured even while its boost runs. */
  boostVisible?: boolean;
  boostStartedAt?: string;
  /** Unique members who were shown this profile in Featured since the boost started. */
  featuredReach?: number;
  /** Latest boost (active or ended): its length and the views it earned. */
  boostState?: 'active' | 'expired';
  boostDays?: number;
  /** Views (others only) from boost start until now or its end. */
  boostViews?: number;
  /** Views in the same-length window just before the boost — only when the profile was live for all of it. */
  previousViews?: number;
  /** The comparison windows, for honest labels. */
  boostWindow?: { from: string; to: string };
  previousWindow?: { from: string; to: string };
}

/** One featured impression per viewer per day (proof of delivery for paid boosts). */
export interface BoostImpression {
  profileId: string;
  viewerUserId: string;
  day: string;
}

/** Master-admin account protection (one row). Codes are stored only as salted hashes. */
export interface MasterSecurity {
  recoveryCodes: { hash: string; usedAt?: string }[];
  codesGeneratedAt?: string;
  salt: string;
  backupPhone?: { countryCode: string; phone: string; verifiedAt: string };
  pendingRecovery?: { countryCode: string; phone: string; startedAt: string; completesAt: string };
  failedAttempts: string[];
}

export interface SecurityStatus {
  codesRemaining: number;
  codesGeneratedAt?: string;
  backupPhoneMasked?: string;
  pendingRecovery?: { phoneMasked: string; startedAt: string; completesAt: string };
}

export interface AdminMember {
  id: string;
  role: Role;
  phoneMasked: string;
  createdAt: string;
  deactivatedAt?: string;
}
