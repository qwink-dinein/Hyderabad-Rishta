import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/art/Illustrations';
import { useReferralMode } from '@/components/referral/ReferralCards';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { profileCompletion } from '@/domain/completion';
import { useMyProfile, useMyReferral } from '@/hooks/queries';
import { useBoostStatus } from '@/hooks/useBoostStatus';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Selling the Boost everywhere (owner 2026-11-07): "show the Boost option wherever possible and sell it; lure
 * them to Boost, then tell them to refer and complete 100% if not". A free Boost comes only from a referral,
 * so the call to action is always the member's NEXT real step:
 *   complete → profile under 100% (needed to use a free Boost) · refer → 100%, no free Boost yet
 *   use      → a free Boost is ready · buy → Paid mode with plans · hidden → nothing to sell right now.
 */
export type BoostSellState = 'hidden' | 'complete' | 'refer' | 'use' | 'buy';

export function useBoostSell() {
  const { data: profile } = useMyProfile();
  const s = useBoostStatus();
  const rm = useReferralMode();
  const { data: me } = useMyReferral();
  const c = profile ? profileCompletion(profile.biodata) : undefined;
  const percent = c?.percent ?? 0;
  const available = me?.stats.available ?? 0;
  const pending = Math.max(0, (me?.stats.referred ?? 0) - (me?.stats.approved ?? 0));
  const days = me?.rewardDays ?? rm.settings?.rewardDays ?? 7;
  // Only a live, unboosted profile can be Boosted; publishing and running Boosts have their own cards.
  // 'disabled' = live but no plan can be bought — in Referral mode that is normal, and we sell referring.
  let state: BoostSellState = 'hidden';
  if (profile && c && (s.nudge === 'ready' || s.nudge === 'disabled')) {
    if (s.nudge === 'ready' && rm.settings?.mode !== 'referral' && s.plans.length) state = 'buy';
    else if (rm.on || available > 0) state = available > 0 ? (percent === 100 ? 'use' : 'complete') : percent === 100 ? 'refer' : 'complete';
  }
  const openNext = () =>
    router.push({ pathname: '/biodata', params: { step: String(c?.next?.step ?? 0), ...(c?.next?.field ? { focus: c.next.field } : {}) } });
  const go = () => {
    if (state === 'complete') openNext();
    else if (state === 'refer') router.push('/refer');
    else if (state === 'use') router.push('/refer/use');
    else router.push('/boost');
  };
  return { state, percent, available, pending, days, go, openNext };
}

/** Home: the big Boost card — the promise first, then the two steps to a free Boost and the next action. */
export function BoostSellHero() {
  const { t } = useTranslation();
  const b = useBoostSell();
  if (b.state === 'hidden') return null;
  const cta =
    b.state === 'complete'
      ? t('sell.ctaComplete', { percent: b.percent })
      : b.state === 'refer'
        ? t('sell.ctaRefer')
        : b.state === 'use'
          ? t('sell.ctaUse')
          : t('sell.ctaBuy');
  const steps = b.state === 'buy' || b.state === 'use' ? null : (
    <View style={{ gap: space.sm, marginTop: space.xs }}>
      <Text variant="label" color={colors.gold}>
        {b.available > 0 ? t('sell.waitingBody', { percent: b.percent }) : t('sell.freeLine', { days: b.days })}
      </Text>
      <Step done={b.percent === 100} label={t('sell.step1')} hint={b.percent < 100 ? t('sell.step1Now', { percent: b.percent }) : undefined} />
      {b.available > 0 ? null : <Step done={false} label={t('sell.step2')} hint={b.pending ? t('sell.step2Pending', { count: b.pending }) : undefined} />}
    </View>
  );
  return (
    <View style={styles.hero} testID="boost-sell-hero" accessibilityLabel={`${t('sell.heroTitle')} ${t('sell.heroBody')}`}>
      <View style={styles.heroMark} pointerEvents="none">
        <BrandMark size={120} />
      </View>
      <Row gap={space.sm}>
        <View style={styles.badge}>
          <Icon name="crown" size={13} color={colors.forest} />
          <Text variant="overline" color={colors.forest}>
            {t('sell.badge')}
          </Text>
        </View>
      </Row>
      <Text variant="h2" color={colors.ivory} accessibilityRole="header">
        {b.state === 'use' ? t('sell.readyTitle') : b.available > 0 ? t('sell.waitingTitle') : t('sell.heroTitle')}
      </Text>
      <Text variant="body" color={colors.sage}>
        {t('sell.heroBody')}
      </Text>
      {steps}
      <Button label={cta} kind="gold" full arrow onPress={b.go} style={{ marginTop: space.sm }} testID="boost-sell-cta" />
      {b.state === 'complete' && b.available === 0 ? (
        <Text variant="label" color={colors.gold} onPress={() => router.push('/refer')} accessibilityRole="link" style={styles.link} testID="boost-sell-refer">
          {t('sell.referToo')}
        </Text>
      ) : null}
    </View>
  );
}

function Step({ done, label, hint }: { done: boolean; label: string; hint?: string }) {
  return (
    <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
      <View style={[styles.tick, done && styles.tickDone]}>{done ? <Icon name="check" size={14} color={colors.forest} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={colors.ivory} style={done ? styles.doneText : undefined}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color={colors.sage}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Row>
  );
}

/** Every other screen: one tappable row with the member's next step to a Boost. */
export function BoostSellBanner({ testID = 'boost-sell-banner' }: { testID?: string }) {
  const { t } = useTranslation();
  const b = useBoostSell();
  if (b.state === 'hidden') return null;
  const title = b.state === 'use' ? t('sell.readyTitle') : b.state === 'buy' ? t('myBoost.titleGet') : b.available > 0 ? t('sell.waitingTitle') : t('sell.compactTitle');
  const body =
    b.state === 'complete'
      ? b.available > 0
        ? t('sell.waitingBody', { percent: b.percent })
        : t('sell.compactComplete', { percent: b.percent })
      : b.state === 'refer'
        ? t('sell.compactRefer')
        : b.state === 'use'
          ? t('sell.compactUse')
          : t('sell.compactBuy');
  return (
    <Pressable onPress={b.go} accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]} testID={testID}>
      <View style={styles.crown}>
        <Icon name="crown" size={20} color={colors.forest} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color={colors.ivory}>
          {title}
        </Text>
        <Text variant="caption" color={colors.sage}>
          {body}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.gold} />
    </Pressable>
  );
}

/** The last card of the Featured rail: "Your profile could be here". Same width as a profile card. */
export function BoostSellTile({ width }: { width: number }) {
  const { t } = useTranslation();
  const b = useBoostSell();
  if (b.state === 'hidden') return null;
  return (
    <Pressable onPress={b.go} accessibilityRole="button" style={[styles.tile, { width }]} testID="boost-sell-tile">
      <View style={styles.tileCrown}>
        <Icon name="crown" size={26} color={colors.white} />
      </View>
      <Text variant="h3" style={{ textAlign: 'center' }}>
        {t('sell.tileTitle')}
      </Text>
      <Text variant="caption" style={{ textAlign: 'center' }}>
        {t('sell.tileBody')}
      </Text>
      <View style={styles.tileCta}>
        <Text variant="label" color={colors.forest}>
          {t('sell.tileCta')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: space.xl, gap: space.sm, overflow: 'hidden', backgroundColor: colors.forest, borderWidth: 1, borderColor: colors.goldMuted },
  heroMark: { position: 'absolute', right: -20, top: -18, opacity: 0.18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3 },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tickDone: { backgroundColor: colors.gold },
  doneText: { textDecorationLine: 'line-through', opacity: 0.75 },
  link: { alignSelf: 'center', paddingVertical: space.sm, textDecorationLine: 'underline' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.forest, minHeight: 64 },
  crown: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  tile: { padding: space.lg, gap: space.sm, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  tileCrown: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
  tileCta: { marginTop: space.xs, backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm },
});
