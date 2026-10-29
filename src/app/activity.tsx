import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, ErrorView, Loading } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate, formatMoney } from '@/domain/format';
import { useDashboard, useMyProfile, useOrders } from '@/hooks/queries';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

/** Profile views & activity (PRD §13): recorded counts only — others' views, never who shortlisted you. */
export default function Activity() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const { data: profile } = useMyProfile();
  const { data: m, error, refetch } = useDashboard();
  const { data: orders } = useOrders();
  if (!user) return <Redirect href="/login" />;

  const metric = (icon: IconName, label: string, value: number) => (
    <View key={label} style={styles.metric} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={18} color={colors.goldDeep} />
      <Text variant="h1" style={{ lineHeight: 34 }}>
        {value}
      </Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
  const live = profile?.status === 'published' || profile?.status === 'paused';

  return (
    <Screen header={<Header title={t('me.activity')} />}>
      <Section title={t('dashboard.title')}>
        {error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : !m ? (
          <Loading />
        ) : !live ? (
          <Card>
            <Text variant="body">{t('stats.emptyUnpublished')}</Text>
          </Card>
        ) : (
          <>
            <View style={styles.grid} testID="activity-metrics">
              {metric('eye', t('dashboard.views'), m.views)}
              {metric('users', t('dashboard.uniqueViewers'), m.uniqueViewers)}
              {metric('heart', t('dashboard.shortlistedBy'), m.shortlistedBy)}
              {metric('mail', t('dashboard.requestsReceived'), m.requestsReceived)}
              {metric('check', t('dashboard.requestsAccepted'), m.requestsAccepted)}
            </View>
            <Text variant="caption">{t('dashboard.metricsNote')}</Text>
            <Text variant="caption">{t('stats.note')}</Text>
          </>
        )}
      </Section>
      <Section title={t('me.orders')}>
        <Card>
          {orders?.length ? (
            orders.map((o) => (
              <Row key={o.id} style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="label">
                    {o.kind === 'publication' ? t('pricing.publication') : t('pricing.boost')}
                    {o.terms.boostDays ? ` · ${t('pricing.duration', { days: o.terms.boostDays })}` : ''}
                  </Text>
                  <Text variant="caption">
                    {formatDate(o.createdAt)}
                    {o.simulated ? ` · ${t('pricing.simulated')}` : ''}
                  </Text>
                </View>
                <Text variant="label">{o.amount ? formatMoney(o.amount, o.currency) : t('pricing.free')}</Text>
                <Badge label={t(`pricing.orderStatus.${o.status}`)} tone={o.status === 'paid' || o.status === 'free' ? 'success' : o.status === 'failed' || o.status === 'cancelled' ? 'danger' : 'gold'} />
              </Row>
            ))
          ) : (
            <Text variant="caption">{t('dashboard.noOrders')}</Text>
          )}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: { flexGrow: 1, flexBasis: '30%', minWidth: 100, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 2 },
  orderRow: { paddingVertical: space.sm, gap: space.sm },
});
