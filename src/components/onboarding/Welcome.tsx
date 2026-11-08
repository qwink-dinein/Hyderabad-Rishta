import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/art/Illustrations';
import { Charminar } from '@/components/art/Charminar';
import { HeroVideo } from '@/components/HeroVideo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InvitedBanner } from '@/components/referral/ReferralCards';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { FadeIn, Stagger } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { useFit } from '@/hooks/useFit';
import { useUiLang } from '@/i18n/uiLang';
import { useOnboarding } from '@/state/onboarding';
import { colors, radius, space } from '@/theme/tokens';

/**
 * The opening screen — landing page redesign (owner 2026-11-08, approved "muzzappdesigns" Welcome).
 * Conversion first: one promise, a hero picture, ONE gold action that shows real matches before any
 * sign-up ("See my matches — it's free"), and a clear way in for members. Below the fold: three steps,
 * why families choose us, the free Boost through referrals, and the action again. Once the hero
 * action scrolls away a sticky bar keeps it one tap away.
 *
 * Hero background (owner 2026-11-08, "like Muzz"): a muted wedding-moments loop (HeroVideo) runs behind the
 * top of the screen and fades into the maroon by the buttons; the hero window above the headline is left
 * clear so the picture shows. Never caption it as members or a success story — no such claims are published.
 */

const TRUST: [IconName, string][] = [
  ['lock', 'onb.welcome.p1'],
  ['eye', 'onb.welcome.p2'],
  ['users', 'onb.welcome.p3'],
];
const STEPS: [IconName, string, string][] = [
  ['heart', 'onb.welcome.s1t', 'onb.welcome.s1b'],
  ['search', 'onb.welcome.s2t', 'onb.welcome.s2b'],
  ['shield', 'onb.welcome.s3t', 'onb.welcome.s3b'],
];
const WHY: string[] = ['onb.welcome.w1', 'onb.welcome.w2', 'onb.welcome.w3', 'onb.welcome.w4'];

/**
 * "Bringing Hyderabad's Muslim Families Closer, *One Rishta at a Time.*": the words between asterisks are set in
 * soft champagne. English and Roman Urdu use Playfair Display with the accent in Playfair italic (lavender
 * redesign, owner 2026-11-08); Urdu and Telugu keep their own script font (no faux italics).
 */
function headline(text: string, size: number, latin: boolean) {
  return text.split('*').map((part, i) =>
    i % 2 ? (
      <Text key={i} variant="display" color={colors.gold} style={[{ fontSize: size }, latin && { fontFamily: 'Playfair-SemiBoldItalic' }]}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

export function Welcome() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const onb = useOnboarding();
  const { short, tiny, sp } = useFit();
  // Logo, name and the four-language switcher only fit on one line on wider screens; phones show the
  // name with the greeting instead, so the hero starts higher.
  const { width: winW, height: winH } = useWindowDimensions();
  const wide = winW >= 440;
  const [heroCtaY, setHeroCtaY] = useState(0);
  const [sticky, setSticky] = useState(false);
  const heroH = tiny ? 200 : short ? 250 : 310;
  const h1Size = tiny ? 26 : short ? 29 : 32;
  const lang = useUiLang();
  const latin = lang === 'en' || lang === 'ur-Latn';

  const find = () => {
    // Coming back before signing up: continue where they left off, never re-ask.
    if (onb.active && ['side', 'wants', 'matches', 'phone', 'code'].includes(onb.step)) return router.push(`/start/${onb.step === 'code' ? 'phone' : onb.step}`);
    onb.start();
    router.push('/start/who');
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const past = heroCtaY > 0 && e.nativeEvent.contentOffset.y > heroCtaY;
    if (past !== sticky) setSticky(past);
  };

  return (
    <View style={styles.root} testID="welcome-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, space.lg) + (sticky ? 88 : 0) }} onScroll={onScroll} scrollEventThrottle={64}>
        {/* ───── Hero ───── (the video runs under the status bar and ends at the foot of the actions) */}
        <HeroVideo style={{ height: heroCtaY > 0 ? heroCtaY + space.lg : Math.round(winH * 0.9) }} />
        <View style={[styles.column, { paddingTop: insets.top }]}>
          <View style={styles.brand}>
            <BrandMark size={34} />
            {wide ? (
              <Text variant="h3" color={colors.ivory} style={{ flexShrink: 1, fontSize: 19 }} numberOfLines={1}>
                {t('common.appName')}
              </Text>
            ) : null}
            <View style={{ flex: 1 }} />
            <LanguageSwitcher tone="dark" compact />
          </View>
          <View style={{ marginTop: space.sm }}>
            <InvitedBanner />
          </View>

          {/* A clear window onto the video (owner 2026-11-08: no badge here; the privacy pill lives below the fold). */}
          <View style={{ height: heroH + 22, marginTop: sp(space.md) }} />

          <Stagger delay={160} step={70} style={{ marginTop: sp(space.lg), alignItems: 'center' }}>
            <View style={styles.eyebrowRow}>
              <View style={styles.rule} />
              <Text variant="overline" color={colors.champagne} center style={{ fontSize: 11.5 }}>
                {t('common.appName')}
              </Text>
              <View style={styles.rule} />
            </View>
            <Text variant="display" color={colors.champagne} accessibilityRole="header" center style={[styles.h1, latin && { fontFamily: 'Playfair-SemiBold' }, { fontSize: h1Size, lineHeight: Math.round(h1Size * (latin ? 1.25 : lang === 'ur' ? 1.9 : 1.5)) }]}>
              {headline(t('onb.welcome.headline'), h1Size, latin)}
            </Text>
            <Text variant="body" color={colors.gold} center style={[styles.tagline, latin && styles.taglineLatin]}>
              {t('onb.welcome.tagline')}
            </Text>
            <Text variant="body" color={colors.beige} center style={[styles.lede, short && { fontSize: 15.5 }]}>
              {t('onb.welcome.lede')}
            </Text>
          </Stagger>

          <View style={[styles.actions, { marginTop: sp(space.lg) }]} onLayout={(e) => setHeroCtaY(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
            <Button label={t('onb.welcome.find')} kind="gold" onPress={find} full arrow testID="welcome-find-rishta" />
            <Text variant="caption" color={colors.beige} center style={{ fontSize: 13 }}>
              {t('onb.welcome.findNote')}
            </Text>
            <Button label={t('onb.welcome.member')} kind="light" onPress={() => router.push('/login')} full testID="welcome-member-login" style={{ marginTop: space.xs }} />
          </View>

          <View style={[styles.trust, { marginTop: sp(space.xl) }]}>
            {TRUST.map(([icon, key]) => (
              <View key={key} style={styles.trustRow}>
                <View style={styles.trustIcon}>
                  <Icon name={icon} size={17} color={colors.gold} />
                </View>
                <Text variant="body" color={colors.cream} style={{ flex: 1, fontSize: 14.5 }}>
                  {t(key)}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.skyline} pointerEvents="none">
            <Charminar width={170} opacity={0.32} />
          </View>
        </View>

        {/* ───── Below the fold: sell it ───── */}
        <View style={styles.sheet}>
          <View style={styles.columnLight}>
            <Text variant="h2" style={styles.h2} accessibilityRole="header">
              {t('onb.welcome.howTitle')}
            </Text>
            <View style={{ gap: space.md }}>
              {STEPS.map(([icon, title, body], i) => (
                <View key={title} style={styles.step}>
                  <View style={styles.stepNum}>
                    <Text variant="h3" color={colors.goldSoft} style={{ fontSize: 18 }}>
                      {String(i + 1)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                      <Icon name={icon} size={18} color={colors.goldDeep} />
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {t(title)}
                      </Text>
                    </View>
                    <Text variant="caption" style={{ fontSize: 15, lineHeight: 22 }}>
                      {t(body)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.badge, styles.badgeInline]}>
              <Icon name="lock" size={15} color={colors.forest} />
              <Text variant="label" color={colors.forest} style={{ fontSize: 13 }}>
                {t('onb.welcome.badge')}
              </Text>
            </View>
            <Text variant="h2" style={[styles.h2, { marginTop: space.md }]} accessibilityRole="header">
              {t('onb.welcome.whyTitle')}
            </Text>
            <View style={styles.whyCard}>
              {WHY.map((key) => (
                <View key={key} style={styles.whyRow}>
                  <Icon name="check" size={18} color={colors.success} />
                  <Text variant="body" style={{ flex: 1, fontSize: 16 }}>
                    {t(key)}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.boost}>
              <View style={styles.boostBadge}>
                <Icon name="crown" size={14} color={colors.forest} />
                <Text variant="overline" color={colors.forest}>
                  {t('sell.badge')}
                </Text>
              </View>
              <Text variant="h3" color={colors.goldDeep} style={{ fontSize: 22 }}>
                {t('onb.welcome.boostTitle')}
              </Text>
              <Text variant="body" style={{ fontSize: 15, lineHeight: 22 }}>
                {t('onb.welcome.boostBody')}
              </Text>
            </View>

            <View style={styles.final}>
              <Text variant="h2" color={colors.ivory} style={{ fontSize: 26 }}>
                {t('onb.welcome.finalTitle')}
              </Text>
              <Text variant="body" color={colors.sage} style={{ fontSize: 15 }}>
                {t('onb.welcome.finalBody')}
              </Text>
              <Button label={t('onb.welcome.find')} kind="gold" onPress={find} full arrow testID="welcome-find-rishta-bottom" />
            </View>

            <View style={styles.links}>
              <Text variant="caption" onPress={() => router.push('/welcome')} accessibilityRole="link" style={styles.link} testID="how-it-works">
                {t('auth.howItWorks')}
              </Text>
              <Text variant="caption" onPress={() => router.push('/legal/privacy')} accessibilityRole="link" style={styles.link}>
                {t('settings.privacyPolicy')}
              </Text>
              <Text variant="caption" onPress={() => router.push('/legal/help')} accessibilityRole="link" style={styles.link}>
                {t('settings.help')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {sticky ? (
        <FadeIn rise={20} duration={220} style={[styles.stickyBar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
          <Button label={t('onb.welcome.find')} kind="gold" onPress={find} full arrow testID="welcome-find-rishta-sticky" />
        </FadeIn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.forest },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: space.xl, paddingBottom: space.xxl },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.sm },
  hero: { width: '100%', alignItems: 'center' },
  badge: { position: 'absolute', bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cream, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: 10, borderWidth: 1, borderColor: colors.champagne, shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  badgeInline: { position: 'relative', bottom: undefined, alignSelf: 'flex-start', marginTop: space.xxl, shadowOpacity: 0, elevation: 0 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'stretch' },
  rule: { flex: 1, height: 1, backgroundColor: colors.borderGold },
  tagline: { fontSize: 15, marginTop: space.xs },
  taglineLatin: { fontFamily: 'Montserrat-SemiBold', fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase' },
  h1: { fontSize: 37, lineHeight: 45, marginTop: space.sm },
  lede: { fontSize: 16, lineHeight: 24, marginTop: space.sm, maxWidth: 420 },
  skyline: { alignItems: 'center', marginTop: space.lg, marginBottom: -space.xxl },
  actions: { gap: space.sm },
  trust: { gap: space.md },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  trustIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(212,175,55,0.14)', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.ivory, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  columnLight: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: space.xl, paddingTop: space.xxl, paddingBottom: space.xl },
  h2: { fontSize: 26, lineHeight: 32, color: colors.emerald, marginBottom: space.lg },
  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.lg },
  stepNum: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  whyCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  whyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  boost: { marginTop: space.xl, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  boostBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 },
  final: { marginTop: space.xl, backgroundColor: colors.emerald, borderRadius: radius.xl, padding: space.xl, gap: space.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.lg, marginTop: space.xl },
  link: { textDecorationLine: 'underline' },
  stickyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.xl, paddingTop: space.md, backgroundColor: 'rgba(63,47,72,0.96)', borderTopWidth: 1, borderTopColor: 'rgba(212,175,55,0.35)' },
});
