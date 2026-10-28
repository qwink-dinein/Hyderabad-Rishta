import { useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Header, Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { qk, useNotifications } from '@/hooks/queries';
import { NOTIFICATION_ICONS as ICONS, useNotificationText } from '@/hooks/useNotificationText';
import { backend, type NotificationView } from '@/services';
import { useSession } from '@/state/session';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';
import { safeDeepLink } from '@/domain/security';


/** In-app notification centre (PRD §14): unread count, mark read / all, deep links, announcements. */
export default function Notifications() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const { data, isLoading, error, refetch, isRefetching } = useNotifications();
  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  const open = useCallback(
    async (n: NotificationView) => {
      // Opening = an interaction, which is what counts as an announcement "view".
      await backend.markNotificationRead(n.id).catch(() => undefined);
      if (n.deepLink) {
        if (n.announcementId) await backend.recordNotificationClick(n.id).catch(() => undefined);
        router.push(safeDeepLink(n.deepLink) as Href);
      }
      qc.invalidateQueries({ queryKey: qk.notifications });
    },
    [qc],
  );

  const text = useNotificationText();

  if (!user) return <Redirect href="/login" />;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={t('notifications.title')} onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
      <Row style={[styles.column, { padding: space.lg, justifyContent: 'space-between' }]} wrap>
        <View>
          <Text variant="label" color={colors.muted}>{unread ? t('notifications.unread', { count: unread }) : t('notifications.allRead')}</Text>
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


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  item: { flexDirection: 'row', gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'flex-start' },
  itemUnread: { borderColor: colors.gold, backgroundColor: '#FFFDF7' },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.gold, marginTop: 6 },
});
