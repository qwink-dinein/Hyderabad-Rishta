import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CheckoutSheet, PricingNotice } from '@/components/Checkout';
import { Button } from '@/components/ui/Button';
import { Banner, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Card, Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { resolvePricing } from '@/domain/pricing';
import { profileTypeOf } from '@/domain/privacy';
import type { Order } from '@/domain/types';
import { useDashboard, useInvalidateProfileState, useMyProfile, usePricing } from '@/hooks/queries';
import { backend } from '@/services';
import { colors, radius, space } from '@/theme/tokens';

/** Boost status, reach and the "Boost for …" action (checkout included). Used by the Boost tab. */
export function BoostPanel() {
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const invalidate = useInvalidateProfileState();
  const { data: profile } = useMyProfile();
  const { data: m, dataUpdatedAt } = useDashboard();
  const { data: pricing } = usePricing();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile || !pricing) return null;

  const type = profileTypeOf(profile);
  const price = resolvePricing(pricing, type);
  // Measured from when this status was fetched (refreshes with the data); a 1 h tolerance keeps a
  // brand-new 7-day boost at "7 days left", not 8.
  const daysLeft = m?.boostUntil ? Math.max(1, Math.ceil((new Date(m.boostUntil).getTime() - dataUpdatedAt - 3600000) / 86400000)) : 0;

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

  return (
    <Card style={{ gap: space.md }}>
      {m?.boostActive ? (
        <View style={{ gap: space.sm }} testID="boost-status">
          <Row style={{ justifyContent: 'space-between' }} wrap>
            <Row gap={space.sm}>
              <Icon name="star" color={colors.goldMuted} />
              <Text variant="h3">{t('boost.activeTitle')}</Text>
            </Row>
            <View style={{ paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.goldSoft }}>
              <Text variant="label" color={colors.goldDeep}>
                {t('boost.daysLeft', { count: daysLeft })}
              </Text>
            </View>
          </Row>
          <Text variant="bodyStrong">{t('dashboard.boostActiveUntil', { date: formatDate(m.boostUntil) })}</Text>
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
      {m?.boostActive ? (
        // One boost at a time: no "boost again" while this one runs (the backend refuses it too).
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.sage }} testID="boost-again-after">
          <Icon name="clock" size={18} color={colors.emerald} />
          <Text variant="label" color={colors.emerald} style={{ flex: 1 }}>
            {t('boost.againAfter', { date: formatDate(m.boostUntil) })}
          </Text>
        </View>
      ) : price.boost.mode === 'disabled' ? (
        <Text variant="caption">{t('boost.disabled')}</Text>
      ) : (
        <Button
          label={t('dashboard.boostCta', { days: price.boostDays, price: price.boost.mode === 'free' ? t('pricing.free') : price.boostLabel })}
          kind="gold"
          onPress={boost}
          loading={busy}
          disabled={profile.status !== 'published'}
          full
          testID="boost-cta"
        />
      )}
      <Text variant="caption">{t('discover.boostedNote')}</Text>
      <PricingNotice config={pricing} type={type} />
      <CheckoutSheet
        order={order}
        onClose={() => setOrder(null)}
        onDone={() => {
          setOrder(null);
          invalidate();
        }}
      />
    </Card>
  );
}
