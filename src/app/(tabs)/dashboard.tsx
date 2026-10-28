import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckoutSheet, PricingNotice } from '@/components/Checkout';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate, formatMoney } from '@/domain/format';
import { resolvePricing } from '@/domain/pricing';
import { profileTypeOf } from '@/domain/privacy';
import type { Order } from '@/domain/types';
import { useDashboard, useInvalidateProfileState, useMyProfile, useOrders, usePricing } from '@/hooks/queries';
import { backend } from '@/services';
import { colors, radius, space } from '@/theme/tokens';

/** Dashboard & profile reach (PRD §13): status, recorded metrics, boost, payments. */
export default function Dashboard() {
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const invalidate = useInvalidateProfileState();
  const { data: profile, isLoading } = useMyProfile();
  const { data: m, error, refetch } = useDashboard();
  const { data: pricing } = usePricing();
  const { data: orders } = useOrders();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <Loading />;

  const header = (
    <View style={{ paddingTop: space.xs }}>
      <LanguageSwitcher compact />
    </View>
  );

  if (!profile) {
    return (
      <Screen header={<TabHeader title={t('nav.profile')} settings />}>
        {header}
        <Card style={{ marginTop: space.xl, gap: space.md, alignItems: 'flex-start' }}>
          <Text variant="h2">{t('dashboard.createTitle')}</Text>
          <Text variant="body">{t('dashboard.createBody')}</Text>
          <Button label={t('dashboard.createCta')} onPress={() => router.push('/biodata')} testID="create-biodata" />
        </Card>
        {pricing ? <View style={{ marginTop: space.lg }}><PricingNotice config={pricing} type="bride" /></View> : null}
      </Screen>
    );
  }

  const type = profileTypeOf(profile);
  const price = pricing ? resolvePricing(pricing, type) : null;
  const st = profile.status;

  const boost = async () => {
    setBusy(true);
    try {
      const res = await backend.startBoost();
      if (res.order.status === 'pending') setOrder(res.order);
      else {
        toast(t('notifications.t.boost_started'));
        invalidate();
      }
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async () => {
    try {
      await backend.setPaused(st === 'published');
      invalidate();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const metric = (icon: IconName, label: string, value: number | string) => (
    <View style={styles.metric} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={18} color={colors.goldDeep} />
      <Text variant="h1" style={{ lineHeight: 34 }}>
        {value}
      </Text>
      <Text variant="caption">{label}</Text>
    </View>
  );

  return (
    <Screen header={<TabHeader title={t('nav.profile')} settings />}>
      {header}
      <Card style={{ marginTop: space.lg, gap: space.sm }}>
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <Text variant="h3">{profile.biodata.basic.fullName}</Text>
          <Badge label={t(`opt.status.${st}`)} tone={st === 'published' ? 'success' : st === 'rejected' ? 'danger' : 'gold'} />
        </Row>
        <Text variant="caption">{t(`preview.statusHelp.${st}`)}</Text>
        {profile.adminNote ? <Banner tone="danger" icon="flag">{`${t('dashboard.adminNote')}: ${profile.adminNote}`}</Banner> : null}
        <Row gap={space.sm} wrap style={{ marginTop: space.sm }}>
          {st === 'draft' || st === 'rejected' ? (
            <Button label={profile.lastStep >= 7 ? t('preview.publish') : t('dashboard.continueCta')} size="sm" onPress={() => router.push(profile.lastStep >= 7 ? '/biodata/preview' : '/biodata')} />
          ) : null}
          <Button label={t('dashboard.editBiodata')} size="sm" kind="secondary" onPress={() => router.push({ pathname: '/biodata', params: { step: '0' } })} />
          <Button label={t('dashboard.viewAsOthers')} size="sm" kind="secondary" onPress={() => router.push('/biodata/preview')} />
          {st === 'published' || st === 'paused' ? (
            <Button label={st === 'published' ? t('dashboard.pause') : t('dashboard.resume')} size="sm" kind="ghost" onPress={togglePause} />
          ) : null}
        </Row>
      </Card>

      <Section title={t('dashboard.title')}>
        {error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : m ? (
          <>
            <View style={styles.grid}>
              {metric('eye', t('dashboard.views'), m.views)}
              {metric('users', t('dashboard.uniqueViewers'), m.uniqueViewers)}
              {metric('heart', t('dashboard.shortlistedBy'), m.shortlistedBy)}
              {metric('mail', t('dashboard.requestsReceived'), m.requestsReceived)}
              {metric('check', t('dashboard.requestsAccepted'), m.requestsAccepted)}
            </View>
            <Text variant="caption">{t('dashboard.metricsNote')}</Text>
          </>
        ) : (
          <Loading />
        )}
      </Section>

      <Section title={t('dashboard.boost')}>
        <Card style={{ gap: space.sm }}>
          {m?.boostActive ? (
            <View style={{ gap: space.xs }} testID="boost-status">
              <Row>
                <Icon name="star" color={colors.goldMuted} />
                <Text variant="bodyStrong">{t('dashboard.boostActiveUntil', { date: formatDate(m.boostUntil) })}</Text>
              </Row>
              {m.boostVisible ? (
                <Text variant="caption" color={colors.success}>
                  {t('dashboard.boostVisible')}
                </Text>
              ) : (
                <Banner tone="warning" icon="pause">
                  {t('dashboard.boostHidden')}
                </Banner>
              )}
              <Text variant="label" testID="boost-reach">
                {t('dashboard.boostReach', { count: m.featuredReach ?? 0 })}
              </Text>
            </View>
          ) : (
            <Text variant="body">{t('dashboard.boostNone')}</Text>
          )}
          {price?.boost.mode === 'disabled' ? (
            <Text variant="caption">{t('dashboard.boostDisabled')}</Text>
          ) : price ? (
            <Button
              label={t('dashboard.boostCta', { days: price.boostDays, price: price.boost.mode === 'free' ? t('pricing.free') : price.boostLabel })}
              kind="gold"
              onPress={boost}
              loading={busy}
              disabled={st !== 'published'}
            />
          ) : null}
          <Text variant="caption">{t('discover.boostedNote')}</Text>
          {pricing ? <PricingNotice config={pricing} type={type} /> : null}
        </Card>
      </Section>

      <Section title={t('dashboard.orders')}>
        <Card>
          {orders?.length ? (
            orders.map((o) => (
              <Row key={o.id} style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{o.kind === 'publication' ? t('pricing.publication') : t('pricing.boost')}</Text>
                  <Text variant="caption">{formatDate(o.createdAt)}{o.simulated ? ' · simulated' : ''}</Text>
                </View>
                <Text variant="label">{o.amount ? formatMoney(o.amount, o.currency) : t('pricing.free')}</Text>
                <Badge label={o.status} tone={o.status === 'paid' || o.status === 'free' ? 'success' : o.status === 'failed' ? 'danger' : 'gold'} />
              </Row>
            ))
          ) : (
            <Text variant="caption">{t('dashboard.noOrders')}</Text>
          )}
        </Card>
      </Section>

      <CheckoutSheet
        order={order}
        onClose={() => setOrder(null)}
        onDone={() => {
          setOrder(null);
          invalidate();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    gap: 2,
  },
  orderRow: { paddingVertical: space.sm, gap: space.sm },
});
