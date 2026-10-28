import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/art/Illustrations';
import { BoostPanel } from '@/components/BoostPanel';
import { TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { useBoostNudge } from '@/hooks/useBoostNudge';
import { useMyProfile } from '@/hooks/queries';
import { colors, radius, space } from '@/theme/tokens';

/** Centre tab (owner request 2026-10-28): what a boost does, its status and reach, and boosting itself. */
export default function BoostScreen() {
  const { t } = useTranslation();
  const nudge = useBoostNudge();
  const { data: profile } = useMyProfile();

  const how = (icon: IconName, text: string) => (
    <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
      <View style={styles.howIcon}>
        <Icon name={icon} size={16} color={colors.emerald} />
      </View>
      <Text variant="body" style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );

  return (
    <Screen header={<TabHeader title={t('boost.title')} settings />}>
      <LinearGradient colors={[colors.forest, colors.emerald]} style={styles.hero}>
        <View style={styles.heroMark} pointerEvents="none">
          <BrandMark size={150} />
        </View>
        <View style={styles.heroStar}>
          <Icon name="star" size={26} color={colors.emerald} />
        </View>
        <Text variant="h1" color={colors.ivory} accessibilityRole="header">
          {t('boost.heroTitle')}
        </Text>
        <Text variant="body" color={colors.sage}>
          {t('boost.heroBody')}
        </Text>
      </LinearGradient>

      <Card style={{ gap: space.md, marginTop: space.lg }}>
        {how('users', t('boost.how1'))}
        {how('sparkle', t('boost.how2'))}
        {how('eye', t('boost.how3'))}
      </Card>

      <View style={{ marginTop: space.lg }}>
        {nudge === null ? (
          <Loading />
        ) : nudge === 'no_profile' ? (
          <Card style={{ gap: space.sm, alignItems: 'flex-start' }}>
            <Text variant="h3">{t('boost.noProfileTitle')}</Text>
            <Text variant="body">{t('boost.noProfileBody')}</Text>
            <Button label={t('dashboard.createCta')} onPress={() => router.push('/biodata')} testID="boost-create" />
          </Card>
        ) : nudge === 'not_published' ? (
          <View style={{ gap: space.lg }}>
          <Card style={{ gap: space.sm, alignItems: 'flex-start' }}>
            <Text variant="h3">{t('boost.notPublishedTitle')}</Text>
            <Text variant="body">{t('boost.notPublishedBody')}</Text>
            <Button
              label={t('boost.notPublishedCta')}
              onPress={() => router.push(profile && profile.lastStep >= 7 ? '/biodata/preview' : '/dashboard')}
              testID="boost-publish"
            />
          </Card>
          <BoostPanel />
          </View>
        ) : (
          <BoostPanel />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: space.md, borderRadius: radius.lg, padding: space.xl, gap: space.sm, overflow: 'hidden' },
  heroMark: { position: 'absolute', right: -30, top: -30, opacity: 0.18 },
  heroStar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  howIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
});
