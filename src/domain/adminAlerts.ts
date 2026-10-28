import type { AppNotification } from './types';

type AlertIcon = 'flag' | 'chart' | 'user' | 'ban' | 'shield' | 'bell';

export type AdminAlertKind = 'report' | 'payment' | 'pending_profile' | 'account_deleted' | 'security';

const SECURITY: Record<string, string> = {
  master_recovered: 'Master role was recovered to a new phone',
  admin_added: 'A sub-admin was added',
  admin_removed: 'A sub-admin was removed',
  master_transferred: 'Master role was transferred',
  recovery_cancelled: 'A master recovery was cancelled',
  recovery_started: 'Someone started a master recovery — review now',
};

/** English copy for the admin bell (admin console is English-only). Never includes phone numbers. */
export function adminAlertText(n: Pick<AppNotification, 'params'>): { title: string; icon: AlertIcon; urgent: boolean } {
  const p = n.params;
  switch (p.kind as AdminAlertKind) {
    case 'report':
      return { title: `Profile ${p.code} was reported${p.reason ? ` (${p.reason.replace(/_/g, ' ')})` : ''}`, icon: 'flag', urgent: true };
    case 'payment':
      return {
        title: p.status === 'failed' ? `Payment failed: ${p.item} · ${p.code}` : `Payment received: ${p.item} ₹${p.amount} · ${p.code}`,
        icon: 'chart',
        urgent: p.status === 'failed',
      };
    case 'pending_profile':
      return { title: `${p.code} is waiting for approval`, icon: 'user', urgent: false };
    case 'account_deleted':
      return { title: `${p.code} deleted their account`, icon: 'ban', urgent: false };
    case 'security':
      return { title: SECURITY[p.event] ?? 'Security change in the admin team', icon: 'shield', urgent: p.event === 'recovery_started' || p.event === 'master_recovered' };
    default:
      return { title: 'Admin alert', icon: 'bell', urgent: false };
  }
}
