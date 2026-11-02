import type { AdminReferralRow } from '@/domain/referral';

/** Admin console wording for referral flags and statuses (the admin console is English-only). */
export const FLAG_TEXT: Record<string, string> = {
  same_device: 'Signed up on the same phone as the referrer',
  many_recent: '5+ referrals approved for this referrer in 7 days',
  reported: 'The new profile has an open report',
};
export const STATUS_TEXT: Record<AdminReferralRow['status'], string> = {
  registered: 'In progress',
  review: 'To check',
  rewarded: 'Boosts given',
  rejected: 'Rejected',
  revoked: 'Revoked',
};

