import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/art/Illustrations';
import { Charminar } from '@/components/art/Charminar';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { InvitedBanner } from '@/components/referral/ReferralCards';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { FadeIn, Stagger } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { useFit } from '@/hooks/useFit';
import { useOnboarding } from '@/state/onboarding';
import { colors, space } from '@/theme/tokens';
import { T } from './kit';

/**
 * The opening screen (owner request 2026-11-01, research-backed): one promise, one gold action that
 * shows real matches BEFORE any sign-up, and a clear way in for members. Nothing else competes.
 */
const PROMISES: [IconName, string][] = [
  ['lock', 'onb.welcome.p1'],
  ['eye', 'onb.welcome.p2'],
  ['users', 'onb.welcome.p3'],
];

export function Welcome() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const onb = useOnboarding();
  const { short, tiny, sp } = useFit();
  // The drawing takes only the room left over, so the whole screen fits without scrolling.
  const [artBox, setArtBox] = useState({ w: 0, h: 0 });
  const artW = Math.min(280, artBox.w, (artBox.h * 300) / 230);
  const find = () => {
    // Coming back before signing up: continue where they left off, never re-ask.
    if (onb.active && ['side', 'wants', 'matches', 'phone', 'code'].includes(onb.step)) return router.push(`/start/${onb.step === 'code' ? 'phone' : onb.step}`);
    onb.start();
    router.push('/start/who');
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="welcome-screen">
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, space.lg) }]} bounces={false}>
        <View style={styles.column}>
          <View style={styles.brand}>
            <BrandMark size={34} />
            <Text variant="h3" color={colors.ivory} style={{ flexGrow: 1, flexShrink: 1, minWidth: 150, fontSize: 19 }} numberOfLines={1}>
              {t('common.appName')}
            </Text>
            <LanguageSwitcher tone="dark" compact />
          </View>
          <View style={{ marginTop: space.md }}>
            <InvitedBanner />
          </View>
          <Stagger delay={80} step={70} style={{ marginTop: sp(space.xxl) }}>
            <Text variant="display" color={colors.ivory} accessibilityRole="header" style={[styles.hello, short && { fontSize: tiny ? 30 : 34 }]}>
              {t('onb.welcome.title')}
            </Text>
            <Text variant="body" color={colors.sage} style={[styles.lede, short && { fontSize: 17, marginTop: space.sm }]}>
              {t('onb.welcome.lede')}
            </Text>
            <View style={[styles.promises, { gap: sp(space.md), marginTop: sp(space.xl) }]}>
              {PROMISES.map(([icon, key]) => (
                <View key={key} style={styles.promise}>
                  <Icon name={icon} size={24} color={colors.gold} />
                  <Text variant="body" color={colors.sage} style={{ flex: 1, fontSize: T.label + 1 }}>
                    {t(key)}
                  </Text>
                </View>
              ))}
            </View>
          </Stagger>
          <View style={[styles.art, { paddingVertical: sp(space.lg) }]} onLayout={(e) => setArtBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height - 2 * sp(space.lg) })}>
            {artW >= 120 ? (
              <FadeIn delay={320} rise={0} duration={600}>
                <Charminar width={artW} />
              </FadeIn>
            ) : null}
          </View>
          <View style={[styles.actions, { marginTop: 0 }]}>
            <Button label={t('onb.welcome.find')} kind="gold" onPress={find} full arrow testID="welcome-find-rishta" />
            <Text variant="caption" color="#CDA79C" center style={{ fontSize: T.small }}>
              {t('onb.welcome.findNote')}
            </Text>
            <Button label={t('onb.welcome.member')} kind="light" onPress={() => router.push('/login')} full testID="welcome-member-login" style={{ marginTop: space.sm }} />
            <View style={[styles.links, { marginTop: sp(space.md) }]}>
              <Text variant="caption" color={colors.sage} onPress={() => router.push('/welcome')} accessibilityRole="link" style={styles.link} testID="how-it-works">
                {t('auth.howItWorks')}
              </Text>
              <Text variant="caption" color={colors.sage} onPress={() => router.push('/legal/privacy')} accessibilityRole="link" style={styles.link}>
                {t('settings.privacyPolicy')}
              </Text>
              <Text variant="caption" color={colors.sage} onPress={() => router.push('/legal/help')} accessibilityRole="link" style={styles.link}>
                {t('settings.help')}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.emerald },
  scroll: { flexGrow: 1 },
  column: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: space.xl },
  brand: { flexWrap: 'wrap', rowGap: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.sm },
  hello: { fontSize: 40 },
  lede: { fontSize: 19, marginTop: space.md },
  promises: { gap: space.md, marginTop: space.xl },
  promise: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  art: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'flex-end' },
  actions: { gap: space.sm, marginTop: space.md },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.lg, marginTop: space.md },
  link: { textDecorationLine: 'underline' },
});
