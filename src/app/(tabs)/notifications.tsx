import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import type { Lang } from '@/domain/types';
import { qk, useNotifications } from '@/hooks/queries';
import { backend, type NotificationView } from '@/services';
import { useSession } from '@/state/session';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

const ICONS: Record<string, IconName> = {
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
};

/** In-app notification centre (PRD §14): unread count, mark read / all, deep links, announcements. */
export default function Notifications() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = useSession((s) => s.lang);
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isRefetching } = useNotifications();
  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  const open = useCallback(
    async (n: NotificationView) => {
      // Opening = an interaction, which is what counts as an announcement "view".
      await backend.markNotificationRead(n.id).catch(() => undefined);
      if (n.deepLink) {
        if (n.announcementId) await backend.recordNotificationClick(n.id).catch(() => undefined);
        router.push(n.deepLink as Href);
      }
      qc.invalidateQueries({ queryKey: qk.notifications });
    },
    [qc],
  );

  const text = (n: NotificationView) => {
    if (n.announcement) return { title: localized(n.announcement.title, lang), body: localized(n.announcement.body, lang) };
    const key =
      n.type === 'payment' ? `notifications.t.payment_${n.params.status}` : n.type === 'request_received' && n.params.offered ? 'notifications.t.request_received_offer' : `notifications.t.${n.type}`;
    return { title: t(key, { ...n.params, note: n.params.note || '—' }), body: n.type === 'boost_started' && n.params.until ? formatDate(n.params.until) : undefined };
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Row style={[styles.column, { padding: space.lg, justifyContent: 'space-between' }]} wrap>
        <View>
          <Text variant="h1" accessibilityRole="header">
            {t('notifications.title')}
          </Text>
          {unread ? <Text variant="caption">{t('notifications.unread', { count: unread })}</Text> : null}
        </View>
        {unread ? (
          <Button
            label={t('notifications.markAll')}
            kind="ghost"
            size="sm"
            onPress={async () => {
              await backend.markAllNotificationsRead();
              qc.invalidateQueries({ queryKey: qk.notifications });
            }}
          />
        ) : null}
      </Row>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorView error={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(n) => n.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          contentContainerStyle={[styles.column, { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.sm }]}
          ListEmptyComponent={<EmptyState icon="bell" title={t('notifications.empty')} />}
          renderItem={({ item }) => {
            const { title, body } = text(item);
            const isUnread = !item.readAt;
            return (
              <Pressable
                onPress={() => open(item)}
                accessibilityRole="button"
                accessibilityLabel={`${isUnread ? '• ' : ''}${title}`}
                style={[styles.item, isUnread && styles.itemUnread]}
              >
                <View style={[styles.icon, item.announcement?.priority === 'high' && { backgroundColor: colors.warningBg }]}>
                  <Icon name={ICONS[item.type] ?? 'bell'} size={18} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {item.announcement ? <Badge label={t('notifications.t.announcement')} tone={item.announcement.priority === 'high' ? 'gold' : 'emerald'} /> : null}
                  <Text variant={isUnread ? 'bodyStrong' : 'body'}>{title}</Text>
                  {body ? <Text variant="caption">{body}</Text> : null}
                  <Text variant="caption">{formatDate(item.createdAt)}</Text>
                </View>
                {isUnread ? <View style={styles.dot} accessibilityElementsHidden /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

function localized(v: Partial<Record<Lang, string>> & { en: string }, lang: Lang) {
  return v[lang]?.trim() ? v[lang]! : v.en;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  item: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'flex-start' },
  itemUnread: { borderColor: colors.gold, backgroundColor: '#FFFDF7' },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, marginTop: 6 },
});
