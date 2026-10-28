/**
 * Core domain model. Mirrors the Supabase schema in supabase/migrations.
 * Keep this file framework-free so it can be shared by the app, tests and edge functions.
 */

export type Lang = 'en' | 'ur' | 'te';
export type Role = 'user' | 'admin';

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
  userId: string;
  biodata: Biodata;
  status: ProfileStatus;
  adminNote?: string;
  publishedAt?: string;
  boostUntil?: string;
  createdAt: string;
  updatedAt: string;
  /** Last completed wizard step — powers "save and continue". */
  lastStep: number;
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
  motherTongue: string;
  aboutMe?: string;
  createdFor: string;
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
}

export type FeeMode = 'free' | 'paid' | 'disabled';
export interface Fee {
  mode: FeeMode;
  amount: number; // in minor-free whole currency units (INR)
}

export interface PricingConfig {
  version: number;
  currency: string;
  publication: Record<ProfileType, Fee>;
  boost: Record<ProfileType, Fee>;
  boostDays: number;
  requireApproval: boolean;
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
  terms: { pricingVersion: number; boostDays?: number; autoRenew: false };
  simulated: boolean;
  createdAt: string;
}

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn';

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
}
