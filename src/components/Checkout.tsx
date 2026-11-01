import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@/domain/format';
import { pricingCopy } from '@/domain/pricing';
import type { Order, PricingConfig, ProfileType } from '@/domain/types';
import { backend, backendInfo } from '@/services';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';
import { Button } from './ui/Button';
import { Banner, useErrorMessage, useToast } from './ui/feedback';
import { Divider, Row } from './ui/layout';
import { Text } from './ui/Text';

/** Pricing explainer generated from the active config — never hand-written per screen (PRD §8). */
export function PricingNotice({ config, type }: { config: PricingConfig; type: ProfileType }) {
  const { t } = useTranslation();
  const { key, params } = pricingCopy(config, type);
  return <Banner icon="sparkle">{t(key, params)}</Banner>;
}

/**
 * Order summary + simulated payment. In production this hands off to a payment provider
 * (Razorpay/Stripe) via an Edge Function; the simulation is clearly labelled and never
 * collects card details.
 */
export function CheckoutSheet({ order, onClose, onDone }: { order: Order | null; onClose: () => void; onDone: (ok: boolean) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [busy, setBusy] = useState<'success' | 'failure' | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!order) return null;
  // Simulated payments exist only in the demo. The live app has no payment gateway yet (owner decision pending):
  // say so plainly instead of showing buttons the server must refuse.
  const canSimulate = backendInfo.kind === 'demo';

  const pay = async (outcome: 'success' | 'failure') => {
    setBusy(outcome);
    setError(null);
    try {
      await backend.completePayment(order.id, outcome);
      toast(outcome === 'success' ? t('pricing.paymentSuccess') : t('pricing.paymentFailed'), outcome === 'success' ? 'success' : 'danger');
      onDone(outcome === 'success');
    } catch (e) {
      setError(errMsg(e)); // shown inside the sheet (a toast would sit behind it)
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]} accessibilityViewIsModal>
          <Text variant="h2" accessibilityRole="header">
            {t('pricing.orderSummary')}
          </Text>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Text variant="bodyStrong">{order.kind === 'publication' ? t('pricing.publication') : t('pricing.boost')}</Text>
              {order.terms.boostDays ? <Text variant="caption">{t('pricing.duration', { days: order.terms.boostDays })}</Text> : null}
            </View>
            <Text variant="bodyStrong">{formatMoney(order.amount, order.currency)}</Text>
          </Row>
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="h3">{t('pricing.total')}</Text>
            <Text variant="h2">{formatMoney(order.amount, order.currency)}</Text>
          </Row>
          <Text variant="caption">{t('pricing.noAutoRenew')}</Text>
          {canSimulate ? (
            <>
              {order.simulated ? <Banner tone="warning" icon="shield">{t('pricing.simulatedNote')}</Banner> : null}
              {error ? (
                <Text variant="caption" color={colors.danger} accessibilityRole="alert" testID="checkout-error">
                  {error}
                </Text>
              ) : null}
              <Button label={t('pricing.simulateSuccess')} onPress={() => pay('success')} loading={busy === 'success'} disabled={!!busy} full testID="checkout-pay" />
              <Button label={t('pricing.simulateFailure')} kind="secondary" onPress={() => pay('failure')} loading={busy === 'failure'} disabled={!!busy} full />
              <Button label={t('common.cancel')} kind="ghost" onPress={onClose} disabled={!!busy} />
            </>
          ) : (
            <>
              <Banner tone="warning" icon="clock">
                <Text variant="bodyStrong" color={colors.goldDeep}>
                  {t('pricing.paymentsSoonTitle')}
                </Text>
                <Text variant="caption" color={colors.goldDeep} testID="checkout-soon">
                  {t('pricing.paymentsSoonBody')}
                </Text>
              </Banner>
              <Button label={t('common.close')} onPress={onClose} full testID="checkout-ok" />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.ivory,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    gap: space.md,
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
});
