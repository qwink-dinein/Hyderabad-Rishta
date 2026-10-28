import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BrandMark, HeroScene } from '@/components/art/Illustrations';
import { HeroCarousel } from '@/components/HeroCarousel';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { isAdminRole } from '@/domain/types';
import { hasChosenLanguage, isRTL } from '@/i18n';
import { backendInfo } from '@/services';
import { useSession } from '@/state/session';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

/**
 * Landing page (Design PRD §4). Registration is reachable immediately — no marketing gate.
 * No testimonials, user counts, success stories or "verified" claims: nothing fabricated.
 */
export default function Landing() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const lang = useSession((s) => s.lang);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const narrow = screenW < 360;
  const short = screenH < 800 || narrow;
  const [langChosen, setLangChosen] = useState(true);
  useEffect(() => {
    hasChosenLanguage().then(setLangChosen);
  }, []);
  if (user) return <Redirect href={isAdminRole(user.role) ? '/admin' : '/home'} />;

  // Registration journey: choose language (only if never chosen) → mobile → OTP → biodata.
  const create = () => (langChosen ? router.push({ pathname: '/login', params: { next: 'biodata' } }) : router.push({ pathname: '/language', params: { next: 'biodata' } }));
  const find = () => router.push({ pathname: '/login', params: { next: 'discover' } });

  const trust: { icon: IconName; key: 'privacy' | 'family' | 'consent' }[] = [
    { icon: 'lock', key: 'privacy' },
    { icon: 'users', key: 'family' },
    { icon: 'heart', key: 'consent' },
  ];
  const steps: { icon: IconName; key: 'how1' | 'how2' | 'how3' }[] = [
    { icon: 'user', key: 'how1' },
    { icon: 'search', key: 'how2' },
    { icon: 'shield', key: 'how3' },
  ];
  const why: { icon: IconName; key: 'w1' | 'w2' | 'w3' | 'w4' }[] = [
    { icon: 'shield', key: 'w1' },
    { icon: 'users', key: 'w2' },
    { icon: 'heart', key: 'w3' },
    { icon: 'compass', key: 'w4' },
  ];

  return (
    <Screen padded={false} edges={[]}>
      {/* A + B: brand header and hero on Dark Forest */}
      <LinearGradient colors={[colors.forest, colors.emerald]} style={[styles.hero, { paddingTop: insets.top + space.sm }]}>
        <View style={styles.inner}>
          <Row style={styles.header}>
            <Row gap={space.sm} style={{ flexShrink: 1 }}>
              <BrandMark size={34} />
              <View style={{ flexShrink: 1 }}>
                <Text variant="h2" color={colors.ivory} numberOfLines={1}>
                  {t('common.appName')}
                </Text>
                <Text variant="caption" color={colors.gold} numberOfLines={1}>
                  {t('landing.tagline')}
                </Text>
              </View>
            </Row>
            <LanguageSwitcher tone="dark" compact />
          </Row>
          <HeroCarousel />
        </View>
      </LinearGradient>

      <View style={[styles.inner, styles.padded]}>
        {/* C: primary actions — stable position, never moves with the slides */}
        <View style={[styles.ctas, short && styles.ctasShort]}>
          <Button label={t('landing.createBiodata')} onPress={create} full arrow testID="cta-create" />
          <Button label={t('landing.findMatch')} kind="secondary" onPress={find} full testID="cta-find" />
          {/* Tertiary action: clearly tappable (tinted pill, icon, arrow) but lighter than the two buttons above. */}
          <Pressable
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            accessibilityLabel={`${t('landing.registered')} ${t('landing.logIn')}`}
            style={({ pressed }) => [styles.login, pressed && styles.loginPressed]}
            testID="cta-login"
          >
            {narrow ? null : (
              <View style={styles.loginIcon}>
                <Icon name="user" size={16} color={colors.emerald} />
              </View>
            )}
            <Text variant="body" color={colors.muted} style={{ flexShrink: 1 }}>
              {t('landing.registered')}{' '}
              <Text variant="bodyStrong" color={colors.emerald} style={styles.link}>
                {t('landing.logIn')}
              </Text>
            </Text>
            <Icon name={isRTL(lang) ? 'arrowLeft' : 'arrowRight'} size={16} color={colors.emerald} />
          </Pressable>
        </View>

        {/* D: trust indicators — claims we can actually keep */}
        <View style={styles.trust}>
          {trust.map((x) => (
            <View key={x.key} style={styles.trustItem}>
              <View style={styles.trustIcon}>
                <Icon name={x.icon} size={18} color={colors.goldMuted} />
              </View>
              <Text variant="label" center>
                {t(`landing.trust.${x.key}`)}
              </Text>
            </View>
          ))}
        </View>

        {backendInfo.kind === 'demo' ? (
          <View style={{ marginTop: space.lg }}>
            <Banner tone="warning" icon="sparkle">
              {t('common.demoBanner')}
            </Banner>
          </View>
        ) : null}

        {/* E: lower content */}
        <SectionTitle overline={t('landing.howOverline')} title={t('landing.howTitle')} />
        <View style={{ gap: space.md }}>
          {steps.map((s, i) => (
            <Card key={s.key} style={styles.step}>
              <View style={styles.stepNum}>
                <Text variant="h3" color={colors.gold}>
                  {i + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3">{t(`landing.${s.key}.title`)}</Text>
                <Text variant="caption">{t(`landing.${s.key}.body`)}</Text>
              </View>
              <Icon name={s.icon} size={20} color={colors.goldMuted} />
            </Card>
          ))}
        </View>

        <SectionTitle overline={t('landing.whyOverline')} title={t('landing.whyTitle')} />
        <View style={styles.grid}>
          {why.map((w) => (
            <View key={w.key} style={styles.whyTile}>
              <View style={styles.whyIcon}>
                <Icon name={w.icon} size={24} color={colors.goldMuted} />
              </View>
              <Text variant="h3" center>
                {t(`landing.why.${w.key}.title`)}
              </Text>
              <Text variant="caption" center>
                {t(`landing.why.${w.key}.body`)}
              </Text>
            </View>
          ))}
        </View>

        <Card style={[styles.feature, { marginTop: space.xxl }]}>
          <View style={styles.featureIcon}>
            <Icon name="lock" size={22} color={colors.ivory} />
          </View>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="h3">{t('landing.privacyTitle')}</Text>
            <Text variant="caption">{t('landing.privacyBody')}</Text>
          </View>
        </Card>
        <Card style={[styles.feature, { marginTop: space.md }]}>
          <View style={styles.featureIcon}>
            <Icon name="filter" size={22} color={colors.ivory} />
          </View>
          <View style={{ flex: 1, gap: space.xs }}>
            <Text variant="h3">{t('landing.discoverTitle')}</Text>
            <Text variant="caption">{t('landing.discoverBody')}</Text>
          </View>
        </Card>

        {/* Final CTA */}
        <View style={styles.final}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <HeroScene kind="connect" width={720} height={260} />
            <LinearGradient colors={['rgba(11,48,40,0.35)', 'rgba(11,48,40,0.92)']} style={StyleSheet.absoluteFill} />
          </View>
          <Text variant="h1" color={colors.ivory} center>
            {t('landing.finalTitle')}
          </Text>
          <Text variant="body" color={colors.sage} center>
            {t('landing.finalBody')}
          </Text>
          <Button label={t('landing.createBiodata')} kind="gold" onPress={create} arrow style={{ alignSelf: 'center', marginTop: space.sm }} />
        </View>

        <Row style={styles.footer} gap={space.lg} wrap>
          <Text variant="caption" onPress={() => router.push('/legal/privacy')} accessibilityRole="link">
            {t('settings.privacyPolicy')}
          </Text>
          <Text variant="caption" onPress={() => router.push('/legal/terms')} accessibilityRole="link">
            {t('settings.terms')}
          </Text>
          <Text variant="caption" onPress={() => router.push('/legal/help')} accessibilityRole="link">
            {t('settings.help')}
          </Text>
        </Row>
        <View style={{ height: insets.bottom }} />
      </View>
    </Screen>
  );
}

function SectionTitle({ overline, title }: { overline: string; title: string }) {
  return (
    <View style={{ gap: 4, marginTop: space.xxl, marginBottom: space.lg }}>
      <Text variant="overline" center>
        {overline}
      </Text>
      <Text variant="h1" center accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { paddingBottom: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: 'hidden' },
  inner: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  padded: { paddingHorizontal: space.xl },
  header: { justifyContent: 'space-between', paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  ctas: { gap: space.md, marginTop: space.xl },
  ctasShort: { gap: space.sm, marginTop: space.lg },
  link: { textDecorationLine: 'underline' },
  login: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  loginPressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  loginIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  trust: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, marginTop: space.xl, paddingVertical: space.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  trustItem: { flex: 1, alignItems: 'center', gap: space.sm },
  trustIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  step: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  stepNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  whyTile: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 140,
    alignItems: 'center',
    gap: space.xs,
    padding: space.lg,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  whyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  feature: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  featureIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  final: { marginTop: space.xxl, borderRadius: radius.xl, overflow: 'hidden', padding: space.xl, paddingVertical: space.xxl, gap: space.sm, backgroundColor: colors.forest },
  footer: { justifyContent: 'center', marginTop: space.xl, paddingVertical: space.md },
});
