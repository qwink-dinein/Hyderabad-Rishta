import { buildSeed, DEMO_OTP, SEED_PRICING } from '@/data/seed';
import { normaliseCode, recoveryCode, sha256Hex } from '@/domain/crypto';
import { maskPhone, uid } from '@/domain/format';
import { announcementStats, audienceFor, dashboardMetrics, isAnnouncementLive } from '@/domain/metrics';
import { resolvePricing, validatePricing } from '@/domain/pricing';
import { mergeScopes, NO_CONSENT, profileTypeOf, projectProfile } from '@/domain/privacy';
import { matchesFilters, sortProfiles, type SearchFilters } from '@/domain/search';
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
  Lang,
  MasterSecurity,
  NotificationType,
  Order,
  PricingChange,
  PricingConfig,
  Profile,
  ProfileStatus,
  Report,
  SecurityStatus,
  Shortlist,
  User,
  ViewEvent,
} from '@/domain/types';
import { isAdminRole } from '@/domain/types';
import { firstInvalidStep, otpSchema, phoneSchema, requestMessageSchema } from '@/domain/validation';
import { AppError, type AdminRequestRow, type AdminStats, type Backend, type NotificationView, type Page, type RecipientRow, type RequestView, type TrashItem } from '../backend';
import type { KV } from '../storage';

/** JSON deep clone — responses never share references with the "server" state. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface OtpState {
  key: string;
  issuedAt: number;
  attempts: number;
  resends: number[];
}

/** Everything the demo "server" knows. Persisted as one JSON document. */
export interface DemoDb {
  schemaVersion: number;
  sessionUserId?: string;
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
}

const SCHEMA_VERSION = 5;
const STORAGE_KEY = 'hr.demo.db';
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
  };
}

export interface DemoOptions {
  storage: KV;
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
  private latency: number;
  private now: () => Date;

  constructor(opts: DemoOptions) {
    this.storage = opts.storage;
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
        this.db = db ?? freshDb(this.now());
        if (!db) await this.persist();
        return this.db;
      })();
    }
    return this.loading;
  }

  private async persist() {
    if (this.db) await this.storage.setItem(STORAGE_KEY, JSON.stringify(this.db));
  }

  /** Runs a read or write "request" against the db with simulated latency. */
  private async run<T>(fn: (db: DemoDb) => T | Promise<T>, write = false): Promise<T> {
    const db = await this.load();
    if (this.latency) await new Promise((r) => setTimeout(r, this.latency));
    this.processScheduled(db);
    const result = await fn(db);
    if (write) await this.persist();
    return result;
  }

  async reset(): Promise<void> {
    this.db = freshDb(this.now());
    this.loading = Promise.resolve(this.db);
    await this.persist();
  }

  private iso() {
    return this.now().toISOString();
  }

  private me(db: DemoDb): User {
    const u = db.users.find((x) => x.id === db.sessionUserId);
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
    for (const u of db.users) if (isAdminRole(u.role) && !u.deletedAt) this.notify(db, u.id, 'security', params, '/admin');
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

  private findUserByPhone(db: DemoDb, countryCode: string, phone: string) {
    return db.users.find((u) => u.countryCode === countryCode && u.phone === phone);
  }

  private audit(db: DemoDb, actorId: string, action: string, target?: string, meta?: Record<string, unknown>) {
    db.audit.unshift({ id: uid('au_'), actorId, action, target, meta, at: this.iso() });
  }

  private notify(db: DemoDb, userId: string, type: NotificationType, params: Record<string, string> = {}, deepLink?: string, announcementId?: string) {
    db.notifications.unshift({ id: uid('n_'), userId, type, params, deepLink, announcementId, createdAt: this.iso() });
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
    return records.length ? mergeScopes(records.map((c) => c.scopes)) : { ...NO_CONSENT };
  }

  private project(db: DemoDb, viewer: User, p: Profile) {
    const owner = db.users.find((u) => u.id === p.userId);
    return projectProfile(p, this.scopesFor(db, p.userId, viewer.id), owner, this.now());
  }

  private processScheduled(db: DemoDb) {
    const now = this.now().getTime();
    for (const a of db.announcements) {
      if (a.status === 'scheduled' && a.scheduledAt && new Date(a.scheduledAt).getTime() <= now) this.fanOut(db, a);
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
    if (db.sessionUserId === old?.id && old?.id !== target.id) db.sessionUserId = undefined;
    this.audit(db, target.id, 'master.recovered', target.id, { method, previousMaster: old?.id });
    this.notifyAdmins(db, { event: 'master_recovered' });
  }

  private purgeProfile(db: DemoDb, profileId: string) {
    db.profiles = db.profiles.filter((x) => x.id !== profileId);
    db.shortlists = db.shortlists.filter((x) => x.profileId !== profileId);
    db.views = db.views.filter((v) => v.profileId !== profileId);
    db.blocks = db.blocks.filter((b) => b.blockedProfileId !== profileId);
    const reqIds = new Set(db.requests.filter((r) => r.fromProfileId === profileId || r.toProfileId === profileId).map((r) => r.id));
    db.requests = db.requests.filter((r) => !reqIds.has(r.id));
    db.consents = db.consents.filter((c) => !reqIds.has(c.requestId));
    db.reports = db.reports.filter((r) => r.profileId !== profileId);
  }

  /** Permanent erasure of a user and everything that identifies them (orders + audit are kept for legal records). */
  private purgeUser(db: DemoDb, userId: string) {
    for (const p of db.profiles.filter((x) => x.userId === userId)) this.purgeProfile(db, p.id);
    db.users = db.users.filter((x) => x.id !== userId);
    db.shortlists = db.shortlists.filter((s) => s.userId !== userId);
    db.requests = db.requests.filter((r) => r.fromUserId !== userId && r.toUserId !== userId);
    db.consents = db.consents.filter((c) => c.grantorUserId !== userId && c.granteeUserId !== userId);
    db.notifications = db.notifications.filter((n) => n.userId !== userId);
    db.deliveries = db.deliveries.filter((d) => d.userId !== userId);
    db.blocks = db.blocks.filter((b) => b.userId !== userId);
    db.views = db.views.filter((v) => v.viewerUserId !== userId);
    db.reports = db.reports.filter((r) => r.reporterUserId !== userId);
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
      if (!phoneSchema.safeParse(phone).success || !/^\+\d{1,4}$/.test(countryCode)) throw new AppError('validation', 'v.phone');
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
      let user = db.users.find((u) => u.countryCode === countryCode && u.phone === phone);
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
      db.sessionUserId = user.id;
      isNew = isNew || !this.myProfile(db, user.id);
      return { user: { ...user }, isNew };
    }, true);
  }

  getSession() {
    return this.run((db) => {
      const u = db.users.find((x) => x.id === db.sessionUserId);
      return u && !u.deactivatedAt && !u.deletedAt ? { ...u } : null;
    });
  }

  logout() {
    return this.run((db) => {
      db.sessionUserId = undefined;
    }, true);
  }

  setLanguage(lang: Lang) {
    return this.run((db) => {
      const u = db.users.find((x) => x.id === db.sessionUserId);
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
      db.sessionUserId = undefined;
    }, true);
  }

  deleteAccount() {
    return this.run((db) => {
      const u = this.me(db);
      if (u.role === 'master') throw new AppError('forbidden', 'Transfer the master role before deleting this account');
      this.purgeUser(db, u.id); // user-initiated deletion is immediate and permanent (privacy right)
      this.audit(db, u.id, 'account.deleted', u.id);
      db.sessionUserId = undefined;
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
      if (biodata.photos.length > 3) throw new AppError('validation', 'v.maxPhotos');
      let p = this.myProfile(db, u.id);
      if (!p) {
        p = { id: uid('p_'), userId: u.id, biodata, status: 'draft', createdAt: this.iso(), updatedAt: this.iso(), lastStep };
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
    const base = Math.max(this.now().getTime(), p.boostUntil ? new Date(p.boostUntil).getTime() : 0);
    p.boostUntil = new Date(base + (order.terms.boostDays ?? db.pricing.boostDays) * 86400000).toISOString();
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
      return dashboardMetrics(this.myProfile(db, u.id), { views: db.views, shortlists: db.shortlists, requests: db.requests }, this.now());
    });
  }

  // ---------- discovery ----------
  searchProfiles(filters: SearchFilters, page: number, pageSize = 10): Promise<Page<ReturnType<typeof projectProfile>>> {
    return this.run((db) => {
      const u = this.me(db);
      const mine = this.myProfile(db, u.id);
      const shortlisted = new Set(db.shortlists.filter((s) => s.userId === u.id).map((s) => s.profileId));
      const candidates = db.profiles.filter((p) => {
        if (p.userId === u.id || p.status !== 'published' || p.deletedAt) return false;
        const owner = db.users.find((x) => x.id === p.userId);
        if (!owner || owner.deactivatedAt || owner.deletedAt) return false;
        return !this.isBlockedBetween(db, u.id, p);
      });
      // Default to the opposite type of the viewer's own profile.
      const f = { ...filters, show: filters.show ?? mine?.biodata.basic.lookingFor };
      const projected = candidates
        // Discovery NEVER carries contact details, even when consented (PRD §9.3) — only the profile view does.
        .map((p) => ({ ...this.project(db, u, p), contact: undefined }))
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
        if (!recent) db.views.push({ profileId: p.id, viewerUserId: u.id, at: this.iso() });
      }
      return this.project(db, u, p);
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
        .map((p) => ({ ...this.project(db, u, p), contact: undefined }));
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
      return true;
    }, true);
  }

  // ---------- requests ----------
  sendRequest(toProfileId: string, message?: string) {
    return this.run((db) => {
      const u = this.me(db);
      const mine = this.myProfile(db, u.id);
      if (!mine || mine.status !== 'published') throw new AppError('invalid_state', 'Publish your biodata before sending requests');
      const target = this.visibleProfile(db, u, toProfileId);
      if (target.userId === u.id) throw new AppError('invalid_state');
      if (!target.biodata.privacy.acceptContactRequests) throw new AppError('not_accepting');
      const msg = (message ?? '').trim();
      if (!requestMessageSchema.safeParse(msg).success) throw new AppError('validation', 'v.tooLong');
      const existing = db.requests.find(
        (r) => r.status !== 'declined' && r.status !== 'withdrawn' && ((r.fromProfileId === mine.id && r.toProfileId === target.id) || (r.fromProfileId === target.id && r.toProfileId === mine.id)),
      );
      if (existing) throw new AppError('duplicate');
      const dayAgo = this.now().getTime() - 86400000;
      if (db.requests.filter((r) => r.fromUserId === u.id && new Date(r.createdAt).getTime() > dayAgo).length >= MAX_REQUESTS_PER_DAY)
        throw new AppError('rate_limited');
      const req: ContactRequest = {
        id: uid('r_'), fromUserId: u.id, fromProfileId: mine.id, toUserId: target.userId, toProfileId: target.id,
        message: msg || undefined, status: 'pending', createdAt: this.iso(),
      };
      db.requests.unshift(req);
      this.notify(db, target.userId, 'request_received', { name: projectProfile(mine).displayName }, '/requests');
      return { ...req };
    }, true);
  }

  private requestView(db: DemoDb, me: User, r: ContactRequest): RequestView | null {
    const direction = r.toUserId === me.id ? 'received' : 'sent';
    const otherProfile = db.profiles.find((p) => p.id === (direction === 'received' ? r.fromProfileId : r.toProfileId));
    if (!otherProfile || otherProfile.deletedAt) return null;
    return {
      request: { ...r },
      other: this.project(db, me, otherProfile),
      direction,
      myConsent: mergeScopes(db.consents.filter((c) => c.requestId === r.id && c.grantorUserId === me.id).map((c) => c.scopes)),
    };
  }

  getRequests() {
    return this.run((db) => {
      const u = this.me(db);
      return db.requests
        .filter((r) => r.fromUserId === u.id || r.toUserId === u.id)
        .map((r) => this.requestView(db, u, r))
        .filter((x): x is RequestView => !!x);
    });
  }

  getRequestStatusWith(profileId: string) {
    return this.run((db) => {
      const u = this.me(db);
      const mine = this.myProfile(db, u.id);
      if (!mine) return null;
      const r = db.requests.find(
        (x) => x.status !== 'withdrawn' && ((x.fromProfileId === mine.id && x.toProfileId === profileId) || (x.toProfileId === mine.id && x.fromProfileId === profileId)),
      );
      return r ? this.requestView(db, u, r) : null;
    });
  }

  respondToRequest(requestId: string, decision: 'accepted' | 'declined') {
    return this.run((db) => {
      const u = this.me(db);
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || r.toUserId !== u.id) throw new AppError('not_found');
      if (r.status !== 'pending') throw new AppError('invalid_state');
      r.status = decision;
      r.respondedAt = this.iso();
      const mine = this.myProfile(db, u.id);
      // Acceptance alone reveals nothing restricted — consent is a separate step (PRD §12).
      this.notify(db, r.fromUserId, decision === 'accepted' ? 'request_accepted' : 'request_declined', { name: mine ? projectProfile(mine).displayName : '' }, '/requests');
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
      return { ...r };
    }, true);
  }

  setConsent(requestId: string, scopes: ConsentScopes) {
    return this.run((db) => {
      const u = this.me(db);
      const r = db.requests.find((x) => x.id === requestId);
      if (!r || (r.toUserId !== u.id && r.fromUserId !== u.id)) throw new AppError('not_found');
      if (r.status !== 'accepted') throw new AppError('invalid_state');
      const granteeUserId = r.toUserId === u.id ? r.fromUserId : r.toUserId;
      const grantorProfileId = r.toUserId === u.id ? r.toProfileId : r.fromProfileId;
      const existing = db.consents.find((c) => c.requestId === r.id && c.grantorUserId === u.id);
      const before = existing ? { ...existing.scopes } : { ...NO_CONSENT };
      if (existing) {
        existing.scopes = { ...scopes };
        existing.updatedAt = this.iso();
      } else {
        db.consents.push({ id: uid('c_'), requestId: r.id, grantorUserId: u.id, grantorProfileId, granteeUserId, scopes: { ...scopes }, createdAt: this.iso(), updatedAt: this.iso() });
      }
      // Consent records are audit evidence.
      this.audit(db, u.id, 'consent.updated', r.id, { before, after: scopes });
      const newlyShared = (Object.keys(scopes) as (keyof ConsentScopes)[]).filter((k) => scopes[k] && !before[k]);
      if (newlyShared.length) {
        const mine = this.myProfile(db, u.id);
        this.notify(db, granteeUserId, 'contact_shared', { name: mine ? projectProfile(mine).displayName : '', scopes: newlyShared.join(',') }, `/profile/${grantorProfileId}`);
      }
    }, true);
  }

  // ---------- safety ----------
  reportProfile(profileId: string, reason: string, details?: string) {
    return this.run((db) => {
      const u = this.me(db);
      if (!db.profiles.some((p) => p.id === profileId)) throw new AppError('not_found');
      if (db.reports.some((r) => r.reporterUserId === u.id && r.profileId === profileId && r.status === 'open')) throw new AppError('duplicate');
      db.reports.unshift({ id: uid('rp_'), reporterUserId: u.id, profileId, reason, details: details?.slice(0, 1000), status: 'open', createdAt: this.iso() });
    }, true);
  }

  blockProfile(profileId: string) {
    return this.run((db) => {
      const u = this.me(db);
      if (!db.blocks.some((b) => b.userId === u.id && b.blockedProfileId === profileId)) db.blocks.push({ userId: u.id, blockedProfileId: profileId, createdAt: this.iso() });
      db.shortlists = db.shortlists.filter((s) => !(s.userId === u.id && s.profileId === profileId));
      // Pending requests between the two are closed.
      const mine = this.myProfile(db, u.id);
      for (const r of db.requests) {
        if (r.status === 'pending' && mine && ((r.fromProfileId === mine.id && r.toProfileId === profileId) || (r.toProfileId === mine.id && r.fromProfileId === profileId)))
          r.status = r.fromProfileId === mine.id ? 'withdrawn' : 'declined';
      }
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
      return db.users.filter((u) => !u.deletedAt).map((u) => ({ ...u, phone: maskPhone(u.phone), profileStatus: this.myProfile(db, u.id)?.status }));
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
      return db.orders.map((o) => ({ ...o }));
    });
  }

  adminListReports() {
    return this.run((db) => {
      this.admin(db);
      return db.reports.map((r) => ({ ...r, profileName: db.profiles.find((p) => p.id === r.profileId)?.biodata.basic.fullName ?? '—' }));
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
      if (!input.title.en?.trim() || !input.body.en?.trim()) throw new AppError('validation', 'English title and body are required');
      if (input.id) {
        const a = db.announcements.find((x) => x.id === input.id);
        if (!a) throw new AppError('not_found');
        if (a.status !== 'draft' && a.status !== 'scheduled') throw new AppError('invalid_state', 'Only drafts can be edited');
        Object.assign(a, { ...input, status: a.status, updatedAt: this.iso() });
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
        .map((d): RecipientRow => ({ userId: d.userId, maskedPhone: maskPhone(db.users.find((u) => u.id === d.userId)?.phone ?? ''), delivery: { ...d } }));
    }, true);
  }

  adminAuditLog() {
    return this.run((db) => {
      this.admin(db);
      return db.audit.slice(0, 200).map((a) => ({ ...a }));
    });
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
      if (db.sessionUserId === u.id) db.sessionUserId = undefined;
      this.audit(db, a.id, 'user.deleted', u.id, { reason: u.deleteReason });
    }, true);
  }

  adminListRequests() {
    return this.run((db): AdminRequestRow[] => {
      this.admin(db);
      const name = (id: string) => db.profiles.find((p) => p.id === id)?.biodata.basic.fullName ?? '—';
      return db.requests.map((r) => ({ ...r, fromName: name(r.fromProfileId), toName: name(r.toProfileId) }));
    });
  }

  adminDeleteRequest(requestId: string) {
    return this.run((db) => {
      const a = this.admin(db);
      if (!db.requests.some((r) => r.id === requestId)) throw new AppError('not_found');
      db.requests = db.requests.filter((r) => r.id !== requestId);
      db.consents = db.consents.filter((c) => c.requestId !== requestId);
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
        .map((u) => ({ kind: 'user', id: u.id, label: `${u.countryCode} ${maskPhone(u.phone)}`, deletedAt: u.deletedAt!, deletedBy: u.deletedBy, reason: u.deleteReason, purgeAt: new Date(new Date(u.deletedAt!).getTime() + TRASH_RETENTION_MS).toISOString() }));
      const owners = new Set(db.users.filter((u) => u.deletedAt).map((u) => u.id));
      const profiles: TrashItem[] = db.profiles
        .filter((p) => p.deletedAt && !owners.has(p.userId)) // profiles of deleted users restore with the user
        .map((p) => ({ kind: 'profile', id: p.id, label: p.biodata.basic.fullName, deletedAt: p.deletedAt!, deletedBy: p.deletedBy, reason: p.deleteReason, purgeAt: new Date(new Date(p.deletedAt!).getTime() + TRASH_RETENTION_MS).toISOString() }));
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
        if (p && !this.myProfile(db, u.id)) p.deletedAt = p.deletedBy = p.deleteReason = undefined;
      } else {
        const p = db.profiles.find((x) => x.id === id && x.deletedAt);
        if (!p) throw new AppError('not_found');
        if (this.myProfile(db, p.userId)) throw new AppError('invalid_state', 'This member already created a new profile');
        p.deletedAt = p.deletedBy = p.deleteReason = undefined;
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
      if (!phoneSchema.safeParse(phone).success || !/^\+\d{1,4}$/.test(countryCode)) throw new AppError('validation', 'v.phone');
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
}
