import { DEFAULT_PRICING, withBoostPlans } from '@/domain/pricing';
import type {
  AppNotification,
  ContactRequest,
  Order,
  PhoneOffer,
  PricingConfig,
  Profile,
  PublicProfile,
  Report,
  User,
} from '@/domain/types';
import { AppError, type ErrorCode, type NotificationView } from '../backend';

/**
 * Database rows (snake_case) → the app's domain types (camelCase), and Postgres/Supabase errors →
 * AppError codes. Pure functions so they are unit-tested without a server.
 */
type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));
const n = (v: unknown) => (v == null ? undefined : Number(v));

export function mapUser(r: Row, hasPin?: boolean): User {
  return {
    id: String(r.id),
    countryCode: String(r.country_code),
    phone: String(r.phone),
    role: r.role as User['role'],
    language: (r.language as User['language']) ?? 'en',
    createdAt: String(r.created_at),
    deactivatedAt: s(r.deactivated_at),
    deactivatedBy: s(r.deactivated_by),
    deletedAt: s(r.deleted_at),
    deletedBy: s(r.deleted_by),
    deleteReason: s(r.delete_reason),
    profileRemovedAt: s(r.profile_removed_at),
    hasPin,
    pushPrefs: (r.push_prefs as User['pushPrefs']) ?? undefined,
    createdBy: s(r.created_by),
    claimedAt: s(r.claimed_at),
  };
}

export function mapProfile(r: Row): Profile {
  return {
    id: String(r.id),
    code: String(r.code ?? ''),
    userId: String(r.user_id),
    biodata: r.biodata as Profile['biodata'],
    status: r.status as Profile['status'],
    adminNote: s(r.admin_note),
    publishedAt: s(r.published_at),
    boostUntil: s(r.boost_until),
    createdByAdminId: s(r.created_by_admin),
    ownerReviewedAt: s(r.owner_reviewed_at),
    boostNotices: (r.boost_notices as Profile['boostNotices']) ?? undefined,
    boostStartedAt: s(r.boost_started_at),
    boostRemindedAt: s(r.boost_reminded_at),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    lastStep: Number(r.last_step ?? 0),
    deletedAt: s(r.deleted_at),
    deletedBy: s(r.deleted_by),
    deleteReason: s(r.delete_reason),
  };
}

export function mapOrder(r: Row): Order {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    profileId: String(r.profile_id),
    kind: r.kind as Order['kind'],
    amount: Number(r.amount),
    currency: String(r.currency),
    status: r.status as Order['status'],
    terms: { autoRenew: false, ...(r.terms as object) } as Order['terms'],
    simulated: Boolean(r.simulated),
    createdAt: String(r.created_at),
  };
}

export function mapRequest(r: Row): ContactRequest {
  return {
    id: String(r.id),
    fromUserId: String(r.from_user_id),
    fromProfileId: String(r.from_profile_id),
    toUserId: String(r.to_user_id),
    toProfileId: String(r.to_profile_id),
    message: s(r.message),
    status: r.status as ContactRequest['status'],
    createdAt: String(r.created_at),
    respondedAt: s(r.responded_at),
    expiresAt: String(r.expires_at),
    pokes: ((r.pokes as string[] | null) ?? []).map(String),
  };
}

export function mapOffer(r: Row): PhoneOffer {
  return {
    id: String(r.id),
    requestId: String(r.request_id),
    fromUserId: String(r.from_user_id),
    toUserId: String(r.to_user_id),
    status: r.status as PhoneOffer['status'],
    withInterest: Boolean(r.with_interest),
    consentText: String(r.consent_text ?? ''),
    consentAt: String(r.consent_at ?? r.created_at),
    createdAt: String(r.created_at),
    respondedAt: s(r.responded_at),
  };
}

export function mapNotification(r: Row): NotificationView {
  const base: AppNotification = {
    id: String(r.id),
    userId: String(r.user_id),
    type: r.type as AppNotification['type'],
    params: Object.fromEntries(Object.entries((r.params as Row) ?? {}).map(([k, v]) => [k, String(v)])),
    deepLink: s(r.deep_link),
    announcementId: s(r.announcement_id),
    readAt: s(r.read_at),
    createdAt: String(r.created_at),
  };
  const a = r.announcement as Row | undefined;
  return a ? { ...base, announcement: a as unknown as NotificationView['announcement'] } : base;
}

export function mapReport(r: Row): Report {
  return {
    id: String(r.id),
    reporterUserId: String(r.reporter_user_id),
    profileId: String(r.profile_id),
    reason: String(r.reason),
    details: s(r.details),
    status: r.status as Report['status'],
    createdAt: String(r.created_at),
    resolvedAt: s(r.resolved_at),
  };
}

/** The privacy projection the database built (already camelCase); fills the fields the UI expects. */
export function mapPublicProfile(j: Row): PublicProfile {
  const p = j as unknown as PublicProfile;
  return {
    ...p,
    photos: p.photos ?? [],
    photosHidden: Boolean(p.photosHidden),
    familyHidden: Boolean(p.familyHidden),
    boosted: Boolean(p.boosted),
    acceptsRequests: p.acceptsRequests !== false,
    religion: p.religion ?? {},
    preferences: p.preferences ?? (DEFAULT_PREFS as PublicProfile['preferences']),
    granted: p.granted ?? { photos: false, phone: false, fullBiodata: false },
    code: String(p.code ?? ''),
  };
}
const DEFAULT_PREFS = { maritalStatus: [], education: [], profession: [], countries: [], states: [], cities: [], motherTongues: [] };

export function mapPricing(r: Row): PricingConfig {
  const cfg = (r.config ?? {}) as Partial<PricingConfig>;
  return withBoostPlans({
    ...DEFAULT_PRICING,
    publication: cfg.publication ?? DEFAULT_PRICING.publication,
    boost: cfg.boost ?? DEFAULT_PRICING.boost,
    boostPlans: cfg.boostPlans ?? DEFAULT_PRICING.boostPlans,
    version: Number(r.version ?? 1),
    currency: String(r.currency ?? 'INR'),
    boostDays: Number(r.boost_days ?? DEFAULT_PRICING.boostDays),
    requireApproval: Boolean(r.require_approval),
    requestExpiryDays: n(r.request_expiry_days) ?? DEFAULT_PRICING.requestExpiryDays,
    pokeWaitHours: n(r.poke_wait_hours) ?? DEFAULT_PRICING.pokeWaitHours,
    pokeMaxPer7Days: n(r.poke_max_per_7_days) ?? DEFAULT_PRICING.pokeMaxPer7Days,
    updatedAt: String(r.updated_at ?? new Date(0).toISOString()),
    updatedBy: s(r.updated_by),
  });
}

const CODES: ErrorCode[] = [
  'unauthenticated', 'forbidden', 'not_found', 'validation', 'rate_limited', 'invalid_otp', 'otp_expired', 'blocked', 'duplicate',
  'phone_taken', 'fee_disabled', 'not_accepting', 'incomplete_biodata', 'profile_removed', 'boost_active', 'invalid_pin', 'pin_locked',
  'pin_not_set', 'device_not_trusted', 'otp_required', 'invalid_state', 'account_removed', 'account_suspended', 'invalid_recovery_code',
  'declined_recently', 'consent_required', 'poke_wait', 'poke_used', 'poke_limit', 'poke_optout', 'expired',
];

/**
 * Maps a Supabase/Postgres error to an AppError. Our SQL raises the app's error codes as the message
 * ("boost_active", "forbidden: …"); otherwise the SQLSTATE decides.
 */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = (e ?? {}) as { message?: string; code?: string; hint?: string; status?: number; details?: string };
  const msg = String(err.message ?? '');
  const head = msg.split(':')[0].trim();
  if ((CODES as string[]).includes(head)) {
    const details = head === 'boost_active' && err.hint ? { until: err.hint } : undefined;
    return new AppError(head as ErrorCode, msg, details);
  }
  switch (err.code) {
    case '28000':
      return new AppError('unauthenticated', msg);
    case '42501':
      return new AppError('forbidden', msg);
    case 'P0002':
      return new AppError('not_found', msg);
    case '23505':
      return new AppError('duplicate', msg);
    case '23514':
    case '22023':
    case '22P02':
    case '23502':
      return new AppError('validation', msg);
    case 'PGRST301':
    case 'PGRST303':
      return new AppError('unauthenticated', msg);
  }
  if (err.status === 429 || /rate limit|too many/i.test(msg)) return new AppError('rate_limited', msg);
  if (/jwt|not authenticated|auth session missing/i.test(msg)) return new AppError('unauthenticated', msg);
  return new AppError('invalid_state', msg || 'Something went wrong');
}
