import type { SupabaseClient } from '@supabase/supabase-js';
import { pokeEligibility } from '@/domain/connections';
import { randomToken } from '@/domain/crypto';
import { maskPhone } from '@/domain/format';
import { dashboardMetrics } from '@/domain/metrics';
import { normalizePhone } from '@/domain/phone';
import { matchesFilters, sortProfiles, type SearchFilters } from '@/domain/search';
import type {
  Biodata,
  ConsentScopes,
  ContactRequest,
  DashboardMetrics,
  Lang,
  Order,
  PhoneOffer,
  Photo,
  PricingConfig,
  Profile,
  PublicProfile,
  PushPrefs,
  User,
} from '@/domain/types';
import { AppError, type Backend, type NotificationView, type OtpRequestResult, type Page, type PushSettings, type RequestView, type SendInterestInput } from '../backend';
import type { KV } from '../storage';
import { mapNotification, mapOffer, mapOrder, mapPricing, mapProfile, mapPublicProfile, mapRequest, mapUser, toAppError } from './map';

type Row = Record<string, unknown>;

/** Seconds between OTP sends (Supabase auth.sms.max_frequency) and sends allowed per hour. */
export const OTP_RESEND_SECONDS = 60;
export const OTP_SENDS_PER_HOUR = 5;
const BUCKET = 'profile-photos';
const PHOTO_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/;
const HINT_KEY = 'hr.sb.hint';
const DEVICES_KEY = 'hr.sb.devices';

export interface SupabaseBackendOptions {
  /** Secure storage on this phone (device keys for PIN login, last number). */
  secure: KV;
  now?: () => Date;
  platform?: 'ios' | 'android' | 'web';
}

function uuidV4(): string {
  const h = randomToken(16).split('');
  h[12] = '4';
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/**
 * Production backend: Supabase Auth (WhatsApp OTP via the Send SMS hook, PIN via the pin-login function),
 * Postgres RPCs and RLS for every rule, private Storage for photos. Mirrors DemoBackend's behaviour —
 * the same screens work on either. Methods not yet backed by the server throw a clear AppError.
 */
export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;
  private sb: SupabaseClient;
  private secure: KV;
  private now: () => Date;
  private platform: 'ios' | 'android' | 'web';
  private sends = new Map<string, number[]>();
  private photoCache = new Map<string, { url: string; exp: number }>();
  private urlToPath = new Map<string, string>();
  private pricing?: { cfg: PricingConfig; at: number };
  private searchCache?: { key: string; at: number; list: PublicProfile[] };

  constructor(client: SupabaseClient, opts: SupabaseBackendOptions) {
    this.sb = client;
    this.secure = opts.secure;
    this.now = opts.now ?? (() => new Date());
    this.platform = opts.platform ?? 'android';
  }

  // ---------- plumbing ----------
  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.sb.rpc(fn, args);
    if (error) throw toAppError(error);
    return data as T;
  }
  private async uid(): Promise<string> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new AppError('unauthenticated');
    return id;
  }
  private async readJson<T>(key: string, fallback: T): Promise<T> {
    try {
      const raw = await this.secure.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }
  private async functionCall<T>(name: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; status: number; data: Row }> {
    const { data, error } = await this.sb.functions.invoke(name, { body: body as Record<string, unknown> });
    if (!error) return { ok: true, data: data as T };
    const ctx = (error as { context?: Response }).context;
    let payload: Row = {};
    try {
      payload = ctx ? ((await ctx.json()) as Row) : {};
    } catch {
      payload = {};
    }
    return { ok: false, status: ctx?.status ?? 503, data: payload };
  }

  /** Replaces photo storage paths with short-lived signed links (batched, cached ~50 minutes). */
  private async signPhotos<T extends { photos?: Photo[] }>(items: T[]): Promise<T[]> {
    const nowMs = this.now().getTime();
    const need = new Set<string>();
    for (const it of items) for (const ph of it.photos ?? []) if (PHOTO_PATH.test(ph.uri) && !((this.photoCache.get(ph.uri)?.exp ?? 0) > nowMs)) need.add(ph.uri);
    if (need.size) {
      const r = await this.functionCall<{ urls: Record<string, string>; expiresIn: number }>('photo-urls', { paths: [...need] });
      if (r.ok) {
        const exp = nowMs + Math.max(60, (r.data.expiresIn ?? 3600) - 600) * 1000;
        for (const [path, url] of Object.entries(r.data.urls ?? {})) {
          this.photoCache.set(path, { url, exp });
          this.urlToPath.set(url, path);
        }
      }
    }
    return items.map((it) => (it.photos?.length ? { ...it, photos: it.photos.map((ph) => (this.photoCache.has(ph.uri) ? { ...ph, uri: this.photoCache.get(ph.uri)!.url } : ph)) } : it));
  }
  private async publicProfiles(rows: Row[]): Promise<PublicProfile[]> {
    return this.signPhotos(rows.map(mapPublicProfile));
  }
  private async ownProfile(row: Row): Promise<Profile> {
    const p = mapProfile(row);
    const [signed] = await this.signPhotos([{ photos: p.biodata?.photos ?? [] }]);
    return { ...p, biodata: { ...p.biodata, photos: signed.photos ?? [] } };
  }

  /** New photos (data: / file: URIs) go to <uid>/<id>.jpg; signed links map back to their path. */
  private async storePhotos(userId: string, photos: Photo[]): Promise<Photo[]> {
    const out: Photo[] = [];
    for (const ph of photos) {
      const known = this.urlToPath.get(ph.uri);
      if (known) out.push({ ...ph, uri: known });
      else if (PHOTO_PATH.test(ph.uri)) out.push(ph);
      else {
        const id = (ph.id || uuidV4()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || uuidV4().replace(/-/g, '');
        const path = `${userId}/${id}.jpg`;
        const bytes = await (await fetch(ph.uri)).arrayBuffer();
        const { error } = await this.sb.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (error) throw new AppError('validation', 'v.photoUpload');
        out.push({ id, uri: path });
      }
    }
    return out;
  }

  // ---------- auth ----------
  private e164(countryCode: string, phone: string) {
    const n = normalizePhone(countryCode, phone);
    if (!n) throw new AppError('validation', 'v.phone');
    return { ...n, e164: `${n.countryCode}${n.phone}` };
  }

  async requestOtp(countryCode: string, phone: string): Promise<OtpRequestResult> {
    const { e164 } = this.e164(countryCode, phone);
    const nowMs = this.now().getTime();
    const recent = (this.sends.get(e164) ?? []).filter((t) => nowMs - t < 3600_000);
    const last = recent[recent.length - 1] ?? 0;
    if (nowMs - last < OTP_RESEND_SECONDS * 1000) {
      throw new AppError('rate_limited', undefined, { retryAt: new Date(last + OTP_RESEND_SECONDS * 1000).toISOString() });
    }
    const { error } = await this.sb.auth.signInWithOtp({ phone: e164, options: { channel: 'sms', shouldCreateUser: true } });
    if (error) {
      const e = toAppError(error);
      if (e.code === 'rate_limited') throw new AppError('rate_limited', error.message, { retryAt: new Date(nowMs + OTP_RESEND_SECONDS * 1000).toISOString() });
      throw e;
    }
    recent.push(nowMs);
    this.sends.set(e164, recent);
    return { demo: false, resendAvailableAt: new Date(nowMs + OTP_RESEND_SECONDS * 1000).toISOString(), resendsLeft: Math.max(0, OTP_SENDS_PER_HOUR - recent.length) };
  }

  /** Finishes any sign-in: account row, invites, reactivation, claim, then the user. */
  private async afterSignIn(countryCode: string): Promise<{ user: User; isNew: boolean }> {
    try {
      await this.rpc('ensure_account', { p_country_code: countryCode });
      await this.rpc('reactivate_self');
    } catch (e) {
      await this.sb.auth.signOut({ scope: 'local' });
      throw e;
    }
    await this.rpc('claim_account').catch(() => false);
    const user = await this.currentUser();
    if (!user) throw new AppError('unauthenticated');
    const profile = await this.getMyProfile();
    return { user, isNew: !profile };
  }

  private async currentUser(): Promise<User | null> {
    const { data } = await this.sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) return null;
    const { data: row, error } = await this.sb.from('app_users').select('*').eq('id', id).maybeSingle();
    if (error || !row) return null;
    if (row.deleted_at || row.deactivated_at) return null;
    const pin = await this.rpc<{ has_pin?: boolean }>('get_pin_status').catch(() => ({ has_pin: false }));
    return mapUser(row, Boolean(pin?.has_pin));
  }

  async verifyOtp(countryCode: string, phone: string, code: string) {
    const n = this.e164(countryCode, phone);
    if (!/^\d{6}$/.test(String(code))) throw new AppError('invalid_otp');
    const { data, error } = await this.sb.auth.verifyOtp({ phone: n.e164, token: String(code), type: 'sms' });
    if (error || !data.session) {
      const e = toAppError(error);
      throw e.code === 'rate_limited' ? e : new AppError(/expired/i.test(error?.message ?? '') ? 'otp_expired' : 'invalid_otp', error?.message);
    }
    const { user, isNew } = await this.afterSignIn(n.countryCode);
    // OTP proved the number on THIS phone: trust it for PIN login.
    const devices = await this.readJson<Record<string, { id: string; secret: string }>>(DEVICES_KEY, {});
    const dev = devices[n.e164] ?? { id: uuidV4(), secret: randomToken(32) };
    await this.rpc('trust_device', { p_device_id: dev.id, p_secret: dev.secret, p_platform: this.platform });
    devices[n.e164] = dev;
    await this.secure.setItem(DEVICES_KEY, JSON.stringify(devices));
    await this.secure.setItem(HINT_KEY, JSON.stringify({ countryCode: n.countryCode, phone: n.phone }));
    return { user, isNew, needsPin: !user.hasPin };
  }

  async pinLogin(countryCode: string, phone: string, pin: string) {
    const n = this.e164(countryCode, phone);
    if (!/^\d{4}$/.test(String(pin))) throw new AppError('validation', 'pin.mustBe4');
    const devices = await this.readJson<Record<string, { id: string; secret: string }>>(DEVICES_KEY, {});
    const dev = devices[n.e164];
    if (!dev) throw new AppError('device_not_trusted');
    const r = await this.functionCall<{ session: { access_token: string; refresh_token: string } }>('pin-login', {
      countryCode: n.countryCode, phone: n.phone, pin: String(pin), deviceId: dev.id, deviceSecret: dev.secret,
    });
    if (!r.ok) {
      const code = String(r.data.error ?? 'invalid_pin') as AppError['code'];
      throw new AppError(code, code, { attemptsLeft: r.data.attemptsLeft, retryAt: r.data.retryAt, reset: r.data.reset });
    }
    const { error } = await this.sb.auth.setSession(r.data.session);
    if (error) throw toAppError(error);
    const { user } = await this.afterSignIn(n.countryCode);
    await this.secure.setItem(HINT_KEY, JSON.stringify({ countryCode: n.countryCode, phone: n.phone }));
    return { user };
  }

  async setPin(pin: string, currentPin?: string) {
    const r = await this.rpc<{ ok: boolean; error?: string; message?: string; attempts_left?: number; retry_at?: string }>('set_pin', { p_pin: String(pin), p_current: currentPin ?? null });
    if (!r?.ok) throw new AppError((r?.error ?? 'validation') as AppError['code'], r?.message ?? r?.error, { attemptsLeft: r?.attempts_left, retryAt: r?.retry_at });
    const user = await this.currentUser();
    if (!user) throw new AppError('unauthenticated');
    return user;
  }

  async getLoginHint() {
    const hint = await this.readJson<{ countryCode: string; phone: string } | null>(HINT_KEY, null);
    if (!hint) return null;
    const devices = await this.readJson<Record<string, unknown>>(DEVICES_KEY, {});
    return { ...hint, canUsePin: !!devices[`${hint.countryCode}${hint.phone}`] };
  }

  async getSession() {
    return this.currentUser();
  }

  async logout() {
    await this.sb.auth.signOut({ scope: 'local' });
    this.photoCache.clear();
    this.urlToPath.clear();
    this.searchCache = undefined;
  }

  async setLanguage(lang: Lang) {
    const id = await this.uid().catch(() => null);
    if (!id) return;
    const { error } = await this.sb.from('app_users').update({ language: lang }).eq('id', id);
    if (error) throw toAppError(error);
  }

  async deactivateAccount() {
    await this.rpc('deactivate_account');
    await this.logout();
  }

  async deleteAccount() {
    const r = await this.functionCall<{ ok: boolean }>('delete-account', {});
    if (!r.ok) throw new AppError((String(r.data.error ?? 'invalid_state')) as AppError['code']);
    const hint = await this.readJson<{ countryCode: string; phone: string } | null>(HINT_KEY, null);
    if (hint) {
      const devices = await this.readJson<Record<string, unknown>>(DEVICES_KEY, {});
      delete devices[`${hint.countryCode}${hint.phone}`];
      await this.secure.setItem(DEVICES_KEY, JSON.stringify(devices));
    }
    await this.secure.removeItem(HINT_KEY);
    await this.logout();
  }

  // ---------- own profile ----------
  async getMyProfile() {
    const id = await this.uid();
    const { data, error } = await this.sb.from('profiles').select('*').eq('user_id', id).is('deleted_at', null).maybeSingle();
    if (error) throw toAppError(error);
    return data ? this.ownProfile(data) : null;
  }

  async saveDraft(biodata: Biodata, lastStep: number) {
    const id = await this.uid();
    const photos = await this.storePhotos(id, biodata.photos ?? []);
    const clean: Biodata = { ...biodata, photos };
    const { data: existing, error: e1 } = await this.sb.from('profiles').select('id').eq('user_id', id).is('deleted_at', null).maybeSingle();
    if (e1) throw toAppError(e1);
    const q = existing
      ? this.sb.from('profiles').update({ biodata: clean, last_step: lastStep, updated_at: this.now().toISOString() }).eq('id', existing.id).select('*').single()
      : this.sb.from('profiles').insert({ user_id: id, biodata: clean, last_step: lastStep }).select('*').single();
    const { data, error } = await q;
    if (error) throw toAppError(error);
    return this.ownProfile(data);
  }

  async submitForPublication() {
    const r = await this.rpc<{ profile: Row; order?: Row }>('submit_for_publication');
    return { profile: await this.ownProfile(r.profile), order: r.order ? mapOrder(r.order) : undefined };
  }

  async setPaused(paused: boolean) {
    return this.ownProfile(await this.rpc<Row>('set_paused', { p_paused: paused }));
  }

  async startBoost(planId?: string) {
    const r = await this.rpc<{ profile: Row; order: Row }>('start_boost', { p_plan: planId ?? null });
    return { profile: await this.ownProfile(r.profile), order: mapOrder(r.order) };
  }

  /** Online payment is added with the payment provider (Phase 2b); until then paid options cannot complete. */
  async completePayment(_orderId: string, _outcome: 'success' | 'failure'): Promise<{ order: Order; profile: Profile }> {
    throw new AppError('fee_disabled', 'Online payment is not available yet');
  }

  async getMyOrders() {
    const id = await this.uid();
    const { data, error } = await this.sb.from('orders').select('*').eq('user_id', id).order('created_at', { ascending: false });
    if (error) throw toAppError(error);
    return (data ?? []).map(mapOrder);
  }

  async getDashboard(): Promise<DashboardMetrics> {
    const profile = (await this.getMyProfile()) ?? undefined;
    if (!profile) return dashboardMetrics(undefined, { views: [], shortlists: [], requests: [] }, this.now());
    const [act, reqs] = await Promise.all([
      this.rpc<{ views: { v: number; at: string }[]; shortlistedBy: number; impressions: { v: number; day: string }[] }>('get_my_activity'),
      this.sb.from('contact_requests').select('*').eq('to_profile_id', profile.id),
    ]);
    if (reqs.error) throw toAppError(reqs.error);
    return dashboardMetrics(
      profile,
      {
        // Anonymous viewer numbers stand in for identities (the server never reveals who viewed).
        views: act.views.map((x) => ({ profileId: profile.id, viewerUserId: `v${x.v}`, at: x.at })),
        shortlists: Array.from({ length: act.shortlistedBy }, (_, i) => ({ userId: `s${i}`, profileId: profile.id, createdAt: '' })),
        requests: (reqs.data ?? []).map(mapRequest),
        impressions: act.impressions.map((x) => ({ profileId: profile.id, viewerUserId: `v${x.v}`, day: x.day })),
      },
      this.now(),
    );
  }

  // ---------- discovery ----------
  async searchProfiles(filters: SearchFilters, page: number, pageSize = 10): Promise<Page<PublicProfile>> {
    pageSize = Math.max(1, Math.min(50, Math.floor(Number(pageSize) || 10)));
    page = Math.max(0, Math.floor(Number(page) || 0));
    const mine = page === 0 || !this.searchCache ? await this.getMyProfile().catch(() => null) : null;
    const show = filters.show ?? mine?.biodata.basic.lookingFor ?? undefined;
    const key = JSON.stringify({ show });
    const nowMs = this.now().getTime();
    let list = this.searchCache && this.searchCache.key === key && page > 0 && nowMs - this.searchCache.at < 60_000 ? this.searchCache.list : null;
    if (!list) {
      // Coarse filter in SQL (type, visibility, blocks); the app's full filter set runs here, like the demo.
      list = [];
      for (let offset = 0; offset < 1000; offset += 50) {
        const rows = await this.rpc<Row[]>('search_profiles', { p_show: show ?? null, p_limit: 50, p_offset: offset });
        list.push(...rows.map(mapPublicProfile));
        if (rows.length < 50) break;
      }
      this.searchCache = { key, at: nowMs, list };
    }
    const shortlisted = new Set(await this.getShortlistIds());
    const f = { ...filters, show };
    const sorted = sortProfiles(list.filter((p) => matchesFilters(p, f, { shortlisted, now: this.now() })), f.sort);
    const start = page * pageSize;
    const items = await this.signPhotos(sorted.slice(start, start + pageSize));
    return { items, total: sorted.length, page, hasMore: start + pageSize < sorted.length };
  }

  async getProfile(profileId: string) {
    const [p] = await this.publicProfiles([await this.rpc<Row>('get_profile', { p_id: profileId })]);
    return p;
  }

  async getShortlistIds() {
    const id = await this.uid();
    const { data, error } = await this.sb.from('shortlists').select('profile_id').eq('user_id', id);
    if (error) throw toAppError(error);
    return (data ?? []).map((r) => String(r.profile_id));
  }

  async getShortlist() {
    return this.publicProfiles(await this.rpc<Row[]>('get_shortlist'));
  }

  async getFeatured(limit = 12) {
    return this.publicProfiles(await this.rpc<Row[]>('get_featured', { p_limit: Math.max(1, Math.min(50, limit)) }));
  }

  async toggleShortlist(profileId: string) {
    const id = await this.uid();
    const { data: had } = await this.sb.from('shortlists').delete().eq('user_id', id).eq('profile_id', profileId).select('profile_id');
    if (had && had.length) return false;
    const { error } = await this.sb.from('shortlists').insert({ user_id: id, profile_id: profileId });
    if (error) throw error.code === '42501' ? new AppError('not_found') : toAppError(error);
    return true;
  }

  // ---------- requests & consent ----------
  private async pricingCfg(): Promise<PricingConfig> {
    if (this.pricing && this.now().getTime() - this.pricing.at < 60_000) return this.pricing.cfg;
    return this.getPricing();
  }

  private async requestViews(rows: Row[]): Promise<RequestView[]> {
    const me = await this.uid();
    const cfg = await this.pricingCfg();
    const all = rows.map((r) => mapRequest(r.request as Row));
    const others = await this.publicProfiles(rows.map((r) => r.other as Row));
    return rows.map((r, i) => {
      const request = all[i];
      return {
        request,
        other: others[i],
        direction: r.direction as RequestView['direction'],
        myConsent: (r.myConsent as ConsentScopes) ?? { photos: false, phone: false, fullBiodata: false },
        myOffer: r.myOffer ? mapOffer(r.myOffer as Row) : undefined,
        theirOffer: r.theirOffer ? mapOffer(r.theirOffer as Row) : undefined,
        poke: pokeEligibility(request, me, all, cfg, r.recipientAllowsReminders !== false, this.now()),
        myPhoneMasked: String(r.myPhoneMasked ?? maskPhone('')),
      };
    });
  }

  async sendRequest(toProfileId: string, input: SendInterestInput): Promise<ContactRequest> {
    const r = await this.rpc<Row>('send_request', {
      p_to: toProfileId, p_message: input.message ?? null, p_offer_phone: !!input.offerPhone, p_consent: !!input.consent, p_idem: input.idempotencyKey ?? null,
    });
    return mapRequest(r);
  }

  async getRequests() {
    return this.requestViews(await this.rpc<Row[]>('get_requests', { p_profile: null }));
  }

  async respondToRequest(requestId: string, decision: 'accepted' | 'declined') {
    return mapRequest(await this.rpc<Row>('respond_request', { p_id: requestId, p_decision: decision }));
  }

  async withdrawRequest(requestId: string) {
    await this.rpc('withdraw_request', { p_id: requestId });
    const { data, error } = await this.sb.from('contact_requests').select('*').eq('id', requestId).single();
    if (error) throw toAppError(error);
    return mapRequest(data);
  }

  async setConsent(requestId: string, scopes: ConsentScopes) {
    await this.rpc('set_consent', { p_request: requestId, p_photos: !!scopes.photos, p_phone: false, p_full: !!scopes.fullBiodata });
  }

  async getRequestStatusWith(profileId: string) {
    const rows = await this.rpc<Row[]>('get_requests', { p_profile: profileId });
    return rows.length ? (await this.requestViews(rows))[0] : null;
  }

  async offerPhone(requestId: string, consent: boolean, idempotencyKey: string): Promise<PhoneOffer> {
    return mapOffer(await this.rpc<Row>('offer_phone', { p_request: requestId, p_consent: consent, p_idem: idempotencyKey }));
  }
  async respondToPhoneOffer(offerId: string, decision: 'accepted' | 'declined') {
    return mapOffer(await this.rpc<Row>('respond_phone_offer', { p_offer: offerId, p_decision: decision }));
  }
  async withdrawPhoneOffer(offerId: string) {
    return mapOffer(await this.rpc<Row>('withdraw_phone_offer', { p_offer: offerId }));
  }
  async pokeRequest(requestId: string) {
    await this.rpc('poke_request', { p_id: requestId });
  }
  async setAllowReminders(allow: boolean) {
    await this.rpc('set_allow_reminders', { p_allow: allow });
  }

  // ---------- safety ----------
  async reportProfile(profileId: string, reason: string, details?: string) {
    const id = await this.uid();
    const { error } = await this.sb.from('reports').insert({ reporter_user_id: id, profile_id: profileId, reason, details: details ?? null });
    if (error) throw toAppError(error);
  }
  async blockProfile(profileId: string) {
    const id = await this.uid();
    const { error } = await this.sb.from('blocks').upsert({ user_id: id, blocked_profile_id: profileId }, { onConflict: 'user_id,blocked_profile_id', ignoreDuplicates: true });
    if (error) throw toAppError(error);
    this.searchCache = undefined;
  }
  async unblockProfile(profileId: string) {
    const id = await this.uid();
    const { error } = await this.sb.from('blocks').delete().eq('user_id', id).eq('blocked_profile_id', profileId);
    if (error) throw toAppError(error);
    this.searchCache = undefined;
  }
  async getBlockedIds() {
    const id = await this.uid();
    const { data, error } = await this.sb.from('blocks').select('blocked_profile_id').eq('user_id', id);
    if (error) throw toAppError(error);
    return (data ?? []).map((r) => String(r.blocked_profile_id));
  }
  async getBlockedProfiles() {
    return this.rpc<{ profileId: string; code: string; name: string }[]>('get_blocked_profiles');
  }

  // ---------- notifications & push ----------
  async getNotifications(): Promise<NotificationView[]> {
    return (await this.rpc<Row[]>('get_notifications', { p_limit: 200 })).map(mapNotification);
  }
  async registerPushDevice(token: string, platform: 'ios' | 'android') {
    await this.rpc('register_push_device', { p_token: token, p_platform: platform });
  }
  async unregisterPushDevice(token: string) {
    await this.rpc('unregister_push_device', { p_token: token });
  }
  async getPushSettings(): Promise<PushSettings> {
    return this.rpc<PushSettings>('get_push_settings');
  }
  async setPushPrefs(patch: Partial<PushPrefs>) {
    return this.rpc<PushPrefs>('set_push_prefs', { p_patch: patch });
  }
  async markNotificationRead(id: string) {
    await this.rpc('open_notification', { p_id: id, p_clicked: false });
  }
  async markAllNotificationsRead() {
    const me = await this.uid();
    const { error } = await this.sb.from('notifications').update({ read_at: this.now().toISOString() }).eq('user_id', me).is('read_at', null);
    if (error) throw toAppError(error);
  }
  async recordNotificationClick(id: string) {
    await this.rpc('open_notification', { p_id: id, p_clicked: true });
  }

  // ---------- pricing ----------
  async getPricing() {
    const { data, error } = await this.sb.from('pricing_config').select('*').limit(1).single();
    if (error) throw toAppError(error);
    const cfg = mapPricing(data);
    this.pricing = { cfg, at: this.now().getTime() };
    return cfg;
  }

  // ---------- admin & master: next phase ----------
  private notYet(): never {
    throw new AppError('forbidden', 'Admin console is not connected to the live backend yet');
  }
  adminStats(): never { return this.notYet(); }
  adminListProfiles(): never { return this.notYet(); }
  adminSetProfileStatus(): never { return this.notYet(); }
  adminListUsers(): never { return this.notYet(); }
  adminSetUserDeactivated(): never { return this.notYet(); }
  adminUpdatePricing(): never { return this.notYet(); }
  adminPricingHistory(): never { return this.notYet(); }
  adminListOrders(): never { return this.notYet(); }
  adminListReports(): never { return this.notYet(); }
  adminResolveReport(): never { return this.notYet(); }
  adminListAnnouncements(): never { return this.notYet(); }
  adminSaveAnnouncement(): never { return this.notYet(); }
  adminPublishAnnouncement(): never { return this.notYet(); }
  adminArchiveAnnouncement(): never { return this.notYet(); }
  adminAudiencePreview(): never { return this.notYet(); }
  adminRecipientReport(): never { return this.notYet(); }
  adminAuditLog(): never { return this.notYet(); }
  adminSearch(): never { return this.notYet(); }
  adminGetMember(): never { return this.notYet(); }
  adminCheckPhone(): never { return this.notYet(); }
  adminCreateMember(): never { return this.notYet(); }
  adminSaveMemberBiodata(): never { return this.notYet(); }
  adminGetMemberDraft(): never { return this.notYet(); }
  adminPublishMember(): never { return this.notYet(); }
  adminSetRequireApproval(): never { return this.notYet(); }
  adminApproveAllPending(): never { return this.notYet(); }
  adminDeleteProfile(): never { return this.notYet(); }
  adminRemovePhoto(): never { return this.notYet(); }
  adminDeleteUser(): never { return this.notYet(); }
  adminListRequests(): never { return this.notYet(); }
  adminDeleteRequest(): never { return this.notYet(); }
  adminDeleteReport(): never { return this.notYet(); }
  adminDeleteAnnouncement(): never { return this.notYet(); }
  adminCancelOrder(): never { return this.notYet(); }
  adminListTrash(): never { return this.notYet(); }
  masterRestore(): never { return this.notYet(); }
  masterPurge(): never { return this.notYet(); }
  masterListAdmins(): never { return this.notYet(); }
  masterAddSubAdmin(): never { return this.notYet(); }
  masterRemoveSubAdmin(): never { return this.notYet(); }
  masterTransfer(): never { return this.notYet(); }
  masterSecurityStatus(): never { return this.notYet(); }
  masterGenerateRecoveryCodes(): never { return this.notYet(); }
  masterSetBackupPhone(): never { return this.notYet(); }
  masterCancelRecovery(): never { return this.notYet(); }
  recoverMaster(): never { return this.notYet(); }
}
