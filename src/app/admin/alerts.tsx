import { Pressable, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { adminAlertText } from '@/domain/adminAlerts';
import { qk, useNotifications } from '@/hooks/queries';
import { backend } from '@/services';
import { colors, space } from '@/theme/tokens';
import { safeDeepLink } from '@/domain/security';

/** Admin bell: reports, payments, approvals, account deletions and security changes. */
export default function AdminAlerts() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useNotifications();
  const alerts = data?.filter((n) => n.type === 'admin_alert') ?? [];
  const unread = alerts.filter((n) => !n.readAt).length;
  const refresh = () => qc.invalidateQueries({ queryKey: qk.notifications });

  const markAll = async () => {
    await Promise.all(alerts.filter((n) => !n.readAt).map((n) => backend.markNotificationRead(n.id)));
    refresh();
  };

  return (
    <Screen
      header={<Header title="Alerts" right={unread ? <Button label="Mark all read" kind="ghost" size="sm" onPress={markAll} testID="alerts-mark-all" /> : null} />}
    >
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : !alerts.length ? (
          <EmptyState icon="bell" title="All quiet" body="Reports, payments, profiles waiting for approval and security changes appear here." />
        ) : (
          alerts.map((n) => {
            const a = adminAlertText(n);
            return (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                accessibilityLabel={`${n.readAt ? '' : 'Unread. '}${a.title}`}
                onPress={async () => {
                  await backend.markNotificationRead(n.id).catch(() => undefined);
                  refresh();
                  if (n.deepLink) router.push(safeDeepLink(n.deepLink) as Href);
                }}
                testID={`alert-${n.params.kind}`}
              >
                <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', borderColor: n.readAt ? colors.border : a.urgent ? colors.danger : colors.gold }}>
                  <Icon name={a.icon} color={a.urgent ? colors.danger : colors.emerald} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant={n.readAt ? 'body' : 'bodyStrong'}>{a.title}</Text>
                    <Text variant="caption">{new Date(n.createdAt).toLocaleString('en-GB')}</Text>
                  </View>
                  {!n.readAt ? <Badge label={a.urgent ? 'Action needed' : 'New'} tone={a.urgent ? 'danger' : 'gold'} /> : null}
                  <Icon name="chevronRight" size={18} color={colors.muted} />
                </Card>
              </Pressable>
            );
          })
        )}
        <Row style={{ marginTop: space.md }}>
          <Text variant="caption">Alerts are sent to every active admin. They never contain phone numbers.</Text>
        </Row>
      </View>
    </Screen>
  );
}
