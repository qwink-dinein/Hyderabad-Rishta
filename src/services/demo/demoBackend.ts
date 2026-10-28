import { buildSeed, DEMO_OTP, SEED_PRICING } from '@/data/seed';
import { normaliseCode, randomToken, recoveryCode, sha256Hex, slowHash } from '@/domain/crypto';
import { afterWrongPin, attemptsLeft, PIN_OTP_WINDOW_MS, pinProblem, SESSION_IDLE_MS, type PinAttemptState } from '@/domain/auth';
import { DECLINE_COOLDOWN_DAYS, isActiveRequest, PHONE_CONSENT_TEXT, pokeEligibility, sanitizeMessage } from '@/domain/connections';
import { maskPhone, uid } from '@/domain/format';
import { announcementStats, audienceFor, dashboardMetrics, isAnnouncementLive } from '@/domain/metrics';
import { resolvePricing, validatePricing } from '@/domain/pricing';
import { mergeScopes, NO_CONSENT, profileTypeOf, projectProfile } from '@/domain/privacy';
import { matchesFilters, sortProfiles, type SearchFilters } from '@/domain/search';
import { boostNoticeDue, BOOST_ENDING_NOTICE_MS, dayKey, isFeaturable, rotateFeatured } from '@/domain/featured';
import { isRateLimitExempt, prefsOf, PUSH_HOURLY_CAP, pushAllowed, pushContent, CATEGORY, VIEW_NOTICE_WINDOW_MS } from '@/domain/push';
import type {
  Announcement,
  AnnouncementDelivery,
  AppNotification,
  AuditEvent,
  Biodata,
  Block,
  ConsentRecord,
  ConsentScopes,
  ContactRequest,
  AdminMember,
  AnalyticsEvent,
  BoostImpression,
  Lang,
  PushDevice,
  PushOutboxItem,
  PushPrefs,
  MasterSecurity,
  NotificationType,
  Order,
  PhoneOffer,
  PricingChange,
  PricingConfig,
  Profile,
  ProfileStatus,
  Relation,
  Report,
  SecurityStatus,
  Shortlist,
  User,
  ViewEvent,
} from '@/domain/types';
import { isAdminRole } from '@/domain/types';
import { firstInvalidStep, otpSchema, requestMessageSchema } from '@/domain/validation';
import { REPORT_REASONS } from '@/domain/options';
import { biodataProblem, normalizePhone, isHttpsUrl, isInternalLink, LANGS, MAX_IDEM_KEY, MAX_PUSH_TOKEN, MAX_REPORTS_PER_DAY, MAX_SEARCH_PAGE } from '@/domain/security';
import { AppError, type AdminRequestRow, type AdminStats, type Backend, type MemberDetail, type MemberRow, type ConnectionMetrics, type SendInterestInput, type NotificationView, type Page, type RecipientRow, type RequestView, type TrashItem } from '../backend';
import { memoryKV, type KV } from '../storage';

/** JSON deep clone — responses never share references with the "server" state. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface OtpState {
  key: string;
  issuedAt: number;
  attempts: number;
  resends: number[];
}

/** Everything the demo "server" knows. Persisted as one JSON document. */
/** A signed-in phone. Only the token's hash is stored; the token itself lives in the phone's secure storage. */
export interface AuthSession {
  id: string;
  tokenHash: string;
  userId: string;
  deviceId?: string;
  createdAt: string;
  lastSeenAt: string;
  /** Set when this session was created by an OTP just now: allows setting/resetting the PIN once. */
  otpAt?: string;
  revokedAt?: string;
  revokeReason?: string;
}
/** A phone that proved the number by OTP. PIN login works only on these (device key + PIN). */
export interface TrustedDevice {
  id: string;
  userId: string;
  secretHash: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt?: string;
}
export interface PinRecord {
  userId: string;
  salt: string;
  hash: string;
  setAt: string;
  attempts: PinAttemptState;
}
/** What THIS phone keeps in secure storage (never in the shared demo "server" document). */
interface LocalAuth {
  token?: string;
  device?: { id: string; secret: string };
  /** Last number used here, to prefill the PIN login screen. */
  last?: { countryCode: string; phone: string };
}

export interface DemoDb {
  schemaVersion: number;
  /** @deprecated pre-PIN single session; migrated into `sessions` on load. */
  sessionUserId?: string;
  sessions: AuthSession[];
  devices: TrustedDevice[];
  pins: PinRecord[];
  users: User[];
  profiles: Profile[];
  shortlists: Shortlist[];
  requests: ContactRequest[];
  consents: ConsentRecord[];
  notifications: AppNotification[];
  announcements: Announcement[];
  deliveries: AnnouncementDelivery[];
  views: ViewEvent[];
  reports: Report[];
  blocks: Block[];
  orders: Order[];
  pricing: PricingConfig;
  pricingHistory: PricingChange[];
  audit: AuditEvent[];
  otps: OtpState[];
  security: MasterSecurity;
  phoneOffers: PhoneOffer[];
  analytics: AnalyticsEvent[];
  /** Idempotency keys for create operations (24 h). */
  idem: { key: string; userId: string; resultId: string; at: string }[];
  /** Next sequential profile number (HR-xxxxx); never reused, even after deletion. */
  nextCode: number;
  /** Phones registered for push (one row per token; a token belongs to exactly one account). */
  pushDevices: PushDevice[];
  /** Every push the system decided to send or skip, with the reason (no provider in demo mode). */
  pushOutbox: PushOutboxItem[];
  /** Featured impressions, one per viewer per profile per day. */
  boostImpressions: BoostImpression[];
  /** `${shortlisterId}:${profileId}` pairs already notified (re-toggling never re-notifies). */
  shortlistNotified: string[];
}

const SCHEMA_VERSION = 8;
const STORAGE_KEY = 'hr.demo.db';
const AUTH_KEY = 'hr.auth';
const MAX_SESSIONS_PER_USER = 10;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const MAX_RESENDS = 3;
export const MAX_OTP_ATTEMPTS = 5;
const MAX_REQUESTS_PER_DAY = 20;
const VIEW_DEDUPE_MS = 30 * 60 * 1000;
export const RECOVERY_DELAY_MS = 72 * 3600 * 1000; // new-phone recovery waits 72 h so the real master can cancel
export const TRASH_RETENTION_MS = 30 * 86400 * 1000;
export const RECOVERY_CODE_COUNT = 10;
export const MAX_SUB_ADMINS = 10;
const MAX_RECOVERY_FAILURES_PER_HOUR = 5;
export const MAX_NOTIFICATIONS_PER_USER = 200;
export const MAX_ANALYTICS = 2000;
const IMPRESSION_RETENTION_MS = 180 * 86400000;

export function freshDb(now = new Date()): DemoDb {
  const seed = buildSeed(now);
  return {
    schemaVersion: SCHEMA_VERSION,
    users: seed.users,
    profiles: seed.profiles,
    shortlists: [],
    requests: seed.requests,
    consents: seed.consents,
    notifications: [
      { id: 'n_seed1', userId: 'u_demo', type: 'request_received', params: { name: 'A.' }, deepLink: '/requests', createdAt: seed.requests[0].createdAt },
    ],
    announcements: seed.announcements,
    deliveries: [],
    views: seed.views,
    reports: [],
    blocks: [],
    orders: [],
    pricing: { ...SEED_PRICING, updatedAt: now.toISOString() },
    pricingHistory: [],
    audit: [],
    otps: [],
    security: { recoveryCodes: [], salt: recoveryCode(), failedAttempts: [] },
    phoneOffers: seed.phoneOffers,
    analytics: [],
    idem: [],
    nextCode: 10001 + seed.profiles.length,
    pushDevices: [],
    pushOutbox: [],
    boostImpressions: [],
    shortlistNotified: [],
    sessions: [],
    devices: [],
    pins: [],
  };
}

export interface DemoOptions {
  storage: KV;
  /** This phone's secure storage (Keychain/Keystore). Defaults to memory (tests: one fresh phone). */
  secure?: KV;
  /** Artificial latency so loading states are exercised (0 in tests). */
  latencyMs?: number;
  now?: () => Date;
}

/**
 * Offline backend that behaves like the production server: it enforces auth, ownership,
 * admin role checks, field-level privacy, consent and rate limits. It is labelled "Demo" in
 * the UI, OTP is fixed (123456) and payments are simulations — never real charges.
 */
export class DemoBackend implements Backend {
  readonly kind = 'demo' as const;
  private db: DemoDb | null = null;
  private loading: Promise<DemoDb> | null = null;
  private storage: KV;
  private secure: KV;
  private local: LocalAuth = {};
  private latency: number;
  private now: () => Date;

  constructor(opts: DemoOptions) {
    this.storage = opts.storage;
    this.secure = opts.secure ?? memoryKV();
    this.latency = opts.latencyMs ?? 0;
    this.now = opts.now ?? (() => new Date());
  }

  // ---------- infrastructure ----------
  private async load(): Promise<DemoDb> {
    if (this.db) return this.db;
    if (!this.loading) {
      this.loading = (async () => {
        const raw = await this.storage.getItem(STORAGE_KEY);
        let db: DemoDb | null = null;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as DemoDb;
            if (parsed.schemaVersion === SCHEMA_VERSION) db = parsed;
          } catch {
            db = null; // corrupted storage → reseed
          }
        }
        try {
          this.local = JSON.parse((await this.secure.getItem(AUTH_KEY)) ?? '{}') as LocalAuth;
        } catch {
          this.local = {};
        }
        this.db = db ?? freshDb(this.now());
        // Existing accounts survive upgrades: add new collections in place (never a reseed), and turn a
        // pre-PIN login into a real session so nobody is signed out by this update.
        const d = this.db;
        const upgraded = !d.sessions || !!d.sessionUserId;
        d.sessions ??= [];
        d.devices ??= [];
        d.pins ??= [];
        if (d.sessionUserId) {
          if (!this.currentSession(d) && d.users.some((u) => u.id === d.sessionUserId)) this.startSession(d, d.sessionUserId, {});
          d.sessionUserId = undefined;
        }
        if (!db || upgraded) await this.persist();
        return this.db;
      })();
    }
    return this.loading;
  }

  private async persist() {
    if (this.db) await this.storage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    await this.secure.setItem(AUTH_KEY, JSON.stringify(this.local));
  }

  /** Runs a read or write "request" against the db with simulated latency. */
  private async run<T>(fn: (db: DemoDb) => T | Promise<T>, write = false): Promise<T> {
    const db = await this.load();
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency));
    this.processScheduled(db);
    try {
      return await fn(db);
    } finally {
      // Also on errors: a wrong OTP/PIN must be counted on "disk", not only in memory.
      if (write) {
        this.prune(db);
        await this.persist();
      }
    }
  }

  async reset(): Promise<void> {
    this.db = freshDb(this.now());
    this.loading = Promise.resolve(this.db);
    await this.persist();
  }

  private iso() {
    return this.now().toISOString();
  }

  /** This phone's live session, if any. Expired sessions are revoked on sight. */
  private currentSession(db: DemoDb): AuthSession | undefined {
    const token = this.local.token;
    if (!token) return undefined;
    const hash = sha256Hex(token);
    const s = db.sessions.find((x) => x.tokenHash === hash);
    if (!s || s.revokedAt) return undefined;
    const now = this.now().getTime();
    if (now - new Date(s.lastSeenAt).getTime() > SESSION_IDLE_MS) {
      s.revokedAt = this.iso();
      s.revokeReason = 'expired';
      return undefined;
    }
    if (now - new Date(s.lastSeenAt).getTime() > 3600_000) s.lastSeenAt = this.iso();
    return s;
  }

  /** Signs this phone in: a new random token (only its hash is kept server-side). */
  private startSession(db: DemoDb, userId: string, opts: { otp?: boolean; deviceId?: string }) {
    const prev = this.currentSession(db);
    if (prev) this.revoke(prev, 'replaced');
    const token = randomToken();
    db.sessions.push({ id: uid('s_'), tokenHash: sha256Hex(token), userId, deviceId: opts.deviceId, createdAt: this.iso(), lastSeenAt: this.iso(), otpAt: opts.otp ? this.iso() : undefined });
    const live = db.sessions.filter((x) => x.userId === userId && !x.revokedAt).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
    for (const old of live.slice(MAX_SESSIONS_PER_USER)) this.revoke(old, 'too_many');
    this.local.token = token;
  }

  private revoke(s: AuthSession, reason: string) {
    if (s.revokedAt) return;
    s.revokedAt = this.iso();
    s.revokeReason = reason;
  }

  /** Signs an account out everywhere (optionally except one session). */
  private revokeSessions(db: DemoDb, userId: string, reason: string, except?: AuthSession) {
    for (const s of db.sessions) if (s.userId === userId && s !== except) this.revoke(s, reason);
  }

  /** Marks this phone as verified for the account (OTP just proved the number here). */
  private trustThisDevice(db: DemoDb, userId: string): string {
    this.local.device ??= { id: uid('d_'), secret: randomToken() };
    const { id, secret } = this.local.device;
    const existing = db.devices.find((d) => d.id === id && d.userId === userId);
    if (existing) {
      existing.secretHash = sha256Hex(secret);
      existing.revokedAt = undefined;
      existing.lastUsedAt = this.iso();
    } else db.devices.push({ id, userId, secretHash: sha256Hex(secret), createdAt: this.iso(), lastUsedAt: this.iso() });
    return id;
  }

  private trustedDevice(db: DemoDb, userId: string) {
    const d = this.local.device;
    if (!d) return undefined;
    const row = db.devices.find((x) => x.id === d.id && x.userId === userId && !x.revokedAt);
    return row && row.secretHash === sha256Hex(d.secret) ? row : undefined;
  }

  private pinOf(db: DemoDb, userId: string) {
    return db.pins.find((p) => p.userId === userId);
  }

  /** The user as the app sees it (no secrets), plus whether a PIN is set up. */
  private publicUser(db: DemoDb, u: User): User {
    return { ...u, hasPin: !!this.pinOf(db, u.id) };
  }

  /** Checks a PIN with the server-side lockout. Returns an error to throw AFTER the counters are saved. */
  private checkPin(db: DemoDb, rec: PinRecord, pin: string): AppError | null {
    const now = this.now().getTime();
    if (rec.attempts.hardLocked) return new AppError('pin_locked', undefined, { reset: true });
    if (rec.attempts.lockedUntil && now < rec.attempts.lockedUntil) return new AppError('pin_locked', undefined, { retryAt: new Date(rec.attempts.lockedUntil).toISOString() });
    if (slowHash(pin, rec.salt) === rec.hash) {
      rec.attempts = { streak: 0, recent: [] };
      return null;
    }
    rec.attempts = afterWrongPin(rec.attempts, now);
    this.audit(db, rec.userId, 'pin.failed', rec.userId, { streak: rec.attempts.streak });
    if (rec.attempts.hardLocked) return new AppError('pin_locked', undefined, { reset: true });
    if (rec.attempts.lockedUntil && now < rec.attempts.lockedUntil) return new AppError('pin_locked', undefined, { retryAt: new Date(rec.attempts.lockedUntil).toISOString() });
    return new AppError('invalid_pin', undefined, { attemptsLeft: attemptsLeft(rec.attempts) });
  }

  private me(db: DemoDb): User {
    const u = db.users.find((x) => x.id === this.currentSession(db)?.userId);
    // Deleted/suspended accounts lose their session on the very next call.
    if (!u || u.deletedAt) throw new AppError('unauthenticated');
    if (u.deactivatedAt) throw new AppError('forbidden', 'Account deactivated');
    return u;
  }

  /** Master or sub-admin. Re-checked on EVERY call, so demotions take effect immediately. */
  private admin(db: DemoDb): User {
    const u = this.me(db);
    if (!isAdminRole(u.role)) throw new AppError('forbidden');
    return u;
  }

  private master(db: DemoDb): User {
    const u = this.me(db);
    if (u.role !== 'master') throw new AppError('forbidden');
    return u;
  }

  /** Who may act on whom: nobody acts on the master; only the master acts on sub-admins. */
  private assertCanManage(actor: User, target: User) {
    if (target.role === 'master') throw new AppError('forbidden', 'The master account can only be changed by recovery or transfer');
    if (target.role === 'admin' && actor.role !== 'master') throw new AppError('forbidden', 'Only the master can manage sub-admins');
  }

  private notifyAdmins(db: DemoDb, params: Record<string, string>) {
    this.alertAdmins(db, 'security', params, '/admin/team');
  }

  /** Admin bell: reports, payments, approvals, deletions, security. Never contains phone numbers. */
  private alertAdmins(db: DemoDb, kind: 'report' | 'payment' | 'pending_profile' | 'account_deleted' | 'security', params: Record<string, string>, deepLink: string) {
    for (const u of db.users) if (isAdminRole(u.role) && !u.deletedAt && !u.deactivatedAt) this.notify(db, u.id, 'admin_alert', { kind, ...params }, deepLink);
  }

  private codeOf(db: DemoDb, profileId?: string) {
    return db.profiles.find((p) => p.id === profileId)?.code ?? '—';
  }

  /** Latest interest between the viewer and a profile, either direction (for card badges). */
  private relationWith(db: DemoDb, viewerId: string, target: Profile): Relation | undefined {
    const mine = this.myProfile(db, viewerId);
    if (!mine) return undefined;
    const r = db.requests
      .filter((x) => (x.fromProfileId === mine.id && x.toProfileId === target.id) || (x.toProfileId === mine.id && x.fromProfileId === target.id))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!r) return undefined;
    return { status: r.status, direction: r.fromUserId === viewerId ? 'sent' : 'received', at: r.respondedAt ?? r.createdAt };
  }

  /** Step-up verification: a fresh OTP for the actor's own phone (re-proves possession). */
  private consumeOtp(db: DemoDb, countryCode: string, phone: string, code: string) {
    if (!otpSchema.safeParse(code).success) throw new AppError('invalid_otp');
    const key = `${countryCode}${phone}`;
    const st = db.otps.find((o) => o.key === key);
    if (!st || this.now().getTime() - st.issuedAt > OTP_TTL_MS) throw new AppError('otp_expired');
    if (st.attempts >= MAX_OTP_ATTEMPTS) throw new AppError('rate_limited');
    if (code !== DEMO_OTP) {
      st.attempts++;
      throw new AppError('invalid_otp', undefined, { attemptsLeft: MAX_OTP_ATTEMPTS - st.attempts });
    }
    db.otps = db.otps.filter((o) => o.key !== key);
  }

  /** Same number however it was typed; compared as full E.164 so "+1 2025…" and "+12 025…" can't both exist. */
  private findUserByPhone(db: DemoDb, countryCode: string, phone: string) {
    const e164 = `${countryCode}${phone}`;
    return db.users.find((u) => `${u.countryCode}${u.phone}` === e164);
  }

  private normPhone(countryCode: string, phone: string) {
    const n = normalizePhone(countryCode, phone);
    if (!n) throw new AppError('validation', 'v.phone');
    return n;
  }

  private audit(db: DemoDb, actorId: string, action: string, target?: string, meta?: Record<string, unknown>) {
    db.audit.unshift({ id: uid('au_'), actorId, action, target, meta, at: this.iso() });
  }

  private notify(db: DemoDb, userId: string, type: NotificationType, params: Record<string, string> = {}, deepLink?: string, announcementId?: string) {
    const n: AppNotification = { id: uid('n_'), userId, type, params, deepLink, announcementId, createdAt: this.iso() };
    db.notifications.unshift(n);
    this.enqueuePush(db, n);
  }

  /**
   * Single funnel from in-app notifications to phones. The in-app inbox is always written first;
   * push is best-effort on top and every decision (sent or skipped, and why) is recorded.
   */
  private enqueuePush(db: DemoDb, n: AppNotification) {
    const user = db.users.find((u) => u.id === n.userId);
    const devices = db.pushDevices.filter((d) => d.userId === n.userId);
    if (!user || devices.length === 0) return; // nothing to deliver to — the inbox still has it
    const base = { notificationId: n.id, userId: n.userId, category: CATEGORY[n.type], attempts: 0, createdAt: this.iso(), data: { notificationId: n.id, deepLink: n.deepLink } };
    const skip = (reason: string) => db.pushOutbox.unshift({ ...base, id: uid('px_'), title: '', body: '', status: 'skipped', reason });
    if (user.deletedAt || user.deactivatedAt) return skip('account_inactive');
    const prefs = prefsOf(user.pushPrefs);
    const allowed = pushAllowed(n.type, prefs);
    if (!allowed.ok) return skip(allowed.reason);
    if (!isRateLimitExempt(n.type)) {
      const hourAgo = this.now().getTime() - 3600_000;
      const recent = new Set(
        db.pushOutbox
          .filter((x) => x.userId === n.userId && x.category !== 'account' && (x.status !== 'skipped' || x.reason === 'not_configured') && new Date(x.createdAt).getTime() > hourAgo)
          .map((x) => x.notificationId),
      );
      if (recent.size >= PUSH_HOURLY_CAP) return skip('rate_limited');
    }
    const { title, body } = pushContent(n, user.language, prefs.showNames);
    for (const d of devices) {
      // No push provider in demo mode: record exactly what WOULD be sent, honestly marked.
      db.pushOutbox.unshift({ ...base, id: uid('px_'), token: d.token, title, body, status: 'skipped', reason: 'not_configured' });
    }
    if (db.pushOutbox.length > 2000) db.pushOutbox.length = 2000;
  }

  private myProfile(db: DemoDb, userId: string) {
    return db.profiles.find((p) => p.userId === userId && !p.deletedAt);
  }

  private visibleProfile(db: DemoDb, viewer: User, profileId: string): Profile {
    const p = db.profiles.find((x) => x.id === profileId);
    if (!p || p.deletedAt) throw new AppError('not_found');
    const owner = db.users.find((u) => u.id === p.userId);
    if (p.userId === viewer.id) return p;
    if (isAdminRole(viewer.role)) return p;
    if (p.status !== 'published' || !owner || owner.deactivatedAt || owner.deletedAt) throw new AppError('not_found');
    if (this.isBlockedBetween(db, viewer.id, p)) throw new AppError('not_found');
    return p;
  }

  /** Blocking is two-way: neither side can see the other. */
  private isBlockedBetween(db: DemoDb, viewerId: string, target: Profile) {
    const viewerProfile = this.myProfile(db, viewerId);
    return db.blocks.some(
      (b) => (b.userId === viewerId && b.blockedProfileId === target.id) || (viewerProfile && b.userId === target.userId && b.blockedProfileId === viewerProfile.id),
    );
  }

  /** Consent `grantor` has given `grantee`, only valid while the request is accepted. */
  private scopesFor(db: DemoDb, grantorUserId: string, granteeUserId: string): ConsentScopes {
    if (grantorUserId === granteeUserId) return { photos: true, phone: true, fullBiodata: true };
    const records = db.consents.filter((c) => {
      if (c.grantorUserId !== grantorUserId || c.granteeUserId !== granteeUserId) return false;
      const req = db.requests.find((r) => r.id === c.requestId);
      return req?.status === 'accepted';
    });
    const merged = records.length ? mergeScopes(records.map((c) => c.scopes)) : { ...NO_CONSENT };
    // The phone number is revealed ONLY through an offer the owner made and the viewer accepted,
    // on a request that is still accepted (not blocked) — never via the generic consent toggles.
    merged.phone = db.phoneOffers.some((o) => {
      if (o.fromUserId !== grantorUserId || o.toUserId !== granteeUserId || o.status !== 'accepted') return false;
      return db.requests.find((r) => r.id === o.requestId)?.status === 'accepted';
    });
    return merged;
  }

  /** Analytics: no phone numbers or free text, de-duplicated by key (retries don't double count). */
  private track(db: DemoDb, name: string, userId?: string, props: AnalyticsEvent['props'] = {}, dedupeKey?: string) {
    const id = dedupeKey ? `ev:${dedupeKey}:${name}` : uid('ev_');
    if (dedupeKey && db.analytics.some((e) => e.id === id)) return;
    db.analytics.push({ id, name, at: this.iso(), userId, props });
  }

  private idemLookup(db: DemoDb, userId: string, key: string) {
    const dayAgo = this.now().getTime() - 86400000;
    db.idem = db.idem.filter((i) => new Date(i.at).getTime() > dayAgo);
    return db.idem.find((i) => i.userId === userId && i.key === key)?.resultId;
  }

  private displayNameOf(db: DemoDb, userId: string) {
    const p = this.myProfile(db, userId);
    return p ? projectProfile(p).displayName : '';
  }

  private project(db: DemoDb, viewer: User, p: Profile) {
    const owner = db.users.find((u) => u.id === p.userId);
    return projectProfile(p, this.scopesFor(db, p.userId, viewer.id), owner, this.now());
  }

  /**
   * Keeps the stored document small on a phone: only data nobody reads back, or that has a stated
   * lifetime, is dropped. Lifetime totals members/admins see (views, audit, orders) are never pruned.
   */
  private prune(db: DemoDb) {
    const now = this.now().getTime();
    const perUser = new Map<string, number>();
    if (db.notifications.length > MAX_NOTIFICATIONS_PER_USER) {
      db.notifications = db.notifications.filter((n) => {
        const c = (perUser.get(n.userId) ?? 0) + 1;
        perUser.set(n.userId, c);
        return c <= MAX_NOTIFICATIONS_PER_USER; // list is newest-first
      });
    }
    db.idem = db.idem.filter((x) => now - new Date(x.at).getTime() < 86400000);
    db.sessions = db.sessions.filter((x) => !x.revokedAt || now - new Date(x.revokedAt).getTime() < 30 * 86400000);
    db.otps = db.otps.filter((o) => now - o.issuedAt < OTP_TTL_MS || o.resends.some((t) => now - t < OTP_TTL_MS));
    if (db.analytics.length > MAX_ANALYTICS) db.analytics = db.analytics.slice(-MAX_ANALYTICS);
    const oldestDay = dayKey(new Date(now - IMPRESSION_RETENTION_MS));
    if (db.boostImpressions.length && db.boostImpressions[0].day < oldestDay) db.boostImpressions = db.boostImpressions.filter((i) => i.day >= oldestDay);
  }

  private processScheduled(db: DemoDb) {
    const now = this.now().getTime();
    for (const a of db.announcements) {
      if (a.status === 'scheduled' && a.scheduledAt && new Date(a.scheduledAt).getTime() <= now) this.fanOut(db, a);
    }
    // Interest requests expire; an expired request can no longer be accepted and its offers lapse.
    for (const r of db.requests) {
      if (r.status === 'pending' && new Date(r.expiresAt).getTime() <= now) {
        r.status = 'expired';
        for (const o of db.phoneOffers) if (o.requestId === r.id && o.status === 'offered') o.status = 'expired';
        this.notify(db, r.fromUserId, 'request_expired', {}, '/requests');
        this.track(db, 'request_expired', r.fromUserId, {}, `expired:${r.id}`);
      }
    }
    // Boost lifecycle notices (each exactly once per boost end-time).
    for (const p of db.profiles) {
      if (p.deletedAt) continue;
      const due = boostNoticeDue(p, this.now());
      if (!due) continue;
      p.boostNotices = { ...(p.boostNotices ?? {}), [due]: p.boostUntil };
      this.notify(db, p.userId, due === 'ending' ? 'boost_ending' : 'boost_ended', { until: p.boostUntil ?? '' }, '/dashboard');
    }
    // Time-locked master recovery completes only if the current master did not cancel it.
    const pr = db.security.pendingRecovery;
    if (pr && new Date(pr.completesAt).getTime() <= now) this.completeRecovery(db, pr.countryCode, pr.phone, 'new_phone_after_delay');
    // Trash auto-purge after the retention window.
    for (const p of [...db.profiles]) if (p.deletedAt && now - new Date(p.deletedAt).getTime() > TRASH_RETENTION_MS) this.purgeProfile(db, p.id);
    for (const u of [...db.users]) if (u.deletedAt && now - new Date(u.deletedAt).getTime() > TRASH_RETENTION_MS) this.purgeUser(db, u.id);
  }

  /** Moves the master role to the account that owns (countryCode, phone), creating it if needed. */
  private completeRecovery(db: DemoDb, countryCode: string, phone: string, method: string) {
    const old = db.users.find((u) => u.role === 'master');
    let target = this.findUserByPhone(db, countryCode, phone);
    if (!target) {
      target = { id: uid('u_'), countryCode, phone, role: 'user', language: 'en', createdAt: this.iso() };
      db.users.push(target);
    }
    if (old && old.id !== target.id) old.role = 'user'; // old device is assumed compromised/lost
    target.role = 'master';
    target.deactivatedAt = undefined;
    target.deletedAt = undefined;
    // All recovery material is single-use per recovery: force a fresh setup.
    db.security = { recoveryCodes: [], salt: recoveryCode(), failedAttempts: [] };
    if (old && old.id !== target.id) this.revokeSessions(db, old.id, 'master_recovered'); // old phone assumed lost
    this.audit(db, target.id, 'master.recovered', target.id, { method, previousMaster: old?.id });
    this.notifyAdmins(db, { event: 'master_recovered' });
  }

  private purgeProfile(db: DemoDb, profileId: string) {
    db.profiles = db.profiles.filter((x) => x.id !== profileId);
    db.shortlists = db.shortlists.filter((x) => x.profileId !== profileId);
    db.views = db.views.filter((v) => v.profileId !== profileId);
    db.boostImpressions = db.boostImpressions.filter((i) => i.profileId !== profileId);
    db.blocks = db.blocks.filter((b) => b.blockedProfileId !== profileId);
    const reqIds = new Set(db.requests.filter((r) => r.fromProfileId === profileId || r.toProfileId === profileId).map((r) => r.id));
    db.requests = db.requests.filter((r) => !reqIds.has(r.id));
    db.consents = db.consents.filter((c) => !reqIds.has(c.requestId));
    db.phoneOffers = db.phoneOffers.filter((o) => !reqIds.has(o.requestId));
    db.reports = db.reports.filter((r) => r.profileId !== profileId);
  }

  /** Permanent erasure of a user and everything that identifies them (orders + audit are kept for legal records). */
  private purgeUser(db: DemoDb, userId: string) {
    for (const p of db.profiles.filter((x) => x.userId === userId)) this.purgeProfile(db, p.id);
    db.users = db.users.filter((x) => x.id !== userId);
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    db.devices = db.devices.filter((d) => d.userId !== userId);
    db.pins = db.pins.filter((p) => p.userId !== userId);
    db.shortlists = db.shortlists.filter((s) => s.userId !== userId);
    db.requests = db.requests.filter((r) => r.fromUserId !== userId && r.toUserId !== userId);
    db.consents = db.consents.filter((c) => c.grantorUserId !== userId && c.granteeUserId !== userId);
    db.notifications = db.notifications.filter((n) => n.userId !== userId);
    db.deliveries = db.deliveries.filter((d) => d.userId !== userId);
    db.blocks = db.blocks.filter((b) => b.userId !== userId);
    db.views = db.views.filter((v) => v.viewerUserId !== userId);
    db.reports = db.reports.filter((r) => r.reporterUserId !== userId);
    db.pushDevices = db.pushDevices.filter((d) => d.userId !== userId);
    db.pushOutbox = db.pushOutbox.filter((x) => x.userId !== userId);
    db.boostImpressions = db.boostImpressions.filter((i) => i.viewerUserId !== userId);
  }

  private fanOut(db: DemoDb, a: Announcement) {
    a.status = 'published';
    a.publishedAt = this.iso();
    a.updatedAt = this.iso();
    const audience = audienceFor(a.segment, db.users, db.profiles);
    for (const u of audience) {
      if (db.deliveries.some((d) => d.announcementId === a.id && d.userId === u.id)) continue;
      // No push provider in demo mode — report honestly rather than pretending delivery.
      db.deliveries.push({ announcementId: a.id, userId: u.id, inAppAt: this.iso(), pushStatus: a.pushEnabled ? 'not_configured' : 'not_requested' });
      this.notify(db, u.id, 'announcement', {}, a.deepLink, a.id);
    }
  }

  // ---------- auth ----------
  requestOtp(countryCode: string, phone: string) {
    return this.run((db) => {
      ({ countryCode, phone } = this.normPhone(countryCode, phone));
      const key = `${countryCode}${phone}`;
      const now = this.now().getTime();
      let st = db.otps.find((o) => o.key === key);
      if (st) {
        const recent = st.resends.filter((t) => now - t < OTP_TTL_MS);
        const last = recent[recent.length - 1] ?? 0;
        if (now - last < RESEND_COOLDOWN_MS) throw new AppError('rate_limited', undefined, { retryAt: new Date(last + RESEND_COOLDOWN_MS).toISOString() });
        if (recent.length > MAX_RESENDS) throw new AppError('rate_limited', undefined, { retryAt: new Date(recent[0] + OTP_TTL_MS).toISOString() });
        st.resends = [...recent, now];
        st.issuedAt = now;
        st.attempts = 0;
      } else {
        st = { key, issuedAt: now, attempts: 0, resends: [now] };
        db.otps.push(st);
      }
      return { demo: true, resendAvailableAt: new Date(now + RESEND_COOLDOWN_MS).toISOString(), resendsLeft: Math.max(0, MAX_RESENDS + 1 - st.resends.length) };
    }, true);
  }

  verifyOtp(countryCode: string, phone: string, code: string) {
    return this.run((db) => {
      ({ countryCode, phone } = this.normPhone(countryCode, phone));
      if (!otpSchema.safeParse(code).success) throw new AppError('invalid_otp');
      const key = `${countryCode}${phone}`;
      const st = db.otps.find((o) => o.key === key);
      if (!st) throw new AppError('otp_expired');
      if (this.now().getTime() - st.issuedAt > OTP_TTL_MS) throw new AppError('otp_expired');
      if (st.attempts >= MAX_OTP_ATTEMPTS) throw new AppError('rate_limited');
      if (code !== DEMO_OTP) {
        st.attempts++;
        throw new AppError('invalid_otp', undefined, { attemptsLeft: MAX_OTP_ATTEMPTS - st.attempts });
      }
      db.otps = db.otps.filter((o) => o.key !== key);
      let user = this.findUserByPhone(db, countryCode, phone);
      let isNew = false;
      if (!user) {
        user = { id: uid('u_'), countryCode, phone, role: 'user', language: 'en', createdAt: this.iso() };
        db.users.push(user);
        isNew = true;
      }
      if (user.deletedAt) throw new AppError('account_removed');
      if (user.deactivatedAt) {
        // Self-deactivation is undone by logging in; an admin suspension is not.
        if (user.deactivatedBy && user.deactivatedBy !== user.id) throw new AppError('account_suspended');
        user.deactivatedAt = undefined;
        user.deactivatedBy = undefined;
      }
      // OTP proved the number on THIS phone: trust it for PIN login and start a session.
      const deviceId = this.trustThisDevice(db, user.id);
      this.startSession(db, user.id, { otp: true, deviceId });
      this.local.last = { countryCode, phone };
      isNew = isNew || !this.myProfile(db, user.id);
      return { user: this.publicUser(db, user), isNew, needsPin: !this.pinOf(db, user.id) };
    }, true);
  }

  getSession() {
    return this.run((db) => {
      const s = this.currentSession(db);
      const u = s && db.users.find((x) => x.id === s.userId);
      return u && !u.deactivatedAt && !u.deletedAt ? this.publicUser(db, u) : null;
    }, true);
  }

  /** What the login screen can offer on this phone without sending an OTP. */
  getLoginHint() {
    return this.run((db) => {
      const last = this.local.last;
      if (!last) return null;
      const u = this.findUserByPhone(db, last.countryCode, last.phone);
      const canUsePin = !!u && !u.deletedAt && !!this.pinOf(db, u.id) && !!this.trustedDevice(db, u.id);
      return { countryCode: last.countryCode, phone: last.phone, canUsePin };
    });
  }

  /** Returning login: number + PIN on a phone that verified this number before. No OTP is sent. */
  pinLogin(countryCode: string, phone: string, pin: string) {
    return this.run((db) => {
      ({ countryCode, phone } = this.normPhone(countryCode, phone));
      if (!/^\d{4}$/.test(String(pin))) throw new AppError('validation', 'pin.mustBe4');
      const u = this.findUserByPhone(db, countryCode, phone);
      const device = u && this.trustedDevice(db, u.id);
      // Unknown number, other phone, or forgotten device all look the same: verify by OTP once.
      if (!u || !device) throw new AppError('device_not_trusted');
      if (u.deletedAt) throw new AppError('account_removed');
      if (u.deactivatedAt && u.deactivatedBy && u.deactivatedBy !== u.id) throw new AppError('account_suspended');
      const rec = this.pinOf(db, u.id);
      if (!rec) throw new AppError('pin_not_set');
      const err = this.checkPin(db, rec, pin);
      if (err) throw err; // counters are persisted by run() even when this throws
      if (u.deactivatedAt) {
        u.deactivatedAt = undefined; // self-deactivation is undone by logging in
        u.deactivatedBy = undefined;
      }
      device.lastUsedAt = this.iso();
      this.startSession(db, u.id, { deviceId: device.id });
      this.local.last = { countryCode, phone };
      this.audit(db, u.id, 'pin.login', u.id);
      return { user: this.publicUser(db, u) };
    }, true);
  }

  /**
   * Create, reset or change the PIN. Allowed right after an OTP on this phone (registration, Forgot PIN,
   * first PIN for an older account) or with the current PIN. Resetting/changing signs out every other phone.
   */
  setPin(pin: string, currentPin?: string) {
    return this.run((db) => {
      const u = this.me(db);
      const s = this.currentSession(db)!;
      const problem = pinProblem(String(pin));
      if (problem) throw new AppError('validation', problem);
      const rec = this.pinOf(db, u.id);
      const freshOtp = !!s.otpAt && this.now().getTime() - new Date(s.otpAt).getTime() < PIN_OTP_WINDOW_MS;
      if (!freshOtp) {
        if (!rec || currentPin == null) throw new AppError('otp_required');
        const err = this.checkPin(db, rec, String(currentPin));
        if (err) throw err;
      }
      const salt = randomToken(16);
      const next: PinRecord = { userId: u.id, salt, hash: slowHash(String(pin), salt), setAt: this.iso(), attempts: { streak: 0, recent: [] } };
      db.pins = [...db.pins.filter((p) => p.userId !== u.id), next];
      s.otpAt = undefined; // one PIN change per OTP
      if (rec) this.revokeSessions(db, u.id, 'pin_reset', s);
      this.audit(db, u.id, rec ? (freshOtp ? 'pin.reset' : 'pin.changed') : 'pin.created', u.id);
      return this.publicUser(db, u);
    }, true);
  }

  logout() {
    return this.run((db) => {
      const s = this.currentSession(db);
      if (s) this.revoke(s, 'logout');
      this.local.token = undefined; // the device key and remembered number stay, for PIN login
    }, true);
  }

  setLanguage(lang: Lang) {
    return this.run((db) => {
      if (!LANGS.includes(lang)) throw new AppError('validation');
      const u = db.users.find((x) => x.id === this.currentSession(db)?.userId);
      if (u) u.language = lang;
    }, true);
  }

  deactivateAccount() {
    return this.run((db) => {
      const u = this.me(db);
      if (u.role === 'master') throw new AppError('forbidden', 'Transfer the master role before deactivating');
      u.deactivatedAt = this.iso();
      u.deactivatedBy = u.id;
      const p = this.myProfile(db, u.id);
      if (p && p.status === 'published') p.status = 'paused';
      this.revokeSessions(db, u.id, 'deactivated');
      this.local.token = undefined;
    }, true);
  }

  deleteAccount() {
    return this.run((db) => {
      const u = this.me(db);
      if (u.role === 'master') throw new AppError('forbidden', 'Transfer the master role before deleting this account');
      const code = this.myProfile(db, u.id)?.code;
      this.purgeUser(db, u.id); // user-initiated deletion is immediate and permanent (privacy right)
      this.alertAdmins(db, 'account_deleted', { code: code ?? '—' }, '/admin/audit');
      this.audit(db, u.id, 'account.deleted', u.id);
      this.local.token = undefined;
      this.local.last = undefined;
    }, true);
  }

  // ---------- own profile ----------
  getMyProfile() {
    return this.run((db) => {
      const p = this.myProfile(db, this.me(db).id);
      return p ? clone(p) : null;
    });
  }

  saveDraft(biodata: Biodata, lastStep: number) {
    return this.run((db) => {
      const u = this.me(db);
      const problem = biodataProblem(biodata);
      if (problem) throw new AppError('validation', problem);
      lastStep = Math.max(0, Math.min(7, Math.floor(Number(lastStep) || 0)));
      let p = this.myProfile(db, u.id);
      if (!p) {
        // One number = one account = one biodata. A biodata removed by the team (in Trash, or purged
        // from it) can't be replaced by a fresh one; only deleting the account frees the number.
        if (u.profileRemovedAt || db.profiles.some((x) => x.userId === u.id)) throw new AppError('profile_removed');
        p = { id: uid('p_'), code: `HR-${db.nextCode++}`, userId: u.id, biodata: clone(biodata), status: 'draft', createdAt: this.iso(), updatedAt: this.iso(), lastStep };
        db.profiles.push(p);
      } else {
        p.biodata = clone(biodata);
        p.lastStep = Math.max(p.lastStep, lastStep);
        p.updatedAt = this.iso();
        // Editing a rejected profile returns it to draft so it can be resubmitted.
        if (p.status === 'rejected') p.status = 'draft';
        // Edits to a live profile keep it live (members aren't silently hidden mid-conversation);
        // post-edit moderation is a Phase 2 review queue (Tasks.md T-116).
      }
      return clone(p);
    }, true);
  }

  submitForPublication() {
    return this.run((db) => {
      const u = this.me(db);
      const p = this.myProfile(db, u.id);
      if (!p) throw new AppError('not_found');
      if (firstInvalidStep(p.biodata) !== -1) throw new AppError('incomplete_biodata');
      if (p.status === 'published' || p.status === 'pending') return { profile: clone(p) };
      const pricing = resolvePricing(db.pricing, profileTypeOf(p));
      if (pricing.publication.mode === 'disabled') throw new AppError('fee_disabled');
      // An unpaid publication order (e.g. failed payment) is reused rather than duplicated.
      const hasPaid = db.orders.some((o) => o.profileId === p.id && o.kind === 'publication' && (o.status === 'paid' || o.status === 'free'));
      if (pricing.publication.mode === 'paid' && !hasPaid) {
        let order = db.orders.find((o) => o.profileId === p.id && o.kind === 'publication' && o.status === 'pending');
        if (!order) {
          order = {
            id: uid('o_'),
            userId: u.id,
            profileId: p.id,
            kind: 'publication',
            amount: pricing.publication.amount,
            currency: pricing.currency,
            status: 'pending',
            terms: { pricingVersion: db.pricing.version, autoRenew: false },
            simulated: true,
            createdAt: this.iso(),
          };
          db.orders.unshift(order);
        }
        return { profile: clone(p), order: { ...order } };
      }
      if (pricing.publication.mode === 'free' && !hasPaid) {
        db.orders.unshift({
          id: uid('o_'), userId: u.id, profileId: p.id, kind: 'publication', amount: 0, currency: pricing.currency, status: 'free',
          terms: { pricingVersion: db.pricing.version, autoRenew: false }, simulated: false, createdAt: this.iso(),
        });
      }
      this.goLive(db, p);
      return { profile: clone(p) };
    }, true);
  }

  private goLive(db: DemoDb, p: Profile) {
    if (db.pricing.requireApproval) {
      p.status = 'pending';
      this.alertAdmins(db, 'pending_profile', { code: p.code }, `/admin/member/${p.userId}`);
    } else {
      p.status = 'published';
      p.publishedAt = p.publishedAt ?? this.iso();
      this.notify(db, p.userId, 'profile_published', {}, '/dashboard');
    }
    p.updatedAt = this.iso();
  }

  setPaused(paused: boolean) {
    return this.run((db) => {
      const u = this.me(db);
      const p = this.myProfile(db, u.id);
      if (!p) throw new AppError('not_found');
      if (paused && p.status !== 'published') throw new AppError('invalid_state');
      if (!paused && p.status !== 'paused') throw new AppError('invalid_state');
      p.status = paused ? 'paused' : 'published';
      p.updatedAt = this.iso();
      return clone(p);
    }, true);
  }

  startBoost() {
    return this.run((db) => {
      const u = this.me(db);
      const p = this.myProfile(db, u.id);
      if (!p) throw new AppError('not_found');
      if (p.status !== 'published') throw new AppError('invalid_state');
      const pricing = resolvePricing(db.pricing, profileTypeOf(p));
      if (pricing.boost.mode === 'disabled') throw new AppError('fee_disabled');
      const order: Order = {
        id: uid('o_'),
        userId: u.id,
        profileId: p.id,
        kind: 'boost',
        amount: pricing.boost.mode === 'paid' ? pricing.boost.amount : 0,
        currency: pricing.currency,
        status: pricing.boost.mode === 'paid' ? 'pending' : 'free',
        terms: { pricingVersion: db.pricing.version, boostDays: pricing.boostDays, autoRenew: false },
        simulated: pricing.boost.mode === 'paid',
        createdAt: this.iso(),
      };
      db.orders.unshift(order);
      if (order.status === 'free') this.applyBoost(db, p, order);
      return { profile: clone(p), order: { ...order } };
    }, true);
  }

  private applyBoost(db: DemoDb, p: Profile, order: Order) {
    // Extends an active boost rather than overwriting it; duration comes from the ORDER's terms.
    const active = !!p.boostUntil && new Date(p.boostUntil).getTime() > this.now().getTime();
    const base = Math.max(this.now().getTime(), p.boostUntil ? new Date(p.boostUntil).getTime() : 0);
    if (!active) p.boostStartedAt = this.iso(); // an extension keeps the original start (reach keeps counting)
    p.boostUntil = new Date(base + (order.terms.boostDays ?? db.pricing.boostDays) * 86400000).toISOString();
    // A boost of 24 h or less has no separate "ending soon" notice.
    p.boostNotices = new Date(p.boostUntil).getTime() - this.now().getTime() <= BOOST_ENDING_NOTICE_MS ? { ending: p.boostUntil } : {};
    this.notify(db, p.userId, 'boost_started', { until: p.boostUntil }, '/dashboard');
  }

  completePayment(orderId: string, outcome: 'success' | 'failure') {
    return this.run((db) => {
      const u = this.me(db);
      const order = db.orders.find((o) => o.id === orderId);
      if (!order || order.userId !== u.id) throw new AppError('not_found');
      if (order.status !== 'pending') throw new AppError('invalid_state');
      const p = db.profiles.find((x) => x.id === order.profileId);
      if (!p) throw new AppError('not_found');
      this.alertAdmins(db, 'payment', { code: p.code, status: outcome === 'success' ? 'paid' : 'failed', amount: String(order.amount), item: order.kind }, '/admin/orders');
      if (outcome === 'failure') {
        order.status = 'failed';
        this.notify(db, u.id, 'payment', { status: 'failed' }, '/dashboard');
        return { order: { ...order }, profile: clone(p) };
      }
      order.status = 'paid';
      this.notify(db, u.id, 'payment', { status: 'paid' }, '/dashboard');
      if (order.kind === 'publication') this.goLive(db, p);
      else this.applyBoost(db, p, order);
      return { order: { ...order }, profile: clone(p) };
    }, true);
  }

  getMyOrders() {
    return this.run((db) => db.orders.filter((o) => o.userId === this.me(db).id).map((o) => ({ ...o })));
  }

  getDashboard() {
    return this.run((db) => {
      const u = this.me(db);
      return dashboardMetrics(this.myProfile(db, u.id), { views: db.views, shortlists: db.shortlists, requests: db.requests, impressions: db.boostImpressions }, this.now());
    });
  }

  // ---------- discovery ----------
  searchProfiles(filters: SearchFilters, page: number, pageSize = 10): Promise<Page<ReturnType<typeof projectProfile>>> {
    return this.run((db) => {
      const u = this.me(db);
      pageSize = Math.max(1, Math.min(MAX_SEARCH_PAGE, Math.floor(Number(pageSize) || 10)));
      page = Math.max(0, Math.floor(Number(page) || 0));
      const mine = this.myProfile(db, u.id);
      const shortlisted = new Set(db.shortlists.filter((s) => s.userId === u.id).map((s) => s.profileId));
      const users = new Map(db.users.map((x) => [x.id, x]));
      const candidates = db.profiles.filter((p) => {
        if (p.userId === u.id || p.status !== 'published' || p.deletedAt) return false;
        const owner = users.get(p.userId);
        if (!owner || owner.deactivatedAt || owner.deletedAt) return false;
        return !this.isBlockedBetween(db, u.id, p);
      });
      // Default to the opposite type of the viewer's own profile.
      const f = { ...filters, show: filters.show ?? mine?.biodata.basic.lookingFor };
      const projected = candidates
        // Discovery NEVER carries contact details, even when consented (PRD §9.3) — only the profile view does.
        .map((p) => ({ ...this.project(db, u, p), contact: undefined, relation: this.relationWith(db, u.id, p) }))
        .filter((p) => matchesFilters(p, f, { shortlisted, now: this.now() }));
      const sorted = sortProfiles(projected, f.sort);
      const start = page * pageSize;
      return { items: sorted.slice(start, start + pageSize), total: sorted.length, page, hasMore: start + pageSize < sorted.length };
    });
  }

  getProfile(profileId: string) {
    return this.run((db) => {
      const u = this.me(db);
      const p = this.visibleProfile(db, u, profileId);
      if (p.userId !== u.id && !isAdminRole(u.role)) {
        const nowMs = this.now().getTime();
        // De-duplicate rapid re-opens so refreshes don't inflate view counts.
        const recent = db.views.some((v) => v.profileId === p.id && v.viewerUserId === u.id && nowMs - new Date(v.at).getTime() < VIEW_DEDUPE_MS);
        if (!recent) {
          db.views.push({ profileId: p.id, viewerUserId: u.id, at: this.iso() });
          this.noticeViews(db, p);
        }
      }
      return { ...this.project(db, u, p), relation: this.relationWith(db, u.id, p) };
    }, true);
  }

  /** Batched, anonymous "people viewed your profile" — at most one notice per owner per window. */
  private noticeViews(db: DemoDb, p: Profile) {
    const nowMs = this.now().getTime();
    const last = db.notifications.find((n) => n.userId === p.userId && n.type === 'profile_viewed');
    if (last && nowMs - new Date(last.createdAt).getTime() < VIEW_NOTICE_WINDOW_MS) return;
    const since = last ? new Date(last.createdAt).getTime() : nowMs - VIEW_NOTICE_WINDOW_MS;
    const viewers = new Set(db.views.filter((v) => v.profileId === p.id && v.viewerUserId !== p.userId && new Date(v.at).getTime() >= since).map((v) => v.viewerUserId));
    this.notify(db, p.userId, 'profile_viewed', { count: String(Math.max(1, viewers.size)) }, '/dashboard');
  }

  getFeatured(limit = 12) {
    return this.run((db) => {
      const u = this.me(db);
      const mine = this.myProfile(db, u.id);
      const lookingFor = mine?.biodata.basic.lookingFor;
      const now = this.now();
      const eligible = db.profiles.filter((p) => {
        if (p.userId === u.id) return false;
        if (!isFeaturable(p, db.users.find((x) => x.id === p.userId), now)) return false;
        if (this.isBlockedBetween(db, u.id, p)) return false;
        return !lookingFor || profileTypeOf(p) === lookingFor; // matrimony rule: people looking for this type
      });
      const shown = rotateFeatured(eligible, u.id, now).slice(0, Math.max(1, Math.min(limit, 50)));
      const day = dayKey(now);
      for (const p of shown) {
        if (!db.boostImpressions.some((i) => i.profileId === p.id && i.viewerUserId === u.id && i.day === day)) db.boostImpressions.push({ profileId: p.id, viewerUserId: u.id, day });
      }
      return shown.map((p) => ({ ...this.project(db, u, p), contact: undefined, relation: this.relationWith(db, u.id, p) }));
    }, true);
  }

  // ---------- push (phones) ----------
  registerPushDevice(token: string, platform: 'ios' | 'android') {
    return this.run((db) => {
      const u = this.me(db);
      if (typeof token !== 'string' || token.length > MAX_PUSH_TOKEN || !/^Expo(nent)?PushToken\[[^\]]{6,}\]$/.test(token) || (platform !== 'ios' && platform !== 'android')) throw new AppError('validation');
      // One phone ↔ one account: a shared phone stops receiving the previous account's alerts.
      db.pushDevices = db.pushDevices.filter((d) => d.token !== token);
      db.pushDevices.push({ token, userId: u.id, platform, createdAt: this.iso(), lastSeenAt: this.iso() });
      // Cap phones per account (oldest dropped) so a leaked account can't fan out endlessly.
      const mineDevices = db.pushDevices.filter((d) => d.userId === u.id).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
      for (const old of mineDevices.slice(5)) db.pushDevices = db.pushDevices.filter((d) => d !== old);
    }, true);
  }

  unregisterPushDevice(token: string) {
    return this.run((db) => {
      const u = this.me(db);
      db.pushDevices = db.pushDevices.filter((d) => !(d.token === token && d.userId === u.id));
    }, true);
  }

  getPushSettings() {
    return this.run((db) => {
      const u = this.me(db);
      return { prefs: prefsOf(u.pushPrefs), devices: db.pushDevices.filter((d) => d.userId === u.id).length };
    });
  }

  setPushPrefs(patch: Partial<PushPrefs>) {
    return this.run((db) => {
      const u = this.me(db);
      const allowed: (keyof PushPrefs)[] = ['enabled', 'interests', 'activity', 'announcements', 'showNames'];
      const next = prefsOf(u.pushPrefs);
      for (const k of allowed) if (typeof patch[k] === 'boolean') next[k] = patch[k] as boolean;
      u.pushPrefs = next;
      return { ...next };
    }, true);
  }

  getShortlistIds() {
    return this.run((db) => db.shortlists.filter((s) => s.userId === this.me(db).id).map((s) => s.profileId));
  }

  getShortlist() {
    return this.run((db) => {
      const u = this.me(db);
      return db.shortlists
        .filter((s) => s.userId === u.id)
        .map((s) => db.profiles.find((p) => p.id === s.profileId))
        .filter((p): p is Profile => !!p && !p.deletedAt && p.status === 'published' && !this.isBlockedBetween(db, u.id, p))
        .map((p) => ({ ...this.project(db, u, p), contact: undefined, relation: this.relationWith(db, u.id, p) }));
    });
  }

  toggleShortlist(profileId: string) {
    return this.run((db) => {
      const u = this.me(db);
      this.visibleProfile(db, u, profileId);
      const idx = db.shortlists.findIndex((s) => s.userId === u.id && s.profileId === profileId);
      if (idx >= 0) {
        db.shortlists.splice(idx, 1);
        return false;
      }
      db.shortlists.push({ userId: u.id, profileId, createdAt: this.iso() });
      // Anonymous "someone shortlisted you" — once per person, ever (un-/re-shortlisting never re-notifies).
      const key = `${u.id}:${profileId}`;
      const target = db.profiles.find((x) => x.id === profileId);
      if (target && !db.shortlistNotified.includes(key)) {
        db.shortlistNotified.push(key);
        this.notify(db, target.userId, 'profile_shortlisted', {}, '/dashboard');
      }
      return true;
    }, true);
  }

  // ---------- interests & phone sharing ----------
  sendRequest(toProfileId: string, input: SendInterestInput) {
    return this.run((db) => {
      const u = this.me(db);
      if ((input.idempotencyKey?.length ?? 0) > MAX_IDEM_KEY || (input.message?.length ?? 0) > 4000) throw new AppError('validation', 'v.tooLong');
      // Double taps / retries with the same key return the original request (no duplicates).
      const prior = input.idempotencyKey ? this.idemLookup(db, u.id, `interest:${input.idempotencyKey}`) : undefined;
      if (prior) {
        const r = db.requests.find((x) => x.id === prior);
        if (r) return { ...r };
      }
      const mine = this.myProfile(db, u.id);
      if (!mine || mine.status !== 'published') throw new AppError('invalid_state', 'Publish your biodata before expressing interest');
      const target = this.visibleProfile(db, u, toProfileId); // also enforces blocks/deletion
      if (target.userId === u.id) throw new AppError('invalid_state');
      if (!target.biodata.privacy.acceptContactRequests) throw new AppError('not_accepting');
      if (input.offerPhone && !input.consent) throw new AppError('consent_required');
      const msg = sanitizeMessage(input.message ?? '');
      if (!requestMessageSchema.safeParse(msg).success) throw new AppError('validation', 'v.tooLong');
      const pair = (r: ContactRequest) =>
        (r.fromProfileId === mine.id && r.toProfileId === target.id) || (r.fromProfileId === target.id && r.toProfileId === mine.id);
      if (db.requests.some((r) => pair(r) && isActiveRequest(r, this.now()))) throw new AppError('duplicate');
      const cooldown = this.now().getTime() - DECLINE_COOLDOWN_DAYS * 86400000;
      if (db.requests.some((r) => pair(r) && r.fromUserId === u.id && r.status === 'declined' && new Date(r.respondedAt ?? r.createdAt).getTime() > cooldown))
        throw new AppError('declined_recently');
      const dayAgo = this.now().getTime() - 86400000;
      if (db.requests.filter((r) => r.fromUserId === u.id && new Date(r.createdAt).getTime() > dayAgo).length >= MAX_REQUESTS_PER_DAY)
        throw new AppError('rate_limited');
      const req: ContactRequest = {
        id: uid('r_'), fromUserId: u.id, fromProfileId: mine.id, toUserId: target.userId, toProfileId: target.id,
        message: msg || undefined, status: 'pending', createdAt: this.iso(),
        expiresAt: new Date(this.now().getTime() + db.pricing.requestExpiryDays * 86400000).toISOString(), pokes: [],
      };
      db.requests.unshift(req);
      if (input.offerPhone) {
        db.phoneOffers.push({ id: uid('po_'), requestId: req.id, fromUserId: u.id, toUserId: target.userId, status: 'offered', withInterest: true, consentText: PHONE_CONSENT_TEXT, consentAt: this.iso(), createdAt: this.iso() });
        this.audit(db, u.id, 'phone.offered', req.id, { withInterest: true });
        this.track(db, 'phone_offer_sent', u.id, { withInterest: true }, `offer:${req.id}:${u.id}`);
      }
      if (input.idempotencyKey) db.idem.push({ key: `interest:${input.idempotencyKey}`, userId: u.id, resultId: req.id, at: this.iso() });
      // Notification text never contains a phone number — only that one was offered.
      this.notify(db, target.userId, 'request_received', { name: this.displayNameOf(db, u.id), offered: input.offerPhone ? '1' : '' }, '/requests');
      this.track(db, 'interest_initiated', u.id, { withMessage: !!msg, offerPhone: input.offerPhone }, `interest:${req.id}`);
      if (msg) this.track(db, 'introduction_sent', u.id, {}, `intro:${req.id}`);
      return { ...req };
    }, true);
  }

  private latestOffer(db: DemoDb, requestId: string, fromUserId: string) {
    const list = db.phoneOffers.filter((o) => o.requestId === requestId && o.fromUserId === fromUserId);
    return list.length ? { ...list[list.length - 1] } : undefined;
  }

  private requestView(db: DemoDb, me: User, r: ContactRequest): RequestView | null {
    const direction = r.toUserId === me.id ? 'received' : 'sent';
    const otherProfile = db.profiles.find((p) => p.id === (direction === 'received' ? r.fromProfileId : r.toProfileId));
    if (!otherProfile || otherProfile.deletedAt) return null;
    const otherUserId = direction === 'received' ? r.fromUserId : r.toUserId;
    const recipientProfile = db.profiles.find((p) => p.id === r.toProfileId);
    return {
      request: { ...r, pokes: [...r.pokes] },
      other: this.project(db, me, otherProfile),
      direction,
      myConsent: mergeScopes(db.consents.filter((c) => c.requestId === r.id && c.grantorUserId === me.id).map((c) => c.scopes)),
      myOffer: this.latestOffer(db, r.id, me.id),
      theirOffer: this.latestOffer(db, r.id, otherUserId),
      poke: pokeEligibility(r, me.id, db.requests, db.pricing, recipientProfile?.biodata.privacy.allowReminders !== false, this.now()),
      myPhoneMasked: maskPhone(me.phone),
    };
  }

  getRequests() {
    return this.run((db) => {
      const u = this.me(db);
      return db.requests
        .filter((r) => r.fromUserId === u.id || r.toUserId === u.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => this.requestView(db, u, r))
        .filter((x): x is RequestView => !!x);
    });
  }

  getRequestStatusWith(profileId: string) {
    return this.run((db) => {
      const u = this.me(db);
      const mine = this.myProfile(db, u.id);
      if (!mine) return null;
      // Latest request between the pair, whatever its status (so the profile shows it).
      const r = db.requests
        .filter((x) => (x.fromProfileId === mine.id && x.toProfileId === profileId) || (x.toProfileId === mine.id && x.fromProfileId === profileId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return r ? this.requestView(db, u, r) : null;
    });
  }

  /** Accept/decline. Atomic: the offer's state is read at this instant, so a withdrawn offer is never revealed. */
  respondToRequest(requestId: string, decision: 'accepted' | 'declined') {
    return this.run((db) => {
      const u = this.me(db);
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || r.toUserId !== u.id) throw new AppError('not_found');
      if (r.status === 'pending' && new Date(r.expiresAt).getTime() <= this.now().getTime()) throw new AppError('expired');
      if (r.status !== 'pending') throw new AppError(r.status === 'expired' ? 'expired' : 'invalid_state');
      r.status = decision;
      r.respondedAt = this.iso();
      const withInterest = db.phoneOffers.find((o) => o.requestId === r.id && o.fromUserId === r.fromUserId && o.withInterest && o.status === 'offered');
      if (decision === 'accepted') {
        if (withInterest) {
          withInterest.status = 'accepted';
          withInterest.respondedAt = this.iso();
          this.audit(db, u.id, 'phone.revealed', r.id, { from: r.fromUserId, to: u.id });
          this.track(db, 'number_revealed', u.id, { withInterest: true }, `reveal:${withInterest.id}`);
        }
        this.track(db, 'request_accepted', u.id, { hoursToRespond: Math.round((this.now().getTime() - new Date(r.createdAt).getTime()) / 3600000) }, `accept:${r.id}`);
      } else {
        if (withInterest) withInterest.status = 'expired';
        this.track(db, 'request_declined', u.id, {}, `decline:${r.id}`);
      }
      this.notify(db, r.fromUserId, decision === 'accepted' ? 'request_accepted' : 'request_declined', { name: this.displayNameOf(db, u.id) }, '/requests');
      return { ...r };
    }, true);
  }

  withdrawRequest(requestId: string) {
    return this.run((db) => {
      const u = this.me(db);
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || r.fromUserId !== u.id) throw new AppError('not_found');
      if (r.status !== 'pending') throw new AppError('invalid_state');
      r.status = 'withdrawn';
      for (const o of db.phoneOffers) if (o.requestId === r.id && o.status === 'offered') o.status = 'withdrawn';
      this.audit(db, u.id, 'request.withdrawn', r.id);
      return { ...r };
    }, true);
  }

  offerPhone(requestId: string, consent: boolean, idempotencyKey: string) {
    return this.run((db) => {
      const u = this.me(db);
      if ((idempotencyKey?.length ?? 0) > MAX_IDEM_KEY) throw new AppError('validation');
      const prior = idempotencyKey ? this.idemLookup(db, u.id, `offer:${idempotencyKey}`) : undefined;
      if (prior) {
        const o = db.phoneOffers.find((x) => x.id === prior);
        if (o) return { ...o };
      }
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || (r.fromUserId !== u.id && r.toUserId !== u.id)) throw new AppError('not_found');
      if (r.status !== 'accepted') throw new AppError('invalid_state', 'Offers can be made after the interest is accepted');
      if (!consent) throw new AppError('consent_required');
      const toUserId = r.fromUserId === u.id ? r.toUserId : r.fromUserId;
      const existing = db.phoneOffers.find((o) => o.requestId === r.id && o.fromUserId === u.id && (o.status === 'offered' || o.status === 'accepted'));
      if (existing) throw new AppError('duplicate');
      const offer: PhoneOffer = { id: uid('po_'), requestId: r.id, fromUserId: u.id, toUserId, status: 'offered', withInterest: false, consentText: PHONE_CONSENT_TEXT, consentAt: this.iso(), createdAt: this.iso() };
      db.phoneOffers.push(offer);
      if (idempotencyKey) db.idem.push({ key: `offer:${idempotencyKey}`, userId: u.id, resultId: offer.id, at: this.iso() });
      this.audit(db, u.id, 'phone.offered', r.id, { withInterest: false });
      this.track(db, 'reciprocal_offer_sent', u.id, {}, `offer:${offer.id}`);
      this.notify(db, toUserId, 'phone_offer_received', { name: this.displayNameOf(db, u.id) }, '/requests');
      return { ...offer };
    }, true);
  }

  respondToPhoneOffer(offerId: string, decision: 'accepted' | 'declined') {
    return this.run((db) => {
      const u = this.me(db);
      const o = db.phoneOffers.find((x) => x.id === offerId);
      if (!o || o.toUserId !== u.id) throw new AppError('not_found');
      const r = db.requests.find((x) => x.id === o.requestId);
      // Withdrawn/expired offers (or a blocked/closed request) can never be accepted.
      if (o.status !== 'offered' || r?.status !== 'accepted') throw new AppError('invalid_state');
      o.status = decision;
      o.respondedAt = this.iso();
      if (decision === 'accepted') {
        this.audit(db, u.id, 'phone.revealed', o.requestId, { from: o.fromUserId, to: u.id });
        this.track(db, 'number_revealed', u.id, { withInterest: false }, `reveal:${o.id}`);
      }
      this.notify(db, o.fromUserId, decision === 'accepted' ? 'phone_offer_accepted' : 'phone_offer_declined', { name: this.displayNameOf(db, u.id) }, '/requests');
      return { ...o };
    }, true);
  }

  withdrawPhoneOffer(offerId: string) {
    return this.run((db) => {
      const u = this.me(db);
      const o = db.phoneOffers.find((x) => x.id === offerId);
      if (!o || o.fromUserId !== u.id) throw new AppError('not_found');
      if (o.status !== 'offered') throw new AppError('invalid_state', 'Only an offer that has not been accepted can be withdrawn');
      o.status = 'withdrawn';
      o.respondedAt = this.iso();
      this.audit(db, u.id, 'phone.offer_withdrawn', o.requestId);
      this.notify(db, o.toUserId, 'phone_offer_withdrawn', { name: this.displayNameOf(db, u.id) }, '/requests');
      return { ...o };
    }, true);
  }

  pokeRequest(requestId: string) {
    return this.run((db) => {
      const u = this.me(db);
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || (r.fromUserId !== u.id && r.toUserId !== u.id)) throw new AppError('not_found');
      const target = db.profiles.find((p) => p.id === r.toProfileId);
      if (!target || target.deletedAt || this.isBlockedBetween(db, u.id, target)) throw new AppError('invalid_state');
      const e = pokeEligibility(r, u.id, db.requests, db.pricing, target.biodata.privacy.allowReminders !== false, this.now());
      if (!e.canPoke) {
        const map = { wait: 'poke_wait', used: 'poke_used', limit: 'poke_limit', optout: 'poke_optout' } as const;
        throw new AppError(map[e.reason as keyof typeof map] ?? 'invalid_state', undefined, { availableAt: e.availableAt });
      }
      r.pokes.push(this.iso()); // status deliberately unchanged
      this.notify(db, r.toUserId, 'poke', {}, '/requests'); // anonymous, guilt-free wording
      this.track(db, 'poke_sent', u.id, {}, `poke:${r.id}`);
    }, true);
  }

  setAllowReminders(allow: boolean) {
    return this.run((db) => {
      const u = this.me(db);
      const p = this.myProfile(db, u.id);
      if (!p) throw new AppError('not_found');
      p.biodata.privacy.allowReminders = allow;
      p.updatedAt = this.iso();
    }, true);
  }

  /** Photos / full-biodata consent after acceptance. Phone sharing uses offers and is ignored here. */
  setConsent(requestId: string, scopes: ConsentScopes) {
    return this.run((db) => {
      const u = this.me(db);
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || (r.toUserId !== u.id && r.fromUserId !== u.id)) throw new AppError('not_found');
      if (r.status !== 'accepted') throw new AppError('invalid_state');
      const clean = { photos: scopes?.photos === true, phone: false, fullBiodata: scopes?.fullBiodata === true };
      const granteeUserId = r.toUserId === u.id ? r.fromUserId : r.toUserId;
      const grantorProfileId = r.toUserId === u.id ? r.toProfileId : r.fromProfileId;
      const existing = db.consents.find((c) => c.requestId === r.id && c.grantorUserId === u.id);
      const before = existing ? { ...existing.scopes } : { ...NO_CONSENT };
      if (existing) {
        existing.scopes = clean;
        existing.updatedAt = this.iso();
      } else {
        db.consents.push({ id: uid('c_'), requestId: r.id, grantorUserId: u.id, grantorProfileId, granteeUserId, scopes: clean, createdAt: this.iso(), updatedAt: this.iso() });
      }
      this.audit(db, u.id, 'consent.updated', r.id, { before, after: clean });
      const newlyShared = (['photos', 'fullBiodata'] as const).filter((k) => clean[k] && !before[k]);
      if (newlyShared.length)
        this.notify(db, granteeUserId, 'contact_shared', { name: this.displayNameOf(db, u.id), scopes: newlyShared.join(',') }, `/profile/${grantorProfileId}`);
    }, true);
  }

  // ---------- safety ----------
  reportProfile(profileId: string, reason: string, details?: string) {
    return this.run((db) => {
      const u = this.me(db);
      if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw new AppError('validation');
      const target = db.profiles.find((p) => p.id === profileId);
      // Reportable: anything the member could have seen (live, or paused/blocked after they saw it) — never drafts.
      if (!target || target.deletedAt || (target.status !== 'published' && target.status !== 'paused')) throw new AppError('not_found');
      if (target.userId === u.id) throw new AppError('invalid_state');
      if (db.reports.some((r) => r.reporterUserId === u.id && r.profileId === profileId && r.status === 'open')) throw new AppError('duplicate');
      const dayAgo = this.now().getTime() - 86400000;
      if (db.reports.filter((r) => r.reporterUserId === u.id && new Date(r.createdAt).getTime() > dayAgo).length >= MAX_REPORTS_PER_DAY) throw new AppError('rate_limited');
      const note = typeof details === 'string' ? details.trim().slice(0, 1000) : undefined;
      db.reports.unshift({ id: uid('rp_'), reporterUserId: u.id, profileId, reason, details: note || undefined, status: 'open', createdAt: this.iso() });
      this.track(db, 'user_reported', u.id, { reason });
      this.alertAdmins(db, 'report', { code: this.codeOf(db, profileId), reason }, '/admin/reports');
    }, true);
  }

  blockProfile(profileId: string) {
    return this.run((db) => {
      const u = this.me(db);
      const target = db.profiles.find((p) => p.id === profileId);
      if (!target || target.deletedAt) throw new AppError('not_found');
      if (target.userId === u.id) throw new AppError('invalid_state');
      if (!db.blocks.some((b) => b.userId === u.id && b.blockedProfileId === profileId)) db.blocks.push({ userId: u.id, blockedProfileId: profileId, createdAt: this.iso() });
      db.shortlists = db.shortlists.filter((s) => !(s.userId === u.id && s.profileId === profileId));
      // Every open or accepted request between the two becomes Blocked: no requests, pokes or sharing,
      // and any shared number stops being visible (scopesFor requires an accepted request).
      const mine = this.myProfile(db, u.id);
      for (const r of db.requests) {
        if ((r.status === 'pending' || r.status === 'accepted') && mine && ((r.fromProfileId === mine.id && r.toProfileId === profileId) || (r.toProfileId === mine.id && r.fromProfileId === profileId))) {
          r.status = 'blocked';
          for (const o of db.phoneOffers) if (o.requestId === r.id && o.status === 'offered') o.status = 'withdrawn';
        }
      }
      this.track(db, 'user_blocked', u.id, {}, `block:${u.id}:${profileId}`);
    }, true);
  }

  unblockProfile(profileId: string) {
    return this.run((db) => {
      const u = this.me(db);
      db.blocks = db.blocks.filter((b) => !(b.userId === u.id && b.blockedProfileId === profileId));
    }, true);
  }

  getBlockedIds() {
    return this.run((db) => db.blocks.filter((b) => b.userId === this.me(db).id).map((b) => b.blockedProfileId));
  }

  // ---------- notifications ----------
  getNotifications() {
    return this.run((db) => {
      const u = this.me(db);
      return db.notifications
        .filter((n) => n.userId === u.id)
        .map((n): NotificationView | null => {
          if (!n.announcementId) return { ...n };
          const a = db.announcements.find((x) => x.id === n.announcementId);
          if (!a || !isAnnouncementLive(a, this.now())) return null;
          return { ...n, announcement: { id: a.id, title: a.title, body: a.body, priority: a.priority, deepLink: a.deepLink, imageUrl: a.imageUrl } };
        })
        .filter((x): x is NotificationView => !!x);
    });
  }

  markNotificationRead(id: string) {
    return this.run((db) => {
      const u = this.me(db);
      const n = db.notifications.find((x) => x.id === id && x.userId === u.id);
      if (!n) throw new AppError('not_found');
      n.readAt = n.readAt ?? this.iso();
      // An announcement "view" is the user opening it — never a background refresh.
      if (n.announcementId) {
        const d = db.deliveries.find((x) => x.announcementId === n.announcementId && x.userId === u.id);
        if (d && !d.viewedAt) d.viewedAt = this.iso();
      }
    }, true);
  }

  markAllNotificationsRead() {
    return this.run((db) => {
      const u = this.me(db);
      // Bulk "mark all read" clears the badge but does NOT count as viewing announcements.
      for (const n of db.notifications) if (n.userId === u.id && !n.readAt) n.readAt = this.iso();
    }, true);
  }

  recordNotificationClick(id: string) {
    return this.run((db) => {
      const u = this.me(db);
      const n = db.notifications.find((x) => x.id === id && x.userId === u.id);
      if (!n?.announcementId) return;
      const d = db.deliveries.find((x) => x.announcementId === n.announcementId && x.userId === u.id);
      if (d) {
        d.viewedAt = d.viewedAt ?? this.iso();
        d.clickedAt = d.clickedAt ?? this.iso();
      }
    }, true);
  }

  // ---------- pricing ----------
  getPricing() {
    return this.run((db) => clone(db.pricing));
  }

  // ---------- admin ----------
  adminStats() {
    return this.run((db): AdminStats => {
      this.admin(db);
      const profiles: Record<ProfileStatus, number> = { draft: 0, pending: 0, published: 0, paused: 0, rejected: 0 };
      const live = db.profiles.filter((p) => !p.deletedAt);
      for (const p of live) profiles[p.status]++;
      const paid = db.orders.filter((o) => o.status === 'paid');
      return {
        users: db.users.filter((u) => u.role === 'user' && !u.deletedAt).length,
        activeUsers: db.users.filter((u) => u.role === 'user' && !u.deactivatedAt && !u.deletedAt).length,
        profiles,
        brides: live.filter((p) => profileTypeOf(p) === 'bride').length,
        grooms: live.filter((p) => profileTypeOf(p) === 'groom').length,
        trash: db.profiles.filter((p) => p.deletedAt).length + db.users.filter((u) => u.deletedAt).length,
        connections: this.connectionMetrics(db),
        push: {
          devices: db.pushDevices.length,
          usersWithDevices: new Set(db.pushDevices.map((d) => d.userId)).size,
          queued: db.pushOutbox.filter((x) => x.status === 'queued').length,
          sent: db.pushOutbox.filter((x) => x.status === 'sent').length,
          delivered: db.pushOutbox.filter((x) => x.status === 'delivered').length,
          failed: db.pushOutbox.filter((x) => x.status === 'failed').length,
          skipped: db.pushOutbox.filter((x) => x.status === 'skipped' && x.reason !== 'not_configured').length,
          notConfigured: db.pushOutbox.filter((x) => x.reason === 'not_configured').length,
        },
        boosts: {
          active: live.filter((p) => !!p.boostUntil && new Date(p.boostUntil).getTime() > this.now().getTime()).length,
          visible: live.filter((p) => isFeaturable(p, db.users.find((x) => x.id === p.userId), this.now())).length,
        },
        requireApproval: db.pricing.requireApproval,
        openReports: db.reports.filter((r) => r.status === 'open').length,
        revenue: paid.filter((o) => !o.simulated).reduce((s, o) => s + o.amount, 0),
        simulatedRevenue: paid.filter((o) => o.simulated).reduce((s, o) => s + o.amount, 0),
        requests: db.requests.length,
        acceptedRequests: db.requests.filter((r) => r.status === 'accepted').length,
      };
    });
  }

  adminListProfiles(status?: ProfileStatus) {
    return this.run((db) => {
      this.admin(db);
      return db.profiles
        .filter((p) => !p.deletedAt && (!status || p.status === status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((p) => ({ ...clone(p), phoneMasked: maskPhone(db.users.find((u) => u.id === p.userId)?.phone ?? '') }));
    });
  }

  adminSetProfileStatus(profileId: string, status: ProfileStatus, note?: string) {
    return this.run((db) => {
      const a = this.admin(db);
      const p = db.profiles.find((x) => x.id === profileId);
      if (!p) throw new AppError('not_found');
      const before = p.status;
      p.status = status;
      p.adminNote = note || undefined;
      p.updatedAt = this.iso();
      if (status === 'published') {
        p.publishedAt = p.publishedAt ?? this.iso();
        this.notify(db, p.userId, 'profile_approved', {}, '/dashboard');
      }
      if (status === 'rejected') this.notify(db, p.userId, 'profile_rejected', { note: note ?? '' }, '/biodata');
      this.audit(db, a.id, 'profile.status', p.id, { before, after: status, note });
      return clone(p);
    }, true);
  }

  adminListUsers() {
    return this.run((db) => {
      this.admin(db);
      return db.users.filter((u) => !u.deletedAt).map((u) => ({ ...u, phone: maskPhone(u.phone), profileStatus: this.myProfile(db, u.id)?.status, profileCode: this.myProfile(db, u.id)?.code }));
    });
  }

  adminSetUserDeactivated(userId: string, deactivated: boolean) {
    return this.run((db) => {
      const a = this.admin(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u || u.deletedAt) throw new AppError('not_found');
      if (u.id === a.id) throw new AppError('forbidden');
      this.assertCanManage(a, u);
      u.deactivatedAt = deactivated ? this.iso() : undefined;
      u.deactivatedBy = deactivated ? a.id : undefined;
      const p = this.myProfile(db, u.id);
      if (deactivated && p?.status === 'published') p.status = 'paused';
      if (deactivated) this.revokeSessions(db, u.id, 'suspended');
      this.audit(db, a.id, deactivated ? 'user.deactivated' : 'user.reactivated', u.id);
    }, true);
  }

  adminUpdatePricing(cfg: PricingConfig) {
    return this.run((db) => {
      const a = this.admin(db);
      const errors = validatePricing(cfg);
      if (errors.length) throw new AppError('validation', errors.join('; '));
      const before = clone(db.pricing);
      const after: PricingConfig = { ...clone(cfg), version: before.version + 1, updatedAt: this.iso(), updatedBy: a.id };
      db.pricing = after;
      db.pricingHistory.unshift({ id: uid('pc_'), adminId: a.id, before, after, at: this.iso() });
      this.audit(db, a.id, 'pricing.updated', undefined, { version: after.version });
      return clone(after);
    }, true);
  }

  adminPricingHistory() {
    return this.run((db) => {
      this.admin(db);
      return clone(db.pricingHistory);
    });
  }

  adminListOrders() {
    return this.run((db) => {
      this.admin(db);
      return db.orders.map((o) => ({ ...o, profileCode: this.codeOf(db, o.profileId) }));
    });
  }

  adminListReports() {
    return this.run((db) => {
      this.admin(db);
      return db.reports.map((r) => ({ ...r, profileName: db.profiles.find((p) => p.id === r.profileId)?.biodata.basic.fullName ?? '—', profileCode: this.codeOf(db, r.profileId), profileUserId: db.profiles.find((p) => p.id === r.profileId)?.userId }));
    });
  }

  adminResolveReport(reportId: string, status: 'resolved' | 'dismissed', pauseProfile?: boolean) {
    return this.run((db) => {
      const a = this.admin(db);
      const r = db.reports.find((x) => x.id === reportId);
      if (!r) throw new AppError('not_found');
      r.status = status;
      r.resolvedAt = this.iso();
      if (pauseProfile) {
        const p = db.profiles.find((x) => x.id === r.profileId);
        if (p) {
          p.status = 'paused';
          this.notify(db, p.userId, 'safety', {}, '/dashboard');
        }
      }
      this.audit(db, a.id, 'report.' + status, r.id, { pauseProfile: !!pauseProfile });
    }, true);
  }

  adminListAnnouncements() {
    return this.run((db) => {
      this.admin(db);
      return db.announcements
        .slice()
        .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
        .map((a) => ({ ...clone(a), stats: announcementStats(a, db.deliveries) }));
    });
  }

  adminSaveAnnouncement(input: Partial<Announcement> & Pick<Announcement, 'title' | 'body' | 'segment'>) {
    return this.run((db) => {
      const admin = this.admin(db);
      if (!input.title?.en?.trim() || !input.body?.en?.trim()) throw new AppError('validation', 'English title and body are required');
      const tooLong = (l: Partial<Record<string, string>>, max: number) => Object.values(l).some((v) => typeof v === 'string' && v.length > max);
      if (tooLong(input.title, 200) || tooLong(input.body, 4000)) throw new AppError('validation', 'Title or message is too long');
      if (input.deepLink && !isInternalLink(input.deepLink)) throw new AppError('validation', 'Links must be an in-app path such as /biodata');
      if (input.imageUrl && !isHttpsUrl(input.imageUrl)) throw new AppError('validation', 'Images must use an https:// address');
      if (input.id) {
        const a = db.announcements.find((x) => x.id === input.id);
        if (!a) throw new AppError('not_found');
        if (a.status !== 'draft' && a.status !== 'scheduled') throw new AppError('invalid_state', 'Only drafts can be edited');
        // Only editable fields — status, author and timestamps can never be forged through an edit.
        const { title, body, imageUrl, priority, deepLink, segment, pushEnabled, expiresAt } = input;
        Object.assign(a, { title, body, imageUrl, priority: priority ?? a.priority, deepLink, segment, pushEnabled: !!pushEnabled, expiresAt, updatedAt: this.iso() });
        this.audit(db, admin.id, 'announcement.updated', a.id);
        return clone(a);
      }
      const a: Announcement = {
        id: uid('a_'),
        title: input.title,
        body: input.body,
        imageUrl: input.imageUrl,
        priority: input.priority ?? 'normal',
        deepLink: input.deepLink,
        segment: input.segment,
        status: 'draft',
        pushEnabled: !!input.pushEnabled,
        expiresAt: input.expiresAt,
        createdBy: admin.id,
        createdAt: this.iso(),
        updatedAt: this.iso(),
      };
      db.announcements.unshift(a);
      this.audit(db, admin.id, 'announcement.created', a.id);
      return clone(a);
    }, true);
  }

  adminPublishAnnouncement(id: string, scheduledAt?: string) {
    return this.run((db) => {
      const admin = this.admin(db);
      const a = db.announcements.find((x) => x.id === id);
      if (!a) throw new AppError('not_found');
      if (a.status !== 'draft' && a.status !== 'scheduled') throw new AppError('invalid_state');
      if (scheduledAt && new Date(scheduledAt).getTime() > this.now().getTime()) {
        a.status = 'scheduled';
        a.scheduledAt = scheduledAt;
        a.updatedAt = this.iso();
      } else {
        this.fanOut(db, a);
      }
      this.audit(db, admin.id, 'announcement.' + a.status, a.id);
      return clone(a);
    }, true);
  }

  adminArchiveAnnouncement(id: string) {
    return this.run((db) => {
      const admin = this.admin(db);
      const a = db.announcements.find((x) => x.id === id);
      if (!a) throw new AppError('not_found');
      a.status = 'archived';
      a.updatedAt = this.iso();
      this.audit(db, admin.id, 'announcement.archived', a.id);
      return clone(a);
    }, true);
  }

  adminAudiencePreview(segment: Announcement['segment']) {
    return this.run((db) => {
      this.admin(db);
      return audienceFor(segment, db.users, db.profiles).length;
    });
  }

  adminRecipientReport(id: string) {
    return this.run((db) => {
      const admin = this.admin(db);
      // Access to recipient-level data is itself audited (PRD §14).
      this.audit(db, admin.id, 'announcement.recipient_report_viewed', id);
      return db.deliveries
        .filter((d) => d.announcementId === id)
        .map((d): RecipientRow => ({ userId: d.userId, profileCode: db.profiles.find((p) => p.userId === d.userId)?.code, maskedPhone: maskPhone(db.users.find((u) => u.id === d.userId)?.phone ?? ''), delivery: { ...d } }));
    }, true);
  }

  adminAuditLog() {
    return this.run((db) => {
      this.admin(db);
      const label = (t?: string) => {
        if (!t) return undefined;
        const p = db.profiles.find((x) => x.id === t) ?? db.profiles.find((x) => x.userId === t);
        return p?.code;
      };
      return db.audit.slice(0, 200).map((a) => ({ ...a, targetLabel: label(a.target) }));
    });
  }

  private connectionMetrics(db: DemoDb): ConnectionMetrics {
    const rq = db.requests;
    const answered = rq.filter((r) => r.respondedAt);
    const hours = answered.map((r) => (new Date(r.respondedAt!).getTime() - new Date(r.createdAt).getTime()) / 3600000).sort((a, b) => a - b);
    const accepted = rq.filter((r) => r.status === 'accepted' || (r.status === 'blocked' && r.respondedAt)).length;
    const shared = new Set(db.phoneOffers.filter((o) => o.status === 'accepted').map((o) => o.requestId)).size;
    const poked = rq.filter((r) => r.pokes.length);
    const pokedAnswered = poked.filter((r) => r.respondedAt && r.respondedAt > r.pokes[0]).length;
    return {
      interests: rq.length,
      accepted,
      declined: rq.filter((r) => r.status === 'declined').length,
      expired: rq.filter((r) => r.status === 'expired').length,
      blocked: rq.filter((r) => r.status === 'blocked').length,
      phoneOffers: db.phoneOffers.length,
      phoneShared: db.phoneOffers.filter((o) => o.status === 'accepted').length,
      pokes: poked.length,
      pokedThenAnswered: pokedAnswered,
      acceptanceRate: rq.length ? accepted / rq.length : 0,
      sharingRate: accepted ? shared / accepted : 0,
      pokeResponseRate: poked.length ? pokedAnswered / poked.length : 0,
      medianResponseHours: hours.length ? Math.round(hours[Math.floor(hours.length / 2)]) : undefined,
    };
  }

  // ---------- admin: approval mode & bulk ----------
  adminSetRequireApproval(requireApproval: boolean) {
    return this.run((db) => {
      const a = this.admin(db);
      const before = clone(db.pricing);
      db.pricing = { ...db.pricing, requireApproval, version: before.version + 1, updatedAt: this.iso(), updatedBy: a.id };
      db.pricingHistory.unshift({ id: uid('pc_'), adminId: a.id, before, after: clone(db.pricing), at: this.iso() });
      this.audit(db, a.id, 'settings.approval_mode', undefined, { requireApproval });
      return { requireApproval, pending: db.profiles.filter((p) => p.status === 'pending' && !p.deletedAt).length };
    }, true);
  }

  adminApproveAllPending() {
    return this.run((db) => {
      const a = this.admin(db);
      const pending = db.profiles.filter((p) => p.status === 'pending' && !p.deletedAt);
      for (const p of pending) {
        p.status = 'published';
        p.publishedAt = p.publishedAt ?? this.iso();
        p.adminNote = undefined;
        p.updatedAt = this.iso();
        this.notify(db, p.userId, 'profile_approved', {}, '/dashboard');
      }
      this.audit(db, a.id, 'profile.bulk_approve', undefined, { count: pending.length });
      return pending.length;
    }, true);
  }

  // ---------- admin: deletions (soft → Trash) ----------
  adminDeleteProfile(profileId: string, reason: string) {
    return this.run((db) => {
      const a = this.admin(db);
      const p = db.profiles.find((x) => x.id === profileId && !x.deletedAt);
      if (!p) throw new AppError('not_found');
      const owner = db.users.find((u) => u.id === p.userId);
      if (owner && owner.id !== a.id) this.assertCanManage(a, owner);
      p.deletedAt = this.iso();
      p.deletedBy = a.id;
      p.deleteReason = reason.trim().slice(0, 300) || undefined;
      if (owner) owner.profileRemovedAt = p.deletedAt;
      for (const r of db.requests) if (r.status === 'pending' && (r.fromProfileId === p.id || r.toProfileId === p.id)) r.status = 'withdrawn';
      this.notify(db, p.userId, 'safety', {}, '/dashboard');
      this.audit(db, a.id, 'profile.deleted', p.id, { reason: p.deleteReason });
    }, true);
  }

  adminRemovePhoto(profileId: string, photoId: string) {
    return this.run((db) => {
      const a = this.admin(db);
      const p = db.profiles.find((x) => x.id === profileId && !x.deletedAt);
      if (!p) throw new AppError('not_found');
      const before = p.biodata.photos.length;
      p.biodata.photos = p.biodata.photos.filter((ph) => ph.id !== photoId);
      if (p.biodata.photos.length === before) throw new AppError('not_found');
      p.updatedAt = this.iso();
      this.notify(db, p.userId, 'safety', {}, '/biodata');
      this.audit(db, a.id, 'profile.photo_removed', p.id, { photoId });
    }, true);
  }

  adminDeleteUser(userId: string, reason: string) {
    return this.run((db) => {
      const a = this.admin(db);
      const u = db.users.find((x) => x.id === userId && !x.deletedAt);
      if (!u) throw new AppError('not_found');
      if (u.id === a.id) throw new AppError('forbidden');
      this.assertCanManage(a, u);
      if (u.role === 'admin') u.role = 'user'; // a deleted sub-admin never comes back as an admin
      u.deletedAt = this.iso();
      u.deletedBy = a.id;
      u.deleteReason = reason.trim().slice(0, 300) || undefined;
      const p = this.myProfile(db, u.id);
      if (p) {
        p.deletedAt = u.deletedAt;
        p.deletedBy = a.id;
        p.deleteReason = 'Account deleted';
      }
      for (const r of db.requests) if (r.status === 'pending' && (r.fromUserId === u.id || r.toUserId === u.id)) r.status = 'withdrawn';
      this.revokeSessions(db, u.id, 'account_removed');
      this.audit(db, a.id, 'user.deleted', u.id, { reason: u.deleteReason });
    }, true);
  }

  adminListRequests() {
    return this.run((db): AdminRequestRow[] => {
      this.admin(db);
      const name = (id: string) => db.profiles.find((p) => p.id === id)?.biodata.basic.fullName ?? '—';
      return db.requests.map((r) => ({ ...r, fromName: name(r.fromProfileId), toName: name(r.toProfileId), fromCode: this.codeOf(db, r.fromProfileId), toCode: this.codeOf(db, r.toProfileId) }));
    });
  }

  adminDeleteRequest(requestId: string) {
    return this.run((db) => {
      const a = this.admin(db);
      if (!db.requests.some((r) => r.id === requestId)) throw new AppError('not_found');
      db.requests = db.requests.filter((r) => r.id !== requestId);
      db.consents = db.consents.filter((c) => c.requestId !== requestId);
      db.phoneOffers = db.phoneOffers.filter((o) => o.requestId !== requestId);
      this.audit(db, a.id, 'request.deleted', requestId);
    }, true);
  }

  adminDeleteReport(reportId: string) {
    return this.run((db) => {
      const a = this.admin(db);
      if (!db.reports.some((r) => r.id === reportId)) throw new AppError('not_found');
      db.reports = db.reports.filter((r) => r.id !== reportId);
      this.audit(db, a.id, 'report.deleted', reportId);
    }, true);
  }

  adminDeleteAnnouncement(id: string) {
    return this.run((db) => {
      const a = this.admin(db);
      if (!db.announcements.some((x) => x.id === id)) throw new AppError('not_found');
      db.announcements = db.announcements.filter((x) => x.id !== id);
      db.deliveries = db.deliveries.filter((d) => d.announcementId !== id);
      db.notifications = db.notifications.filter((n) => n.announcementId !== id);
      this.audit(db, a.id, 'announcement.deleted', id);
    }, true);
  }

  /** Orders are financial records: they can be cancelled while pending, never deleted. */
  adminCancelOrder(orderId: string) {
    return this.run((db) => {
      const a = this.admin(db);
      const o = db.orders.find((x) => x.id === orderId);
      if (!o) throw new AppError('not_found');
      if (o.status !== 'pending') throw new AppError('invalid_state');
      o.status = 'cancelled';
      this.audit(db, a.id, 'order.cancelled', o.id);
    }, true);
  }

  // ---------- trash (list: any admin; restore/purge: master only) ----------
  adminListTrash() {
    return this.run((db): TrashItem[] => {
      this.admin(db);
      const users: TrashItem[] = db.users
        .filter((u) => u.deletedAt)
        .map((u) => ({ kind: 'user', id: u.id, label: `${db.profiles.find((p) => p.userId === u.id)?.code ?? 'No profile'} · ${u.countryCode} ${maskPhone(u.phone)}`, deletedAt: u.deletedAt!, deletedBy: u.deletedBy, reason: u.deleteReason, purgeAt: new Date(new Date(u.deletedAt!).getTime() + TRASH_RETENTION_MS).toISOString() }));
      const owners = new Set(db.users.filter((u) => u.deletedAt).map((u) => u.id));
      const profiles: TrashItem[] = db.profiles
        .filter((p) => p.deletedAt && !owners.has(p.userId)) // profiles of deleted users restore with the user
        .map((p) => ({ kind: 'profile', id: p.id, label: `${p.code} · ${p.biodata.basic.fullName}`, deletedAt: p.deletedAt!, deletedBy: p.deletedBy, reason: p.deleteReason, purgeAt: new Date(new Date(p.deletedAt!).getTime() + TRASH_RETENTION_MS).toISOString() }));
      return [...users, ...profiles].sort((x, y) => y.deletedAt.localeCompare(x.deletedAt));
    });
  }

  masterRestore(kind: 'user' | 'profile', id: string) {
    return this.run((db) => {
      const m = this.master(db);
      if (kind === 'user') {
        const u = db.users.find((x) => x.id === id && x.deletedAt);
        if (!u) throw new AppError('not_found');
        const deletedAt = u.deletedAt;
        u.deletedAt = u.deletedBy = u.deleteReason = undefined;
        const p = db.profiles.find((x) => x.userId === u.id && x.deletedAt === deletedAt);
        if (p && !this.myProfile(db, u.id)) {
          p.deletedAt = p.deletedBy = p.deleteReason = undefined;
          u.profileRemovedAt = undefined;
        }
      } else {
        const p = db.profiles.find((x) => x.id === id && x.deletedAt);
        if (!p) throw new AppError('not_found');
        if (this.myProfile(db, p.userId)) throw new AppError('invalid_state', 'This member already has a live profile');
        p.deletedAt = p.deletedBy = p.deleteReason = undefined;
        const owner = db.users.find((x) => x.id === p.userId);
        if (owner) owner.profileRemovedAt = undefined;
      }
      this.audit(db, m.id, `${kind}.restored`, id);
    }, true);
  }

  masterPurge(kind: 'user' | 'profile', id: string) {
    return this.run((db) => {
      const m = this.master(db);
      if (kind === 'user') {
        if (!db.users.some((x) => x.id === id && x.deletedAt)) throw new AppError('not_found');
        this.purgeUser(db, id);
      } else {
        if (!db.profiles.some((x) => x.id === id && x.deletedAt)) throw new AppError('not_found');
        this.purgeProfile(db, id);
      }
      this.audit(db, m.id, `${kind}.purged`, id);
    }, true);
  }

  // ---------- team (master only) ----------
  masterListAdmins() {
    return this.run((db): AdminMember[] => {
      this.admin(db); // sub-admins may see who the team is; only the master may change it
      return db.users
        .filter((u) => isAdminRole(u.role) && !u.deletedAt)
        .sort((x, y) => (x.role === 'master' ? -1 : y.role === 'master' ? 1 : x.createdAt.localeCompare(y.createdAt)))
        .map((u) => ({ id: u.id, role: u.role, phoneMasked: `${u.countryCode} ${maskPhone(u.phone)}`, createdAt: u.createdAt, deactivatedAt: u.deactivatedAt }));
    });
  }

  masterAddSubAdmin(countryCode: string, phone: string) {
    return this.run((db) => {
      const m = this.master(db);
      ({ countryCode, phone } = this.normPhone(countryCode, phone));
      if (db.users.filter((u) => u.role === 'admin' && !u.deletedAt).length >= MAX_SUB_ADMINS) throw new AppError('rate_limited', `At most ${MAX_SUB_ADMINS} sub-admins`);
      let u = this.findUserByPhone(db, countryCode, phone);
      if (u?.role === 'master') throw new AppError('invalid_state', 'That is the master account');
      if (u?.role === 'admin' && !u.deletedAt) throw new AppError('duplicate');
      if (u?.deletedAt) throw new AppError('invalid_state', 'Restore this account from Trash first');
      if (!u) {
        u = { id: uid('u_'), countryCode, phone, role: 'admin', language: 'en', createdAt: this.iso() };
        db.users.push(u);
      } else u.role = 'admin';
      this.audit(db, m.id, 'admin.added', u.id);
      this.notifyAdmins(db, { event: 'admin_added' });
      return { id: u.id };
    }, true);
  }

  masterRemoveSubAdmin(userId: string) {
    return this.run((db) => {
      const m = this.master(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u || u.role !== 'admin') throw new AppError('not_found');
      u.role = 'user';
      this.audit(db, m.id, 'admin.removed', u.id);
      this.notifyAdmins(db, { event: 'admin_removed' });
    }, true);
  }

  /** Hands the master role to an active sub-admin. Requires a fresh OTP on the master's own phone. */
  masterTransfer(toUserId: string, otp: string) {
    return this.run((db) => {
      const m = this.master(db);
      const target = db.users.find((u) => u.id === toUserId);
      if (!target || target.role !== 'admin' || target.deletedAt || target.deactivatedAt) throw new AppError('invalid_state', 'Pick an active sub-admin');
      this.consumeOtp(db, m.countryCode, m.phone, otp);
      m.role = 'admin';
      target.role = 'master';
      db.security = { recoveryCodes: [], salt: recoveryCode(), failedAttempts: [] }; // new master sets up their own recovery
      this.audit(db, m.id, 'master.transferred', target.id);
      this.notifyAdmins(db, { event: 'master_transferred' });
    }, true);
  }

  // ---------- master recovery ----------
  masterSecurityStatus() {
    return this.run((db): SecurityStatus => {
      this.admin(db);
      const s = db.security;
      return {
        codesRemaining: s.recoveryCodes.filter((c) => !c.usedAt).length,
        codesGeneratedAt: s.codesGeneratedAt,
        backupPhoneMasked: s.backupPhone ? `${s.backupPhone.countryCode} ${maskPhone(s.backupPhone.phone)}` : undefined,
        pendingRecovery: s.pendingRecovery
          ? { phoneMasked: `${s.pendingRecovery.countryCode} ${maskPhone(s.pendingRecovery.phone)}`, startedAt: s.pendingRecovery.startedAt, completesAt: s.pendingRecovery.completesAt }
          : undefined,
      };
    });
  }

  /** Returns the plaintext codes ONCE; only salted hashes are stored. Old codes stop working. */
  masterGenerateRecoveryCodes(otp: string) {
    return this.run((db) => {
      const m = this.master(db);
      this.consumeOtp(db, m.countryCode, m.phone, otp);
      const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
      const salt = recoveryCode();
      db.security = { ...db.security, salt, codesGeneratedAt: this.iso(), recoveryCodes: codes.map((c) => ({ hash: sha256Hex(salt + normaliseCode(c)) })) };
      this.audit(db, m.id, 'master.recovery_codes_generated');
      return codes;
    }, true);
  }

  /** Verifies possession of the backup phone with an OTP sent to it. */
  masterSetBackupPhone(countryCode: string, phone: string, otp: string) {
    return this.run((db) => {
      const m = this.master(db);
      ({ countryCode, phone } = this.normPhone(countryCode, phone));
      if (countryCode === m.countryCode && phone === m.phone) throw new AppError('invalid_state', 'Use a different number from your login phone');
      const owner = this.findUserByPhone(db, countryCode, phone);
      if (owner && isAdminRole(owner.role)) throw new AppError('invalid_state', 'That number belongs to another admin');
      this.consumeOtp(db, countryCode, phone, otp);
      db.security.backupPhone = { countryCode, phone, verifiedAt: this.iso() };
      this.audit(db, m.id, 'master.backup_phone_set');
    }, true);
  }

  masterCancelRecovery() {
    return this.run((db) => {
      const m = this.master(db);
      if (!db.security.pendingRecovery) throw new AppError('not_found');
      db.security.pendingRecovery = undefined;
      this.audit(db, m.id, 'master.recovery_cancelled');
      this.notifyAdmins(db, { event: 'recovery_cancelled' });
    }, true);
  }

  /**
   * Public (logged-out) recovery. Needs BOTH a valid unused recovery code AND an OTP proving the
   * new phone. Backup phone → immediate. Any other phone → 72 h time-lock the current master can cancel.
   */
  recoverMaster(countryCode: string, phone: string, otp: string, code: string) {
    return this.run((db): { status: 'completed' | 'pending'; completesAt?: string } => {
      const sec = db.security;
      const now = this.now().getTime();
      sec.failedAttempts = sec.failedAttempts.filter((t) => now - new Date(t).getTime() < 3600_000);
      if (sec.failedAttempts.length >= MAX_RECOVERY_FAILURES_PER_HOUR) throw new AppError('rate_limited');
      // One recovery at a time: a second attempt can't hijack or reset an in-flight one.
      if (sec.pendingRecovery) throw new AppError('invalid_state', 'A recovery is already in progress');
      ({ countryCode, phone } = this.normPhone(countryCode, phone));
      this.consumeOtp(db, countryCode, phone, otp);
      const hash = sha256Hex(sec.salt + normaliseCode(code));
      const match = sec.recoveryCodes.find((c) => c.hash === hash && !c.usedAt);
      if (!match) {
        sec.failedAttempts.push(this.iso());
        this.audit(db, 'anonymous', 'master.recovery_failed', `${countryCode}${maskPhone(phone)}`);
        throw new AppError('invalid_recovery_code');
      }
      const master = db.users.find((u) => u.role === 'master');
      if (master && master.countryCode === countryCode && master.phone === phone) throw new AppError('invalid_state', 'This is already the master phone — just log in');
      match.usedAt = this.iso();
      const bp = sec.backupPhone;
      if (bp && bp.countryCode === countryCode && bp.phone === phone) {
        this.completeRecovery(db, countryCode, phone, 'backup_phone');
        return { status: 'completed' };
      }
      const completesAt = new Date(now + RECOVERY_DELAY_MS).toISOString();
      sec.pendingRecovery = { countryCode, phone, startedAt: this.iso(), completesAt };
      this.audit(db, 'anonymous', 'master.recovery_started', `${countryCode}${maskPhone(phone)}`, { completesAt });
      this.notifyAdmins(db, { event: 'recovery_started' });
      return { status: 'pending', completesAt };
    }, true);
  }

  // ---------- admin: search & member console ----------
  private memberRow(db: DemoDb, u: User): MemberRow {
    const p = db.profiles.find((x) => x.userId === u.id && !x.deletedAt) ?? db.profiles.find((x) => x.userId === u.id);
    return {
      userId: u.id, profileId: p?.id, code: p?.code, name: p?.biodata.basic.fullName, phoneMasked: `${u.countryCode} ${maskPhone(u.phone)}`,
      role: u.role, profileStatus: p?.status, city: p?.biodata.location.city, deactivatedAt: u.deactivatedAt, deactivatedBy: u.deactivatedBy, deletedAt: u.deletedAt,
    };
  }

  adminSearch(query: string) {
    return this.run((db): MemberRow[] => {
      const a = this.admin(db);
      const q = String(query ?? '').trim().toLowerCase();
      if (q.length < 2 || q.length > 100) return [];
      const digits = q.replace(/\D/g, '');
      const codeQuery = /^hr-?\d+$/.test(q) ? `hr-${digits}` : null;
      const byPhone = !codeQuery && /^[+\d\s-]+$/.test(q) && digits.length >= 4;
      // Searching by phone is a sensitive lookup: record it (masked) in the audit log.
      if (byPhone) this.audit(db, a.id, 'admin.search_phone', undefined, { lastDigits: digits.slice(-4) });
      const hits = db.users.filter((u) => {
        const p = db.profiles.find((x) => x.userId === u.id);
        if (codeQuery) return !!p && p.code.toLowerCase().startsWith(codeQuery);
        if (byPhone) return `${u.countryCode}${u.phone}`.replace(/\D/g, '').includes(digits);
        const hay = [p?.biodata.basic.fullName, p?.biodata.location.city, p?.biodata.location.locality, p?.code].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
      return hits.slice(0, 50).map((u) => this.memberRow(db, u));
    }, true);
  }

  adminGetMember(userId: string) {
    return this.run((db): MemberDetail => {
      this.admin(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new AppError('not_found');
      const member = this.memberRow(db, u);
      const p = db.profiles.find((x) => x.id === member.profileId);
      const name = (id: string) => db.profiles.find((x) => x.id === id)?.biodata.basic.fullName ?? '—';
      const { phone: _phone, ...rest } = u;
      return {
        member,
        user: { ...rest, phoneMasked: member.phoneMasked },
        profile: p ? clone(p) : undefined,
        requests: db.requests
          .filter((r) => r.fromUserId === u.id || r.toUserId === u.id)
          .map((r) => ({ ...r, fromName: name(r.fromProfileId), toName: name(r.toProfileId), fromCode: this.codeOf(db, r.fromProfileId), toCode: this.codeOf(db, r.toProfileId) })),
        reportsAbout: p ? db.reports.filter((r) => r.profileId === p.id).map((r) => ({ ...r })) : [],
        reportsBy: db.reports.filter((r) => r.reporterUserId === u.id).map((r) => ({ ...r })),
        orders: db.orders.filter((o) => o.userId === u.id).map((o) => ({ ...o })),
      };
    });
  }
}
