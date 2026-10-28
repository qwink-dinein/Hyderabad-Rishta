import { buildSeed, DEMO_OTP, SEED_PRICING } from '@/data/seed';
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
  Lang,
  NotificationType,
  Order,
  PricingChange,
  PricingConfig,
  Profile,
  ProfileStatus,
  Report,
  Shortlist,
  User,
  ViewEvent,
} from '@/domain/types';
import { firstInvalidStep, otpSchema, phoneSchema, requestMessageSchema } from '@/domain/validation';
import { AppError, type AdminStats, type Backend, type NotificationView, type Page, type RecipientRow, type RequestView } from '../backend';
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
}

const SCHEMA_VERSION = 3;
const STORAGE_KEY = 'hr.demo.db';
export const OTP_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 30 * 1000;
export const MAX_RESENDS = 3;
export const MAX_OTP_ATTEMPTS = 5;
const MAX_REQUESTS_PER_DAY = 20;
const VIEW_DEDUPE_MS = 30 * 60 * 1000;

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
    if (!u) throw new AppError('unauthenticated');
    if (u.deactivatedAt) throw new AppError('forbidden', 'Account deactivated');
    return u;
  }

  private admin(db: DemoDb): User {
    const u = this.me(db);
    if (u.role !== 'admin') throw new AppError('forbidden');
    return u;
  }

  private audit(db: DemoDb, actorId: string, action: string, target?: string, meta?: Record<string, unknown>) {
    db.audit.unshift({ id: uid('au_'), actorId, action, target, meta, at: this.iso() });
  }

  private notify(db: DemoDb, userId: string, type: NotificationType, params: Record<string, string> = {}, deepLink?: string, announcementId?: string) {
    db.notifications.unshift({ id: uid('n_'), userId, type, params, deepLink, announcementId, createdAt: this.iso() });
  }

  private myProfile(db: DemoDb, userId: string) {
    return db.profiles.find((p) => p.userId === userId);
  }

  private visibleProfile(db: DemoDb, viewer: User, profileId: string): Profile {
    const p = db.profiles.find((x) => x.id === profileId);
    if (!p) throw new AppError('not_found');
    const owner = db.users.find((u) => u.id === p.userId);
    if (p.userId === viewer.id) return p;
    if (viewer.role === 'admin') return p;
    if (p.status !== 'published' || owner?.deactivatedAt) throw new AppError('not_found');
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
      if (user.deactivatedAt && user.role !== 'admin') {
        // Logging back in reactivates a self-deactivated account.
        user.deactivatedAt = undefined;
      }
      db.sessionUserId = user.id;
      isNew = isNew || !this.myProfile(db, user.id);
      return { user: { ...user }, isNew };
    }, true);
  }

  getSession() {
    return this.run((db) => {
      const u = db.users.find((x) => x.id === db.sessionUserId);
      return u && !u.deactivatedAt ? { ...u } : null;
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
      u.deactivatedAt = this.iso();
      const p = this.myProfile(db, u.id);
      if (p && p.status === 'published') p.status = 'paused';
      db.sessionUserId = undefined;
    }, true);
  }

  deleteAccount() {
    return this.run((db) => {
      const u = this.me(db);
      const p = this.myProfile(db, u.id);
      db.users = db.users.filter((x) => x.id !== u.id);
      if (p) {
        db.profiles = db.profiles.filter((x) => x.id !== p.id);
        db.shortlists = db.shortlists.filter((s) => s.profileId !== p.id);
        db.views = db.views.filter((v) => v.profileId !== p.id);
      }
      db.shortlists = db.shortlists.filter((s) => s.userId !== u.id);
      db.requests = db.requests.filter((r) => r.fromUserId !== u.id && r.toUserId !== u.id);
      db.consents = db.consents.filter((c) => c.grantorUserId !== u.id && c.granteeUserId !== u.id);
      db.notifications = db.notifications.filter((n) => n.userId !== u.id);
      db.deliveries = db.deliveries.filter((d) => d.userId !== u.id);
      db.blocks = db.blocks.filter((b) => b.userId !== u.id);
      db.views = db.views.filter((v) => v.viewerUserId !== u.id);
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
        // Edits to a live profile go back for review when approval is required.
        if (p.status === 'published' && db.pricing.requireApproval) {
          p.status = 'pending';
          p.adminNote = undefined;
        }
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
        if (p.userId === u.id || p.status !== 'published') return false;
        const owner = db.users.find((x) => x.id === p.userId);
        if (!owner || owner.deactivatedAt) return false;
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
      if (p.userId !== u.id && u.role !== 'admin') {
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
        .filter((p): p is Profile => !!p && p.status === 'published' && !this.isBlockedBetween(db, u.id, p))
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
    if (!otherProfile) return null;
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
      for (const p of db.profiles) profiles[p.status]++;
      const paid = db.orders.filter((o) => o.status === 'paid');
      return {
        users: db.users.filter((u) => u.role === 'user').length,
        activeUsers: db.users.filter((u) => u.role === 'user' && !u.deactivatedAt).length,
        profiles,
        brides: db.profiles.filter((p) => profileTypeOf(p) === 'bride').length,
        grooms: db.profiles.filter((p) => profileTypeOf(p) === 'groom').length,
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
        .filter((p) => !status || p.status === status)
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
      return db.users.map((u) => ({ ...u, phone: maskPhone(u.phone), profileStatus: this.myProfile(db, u.id)?.status }));
    });
  }

  adminSetUserDeactivated(userId: string, deactivated: boolean) {
    return this.run((db) => {
      const a = this.admin(db);
      const u = db.users.find((x) => x.id === userId);
      if (!u) throw new AppError('not_found');
      if (u.role === 'admin') throw new AppError('forbidden');
      u.deactivatedAt = deactivated ? this.iso() : undefined;
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
}
