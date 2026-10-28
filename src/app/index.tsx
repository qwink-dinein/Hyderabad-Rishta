import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HeroCarousel } from '@/components/HeroCarousel';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/feedback';
import { Icon, StarMotif, type IconName } from '@/components/ui/Icon';
import { Card, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { isAdminRole } from '@/domain/types';
import { backendInfo } from '@/services';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Landing page (PRD §5). No testimonials, user counts or badges — nothing fabricated. */
export default function Landing() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  if (user) return <Redirect href={isAdminRole(user.role) ? '/admin' : '/discover'} />;

  const steps: { icon: IconName; key: 'how1' | 'how2' | 'how3' }[] = [
    { icon: 'user', key: 'how1' },
    { icon: 'search', key: 'how2' },
    { icon: 'shield', key: 'how3' },
  ];

  return (
    <Screen>
      <Row style={styles.top}>
        <Row gap={space.sm}>
          <StarMotif size={28} color={colors.emerald} />
          <Text variant="h2">{t('common.appName')}</Text>
        </Row>
        <LanguageSwitcher />
      </Row>

      <View style={{ gap: space.md, marginVertical: space.lg }}>
        <Text variant="display" accessibilityRole="header">
          {t('landing.headline')}
        </Text>
        <Text variant="body" color={colors.muted}>
          {t('landing.sub')}
        </Text>
      </View>

      <View style={{ gap: space.sm, marginBottom: space.xl }}>
        <Button label={t('landing.findMatch')} onPress={() => router.push({ pathname: '/login', params: { next: 'discover' } })} full testID="cta-find" />
        <Button label={t('landing.createBiodata')} kind="secondary" onPress={() => router.push({ pathname: '/login', params: { next: 'biodata' } })} full testID="cta-create" />
        <Button label={t('landing.login')} kind="ghost" onPress={() => router.push('/login')} />
      </View>

      <HeroCarousel />

      <Text variant="h2" style={{ marginTop: space.xxl, marginBottom: space.md }} accessibilityRole="header">
        {t('landing.howTitle')}
      </Text>
      <View style={{ gap: space.md }}>
        {steps.map((s, i) => (
          <Card key={s.key} style={styles.step}>
            <View style={styles.stepIcon}>
              <Icon name={s.icon} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="overline">{String(i + 1).padStart(2, '0')}</Text>
              <Text variant="h3">{t(`landing.${s.key}.title`)}</Text>
              <Text variant="caption">{t(`landing.${s.key}.body`)}</Text>
            </View>
          </Card>
        ))}
      </View>

      {backendInfo.kind === 'demo' ? (
        <View style={{ marginTop: space.xl }}>
          <Banner tone="warning" icon="sparkle">
            {t('common.demoBanner')}
          </Banner>
        </View>
      ) : null}
      <Row style={{ justifyContent: 'center', marginTop: space.xl }} gap={space.lg}>
        <Text variant="caption" onPress={() => router.push('/legal/privacy')} accessibilityRole="link">
          {t('settings.privacyPolicy')}
        </Text>
        <Text variant="caption" onPress={() => router.push('/legal/terms')} accessibilityRole="link">
          {t('settings.terms')}
        </Text>
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { justifyContent: 'space-between', paddingVertical: space.md, flexWrap: 'wrap', gap: space.sm },
  step: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  stepIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
});
