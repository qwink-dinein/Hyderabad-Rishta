import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/art/Illustrations';
import { CheckoutSheet } from '@/components/Checkout';
import { Button } from '@/components/ui/Button';
import { Banner, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { bidiIsolate, formatDate } from '@/domain/format';
import type { DashboardMetrics, Order } from '@/domain/types';
import { useDashboard, useInvalidateProfileState, useMyProfile } from '@/hooks/queries';
import { useBoostStatus } from '@/hooks/useBoostStatus';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Boost (owner PRD 2026-10-29). Not active: choose a 7 / 14 / 30-day option (prices from the admin's
 * live config; free options skip payment). Active or ended: "My Boost" — status, dates, and honest
 * view numbers. Opened from Home, the Profile tab and boost notifications.
 */
export default function BoostScreen() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const invalidate = useInvalidateProfileState();
  const { data: profile } = useMyProfile();
  const { data: m, dataUpdatedAt } = useDashboard();
  const s = useBoostStatus();
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return <Redirect href="/login" />;

  const active = s.nudge === 'active';
  const plan = s.plans.find((p) => p.id === picked) ?? s.plans[0];
  const canBuy = s.nudge === 'ready' && !!plan;

  const start = async () => {
    if (!plan || busy) return; // one request at a time; the backend also reuses an open order
    setBusy(true);
    try {
      const res = await backend.startBoost(plan.id);
      if (res.order.status === 'pending') setOrder(res.order);
      else {
        toast(t('notifications.t.boost_started'));
        invalidate();
      }
    } catch (e) {
      toast(errMsg(e), 'danger');
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    try {
      await backend.setPaused(false);
      invalidate();
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const footer = canBuy ? (
    <Button
      label={plan.fee.mode === 'free' ? t('myBoost.activateFree') : t('myBoost.continuePrice', { price: bidiIsolate(plan.label) })}
      kind="gold"
      onPress={start}
      loading={busy}
      full
      testID="boost-cta"
    />
  ) : undefined;

  return (
    <Screen header={<Header title={active ? t('myBoost.titleMy') : t('myBoost.titleGet')} />} footer={footer}>
      {s.nudge === null ? (
        <Loading />
      ) : s.nudge === 'no_profile' ? (
        <Card style={styles.notice}>
          <Text variant="h3">{t('boost.noProfileTitle')}</Text>
          <Text variant="body">{t('boost.noProfileBody')}</Text>
          <Button label={t('dashboard.createCta')} onPress={() => router.push('/biodata')} testID="boost-create" />
        </Card>
      ) : (
        <View style={{ gap: space.lg, paddingTop: space.lg }}>
          {active || s.expired ? <BoostStatusCard m={m} active={active} fetchedAt={dataUpdatedAt} /> : <Hero />}
          {s.nudge === 'not_published' ? (
            s.status === 'paused' ? (
              <Card style={styles.notice}>
                <Text variant="h3">{t('myBoost.pausedTitle')}</Text>
                <Text variant="body">{t('myBoost.pausedBody')}</Text>
                <Button label={t('dashboard.resume')} onPress={resume} loading={busy} testID="boost-resume" />
              </Card>
            ) : s.status === 'pending' ? (
              <Card style={styles.notice}>
                <Text variant="h3" testID="boost-pending">
                  {t('myBoost.pendingTitle')}
                </Text>
                <Text variant="body">{t('myBoost.pendingBody')}</Text>
              </Card>
            ) : (
              <Card style={styles.notice}>
                <Text variant="h3">{t('boost.notPublishedTitle')}</Text>
                <Text variant="body">{t('boost.notPublishedBody')}</Text>
                <Button label={t('boost.notPublishedCta')} onPress={() => router.push(profile && profile.lastStep >= 7 ? '/biodata/preview' : '/biodata')} testID="boost-publish" />
              </Card>
            )
          ) : null}
          {s.nudge === 'disabled' ? <Banner icon="info">{t('boost.disabled')}</Banner> : null}
          {active ? (
            <View style={styles.again} testID="boost-again-after">
              <Icon name="clock" size={18} color={colors.emerald} />
              <Text variant="label" color={colors.emerald} style={{ flex: 1 }}>
                {t('boost.againAfter', { date: formatDate(m?.boostUntil) })}
              </Text>
            </View>
          ) : null}
          {s.plans.length && !active && s.nudge !== 'disabled' ? (
            <View style={{ gap: space.md }}>
              <Text variant="h3" accessibilityRole="header">
                {s.expired ? t('myBoost.boostAgain') : t('myBoost.choose')}
              </Text>
              <View role="radiogroup" style={{ gap: space.md }}>
                {s.plans.map((p) => {
                  const on = p.id === plan?.id;
                  const price = p.fee.mode === 'free' ? t('myBoost.free') : p.label;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setPicked(p.id)}
                      role="radio"
                      aria-checked={on}
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={t('myBoost.selectA11y', { days: p.days, price })}
                      disabled={s.nudge !== 'ready'}
                      style={[styles.plan, on && styles.planOn]}
                      testID={`plan-${p.id}`}
                    >
                      {p.popular ? (
                        <View style={styles.popular}>
                          <Text variant="caption" color={colors.white} style={{ fontSize: 11 }}>
                            {t('myBoost.popular')}
                          </Text>
                        </View>
                      ) : null}
                      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
                        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                            <Text variant="h3" color={colors.emerald} style={{ flexShrink: 1 }}>
                              {t('myBoost.planDays', { count: p.days })}
                            </Text>
                            <Text variant="h3" color={p.fee.mode === 'free' ? colors.success : colors.charcoal} testID={`plan-price-${p.id}`}>
                              {price}
                            </Text>
                          </Row>
                          {(['benefitFeatured', 'benefitRotation', 'benefitNoRenew'] as const).map((k) => (
                            <Row key={k} gap={6}>
                              <Icon name="check" size={14} color={colors.success} />
                              <Text variant="caption" style={{ flex: 1 }}>
                                {t(`myBoost.${k}`)}
                              </Text>
                            </Row>
                          ))}
                        </View>
                      </Row>
                    </Pressable>
                  );
                })}
              </View>
              <Text variant="caption">{t('myBoost.honest')}</Text>
            </View>
          ) : null}
        </View>
      )}
      <CheckoutSheet
        order={order}
        onClose={() => {
          setOrder(null);
          invalidate();
        }}
        onDone={() => {
          setOrder(null);
          invalidate();
        }}
      />
    </Screen>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <LinearGradient colors={[colors.forest, colors.emerald]} style={styles.hero}>
      <View style={styles.heroMark} pointerEvents="none">
        <BrandMark size={150} />
      </View>
      <View style={styles.heroIcon}>
        <Icon name="crown" size={28} color={colors.emerald} />
      </View>
      <Text variant="h1" color={colors.ivory} accessibilityRole="header">
        {t('myBoost.heroTitle')}
      </Text>
      <Text variant="body" color={colors.sage}>
        {t('myBoost.heroBody')}
      </Text>
    </LinearGradient>
  );
}

/** "My Boost": status, dates, length, and before/during views only when the comparison is fair. */
function BoostStatusCard({ m, active, fetchedAt }: { m?: DashboardMetrics; active: boolean; fetchedAt: number }) {
  const { t } = useTranslation();
  if (!m?.boostUntil) return null;
  // Measured from when this status was fetched; a 1 h tolerance keeps a new 7-day boost at "7 days left".
  const daysLeft = m.boostUntil ? Math.max(1, Math.ceil((new Date(m.boostUntil).getTime() - fetchedAt - 3600000) / 86400000)) : 0;
  const benefit = (icon: IconName, text: string, testID?: string) => (
    <View style={styles.benefit} testID={testID}>
      <View style={styles.benefitIcon}>
        <Icon name={icon} size={16} color={colors.emerald} />
      </View>
      <Text variant="body" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
  const before = m.previousViews;
  const during = m.boostViews ?? 0;
  const max = Math.max(1, during, before ?? 0);
  return (
    <View style={{ gap: space.lg }} testID="boost-status">
      <Card style={{ gap: space.sm }}>
        <Row gap={space.md}>
          <View style={styles.crownBig}>
            <Icon name="crown" size={24} color={colors.white} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3">{active ? t('myBoost.activeTitle') : t('myBoost.expiredTitle')}</Text>
            <Text variant="caption">{active ? t('myBoost.validTill', { date: formatDate(m.boostUntil) }) : t('myBoost.endedOn', { date: formatDate(m.boostUntil) })}</Text>
          </View>
          <View style={[styles.pill, !active && { backgroundColor: colors.sage }]}>
            <Text variant="label" color={active ? colors.goldDeep : colors.muted} testID="boost-days-left">
              {active ? t('boost.daysLeft', { count: daysLeft }) : t('myBoost.statusExpired')}
            </Text>
          </View>
        </Row>
        {m.boostStartedAt ? (
          // Older boosts may not have a recorded start: then only the expiry is shown.
          <Text variant="caption">
            {t('myBoost.started', { date: formatDate(m.boostStartedAt) })}
            {m.boostDays ? ` · ${t('myBoost.duration', { count: m.boostDays })}` : ''}
          </Text>
        ) : null}
        {active ? (
          m.boostVisible ? (
            <Text variant="caption" color={colors.success}>
              {t('dashboard.boostVisible')}
            </Text>
          ) : (
            <Banner tone="warning" icon="pause">
              {t('dashboard.boostHidden')}
            </Banner>
          )
        ) : null}
      </Card>
      {active ? (
        <Card style={{ gap: space.md }}>
          <Text variant="h3">{t('myBoost.benefitsTitle')}</Text>
          {benefit('star', t('myBoost.benefitFeatured'))}
          {benefit('users', t('dashboard.boostReach', { count: m.featuredReach ?? 0 }), 'boost-reach')}
          {benefit('clock', t('myBoost.benefitNoRenew'))}
        </Card>
      ) : null}
      {m.boostStartedAt ? (
        <Card style={{ gap: space.md }}>
          <Text variant="h3">{t('myBoost.viewsTitle')}</Text>
          {before != null && m.previousWindow && m.boostWindow ? (
            <View style={styles.chart} testID="boost-chart">
              {(
                [
                  [t('myBoost.viewsBefore'), before, m.previousWindow, colors.goldMuted],
                  [t('myBoost.viewsDuring'), during, m.boostWindow, colors.emerald],
                ] as const
              ).map(([label, value, w, color]) => (
                <View key={label} style={styles.barCol} accessible accessibilityLabel={`${label}: ${value}`}>
                  <Text variant="h3">{value}</Text>
                  <View style={[styles.bar, { height: 12 + (100 * value) / max, backgroundColor: color }]} />
                  <Text variant="label">{label}</Text>
                  <Text variant="caption" center>
                    {t('myBoost.viewsRange', { from: formatDate(w.from), to: formatDate(w.to) })}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <>
              <Text variant="bodyStrong" testID="boost-views-only">
                {t('myBoost.viewsOnly', { count: during })}
              </Text>
              <Text variant="caption">{t('myBoost.viewsNoCompare')}</Text>
            </>
          )}
          <Text variant="caption">{t('myBoost.viewsNote')}</Text>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { gap: space.sm, alignItems: 'flex-start', marginTop: space.lg },
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.sm, overflow: 'hidden' },
  heroMark: { position: 'absolute', right: -30, top: -30, opacity: 0.18 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  again: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.sage },
  plan: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border },
  planOn: { borderColor: colors.gold, backgroundColor: colors.goldSoft },
  popular: { position: 'absolute', top: -11, right: space.lg, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.goldMuted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: colors.emerald },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.emerald },
  crownBig: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.goldSoft },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  benefitIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: space.lg, paddingTop: space.sm },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  bar: { width: 48, borderRadius: radius.sm },
});
