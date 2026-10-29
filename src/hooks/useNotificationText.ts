import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconName } from '@/components/ui/Icon';
import { formatDate } from '@/domain/format';
import type { Lang } from '@/domain/types';
import type { NotificationView } from '@/services';
import { useSession } from '@/state/session';

/** Shared by the inbox and the in-app arrival banner so both always say the same thing. */
export const NOTIFICATION_ICONS: Record<string, IconName> = {
  request_received: 'mail',
  phone_offer_received: 'phone',
  phone_offer_accepted: 'phone',
  phone_offer_declined: 'phone',
  phone_offer_withdrawn: 'phone',
  poke: 'bell',
  request_expired: 'mail',
  security: 'shield',
  admin_alert: 'flag',
  request_accepted: 'check',
  request_declined: 'close',
  contact_shared: 'phone',
  profile_approved: 'shield',
  profile_rejected: 'flag',
  profile_published: 'sparkle',
  boost_started: 'star',
  payment: 'chart',
  safety: 'shield',
  announcement: 'bell',
  profile_viewed: 'eye',
  profile_shortlisted: 'heart',
  boost_ending: 'clock',
  boost_ended: 'star',
  boost_reminder: 'star',
  team_created: 'sparkle',
};

function localized(v: Partial<Record<Lang, string>> & { en: string }, lang: Lang) {
  return v[lang]?.trim() ? v[lang]! : v.en;
}

export function useNotificationText() {
  const { t } = useTranslation();
  const lang = useSession((s) => s.lang);
  return useCallback(
    (n: NotificationView) => {
      if (n.announcement) return { title: localized(n.announcement.title, lang), body: localized(n.announcement.body, lang) };
      const key =
        n.type === 'payment'
          ? `notifications.t.payment_${n.params.status}`
          : n.type === 'request_received' && n.params.offered
            ? 'notifications.t.request_received_offer'
            : n.type === 'request_accepted' && n.params.numberShared
              ? 'notifications.t.request_accepted_number'
              : `notifications.t.${n.type}`;
      return { title: t(key, { ...n.params, note: n.params.note || '—' }), body: n.type === 'boost_started' && n.params.until ? formatDate(n.params.until) : undefined };
    },
    [t, lang],
  );
}
