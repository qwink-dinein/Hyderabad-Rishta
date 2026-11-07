import { profileCompletion } from './completion';
import type { Biodata, ProfileType } from './types';

/**
 * Referral-based free Boosts (owner spec 2026-11-02). Pure rules shared by the demo backend and the UI;
 * the live server applies the same rules in supabase/migrations/20261203000000_referral_boost.sql.
 *
 * One invited account = one referral. When its biodata is 100% complete and live (approved when approval is
 * on) — and, if the admin asks for it, checked by the team — the referrer gets one free Boost and (setting
 * `inviteeReward`) the invited family gets one too. No limit on referrals; exactly once per referral.
 */

/** How the Boost screen tells members to get a Boost. Never changes Boosts already bought, earned or running. */
export type BoostMode = 'paid' | 'referral';

export interface ReferralSettings {
  mode: BoostMode;
  /** Off = no new referrals or rewards (codes and earned Boosts stay). */
  enabled: boolean;
  /** Length of each free Boost, days (admin, default 7). */
  rewardDays: number;
  /** The invited family also gets a free Boost (owner request 2026-11-02). */
  inviteeReward: boolean;
  /** The team checks each qualifying referral before the Boosts are given. */
  review: boolean;
  updatedAt?: string;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = { mode: 'referral', enabled: true, rewardDays: 7, inviteeReward: true, review: true };

/** Stored lifecycle of a referral. */
export type ReferralStatus = 'registered' | 'review' | 'rewarded' | 'rejected' | 'revoked';
/** What the referrer sees (owner's labels): Registered · Profile incomplete · Pending approval · Approved – Boost earned · Rejected. */
export type ReferralStage = 'registered' | 'incomplete' | 'pending' | 'rewarded' | 'rejected';
/** Signals that send a referral to the team; never a reason to refuse on their own (families share phones). */
export type ReferralFlag = 'same_device' | 'many_recent' | 'reported';

export interface Referral {
  id: string;
  referrerUserId?: string;
  referredUserId?: string;
  code: string;
  status: ReferralStatus;
  flags: ReferralFlag[];
  createdAt: string;
  qualifiedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
}

export interface ReferralReward {
  id: string;
  referralId?: string;
  userId: string;
  role: 'referrer' | 'invitee';
  days: number;
  status: 'available' | 'used' | 'revoked';
  createdAt: string;
  usedAt?: string;
  /** End of the Boost this reward started (set when used). */
  boostUntil?: string;
  profileId?: string;
  revokedAt?: string;
  revokedBy?: string;
  reason?: string;
}

/** The member's Refer & Earn view. Invited families appear only as an initial and a stage. */
export interface MyReferral {
  code: string;
  mode: BoostMode;
  enabled: boolean;
  rewardDays: number;
  inviteeReward: boolean;
  /** This account joined with someone's code. */
  invited: boolean;
  stats: { referred: number; approved: number; earned: number; available: number; used: number };
  referrals: { id: string; initial: string; side?: ProfileType; joinedAt: string; stage: ReferralStage }[];
  rewards: { id: string; role: 'referrer' | 'invitee'; days: number; status: ReferralReward['status']; createdAt: string; usedAt?: string; boostUntil?: string }[];
}

export interface AdminReferralRow {
  id: string;
  code: string;
  status: ReferralStatus;
  flags: ReferralFlag[];
  createdAt: string;
  qualifiedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
  referrer: { userId?: string; name?: string; profileCode?: string };
  referred: { userId?: string; name?: string; profileCode?: string; profileStatus?: string; full: boolean };
  rewards: { id: string; role: 'referrer' | 'invitee'; status: ReferralReward['status']; days: number; reason?: string }[];
  history: { action: string; at: string; meta?: Record<string, unknown> }[];
}

export type AdminReferralFilter = 'review' | 'flagged' | 'approved' | 'progress' | 'rejected';

export interface AdminReferralOverview {
  settings: ReferralSettings;
  visits: number;
  referred: number;
  inProgress: number;
  toCheck: number;
  flagged: number;
  approved: number;
  rejected: number;
  rewardsIssued: number;
  rewardsUsed: number;
  rewardsRevoked: number;
  paidBoosts: number;
  freeReferralBoosts: number;
}

// ---------- codes ----------
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0/O, 1/I/L: easy to read out on the phone
export const REFERRAL_CODE_RE = /^HR[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,6}$/;

/** Upper-cases and trims what someone typed; null if it can't be a code. */
export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase().replace(/[\s-]/g, '');
  return REFERRAL_CODE_RE.test(c) ? c : null;
}

/** A new unused code (HR + 4 characters; longer only if 4 keeps colliding). */
export function newReferralCode(taken: (code: string) => boolean, random: () => number = Math.random): string {
  let n = 4;
  for (let tries = 0; ; tries++) {
    let c = 'HR';
    for (let i = 0; i < n; i++) c += ALPHABET[Math.floor(random() * ALPHABET.length)];
    if (!taken(c)) return c;
    if (tries > 20) n = Math.min(n + 1, 6);
  }
}

/** The code in a link like …/r/HR8K29 or …?ref=HR8K29 (null if none). */
export function referralCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /[?&]ref=([^&#]+)/i.exec(url) ?? /\/r\/([A-Za-z0-9]+)/.exec(url);
  return m ? normalizeReferralCode(decodeURIComponent(m[1])) : null;
}

/** Shareable link, when the website address is known (EXPO_PUBLIC_SITE_URL); otherwise the code alone is shared. */
export function referralLink(code: string, siteUrl: string | undefined): string | undefined {
  const base = (siteUrl ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^\s/]+/.test(base) ? `${base}/r/${code}` : undefined;
}

// ---------- rules ----------
/** 100% = every item of the completion bar (the server re-checks this itself). */
export const isProfileFull = (b: Biodata | undefined | null) => profileCompletion(b).percent === 100;

/** Referrer-facing stage for one referral. */
export function referralStage(status: ReferralStatus, profile: { biodata: Biodata } | undefined): ReferralStage {
  if (status === 'rewarded') return 'rewarded';
  if (status === 'rejected' || status === 'revoked') return 'rejected';
  if (status === 'review') return 'pending';
  if (!profile) return 'registered';
  return isProfileFull(profile.biodata) ? 'pending' : 'incomplete';
}

/** Days a new account may still attach a code (it is locked once the window passes or the biodata goes live). */
export const REFERRAL_CLAIM_WINDOW_MS = 3 * 86400000;
/** Five or more qualified referrals for one referrer within 7 days → the team takes a look. */
export const REFERRAL_VELOCITY = { count: 5, windowMs: 7 * 86400000 };

/** First letter of a name for the referrer's list (never the name itself). */
export const referralInitial = (fullName: string | undefined) => (fullName ?? '').trim().charAt(0).toUpperCase();
