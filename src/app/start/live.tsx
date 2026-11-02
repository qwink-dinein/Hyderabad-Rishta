import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '@/components/onboarding/kit';
import { InviteAfterLive } from '@/components/referral/ReferralCards';
import { Button } from '@/components/ui/Button';
import { Icon, type IconName } from '@/components/ui/Icon';
import { FadeIn, PopIn, PressableScale } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { partnerAgeRange, previewRegion, subjectOf } from '@/domain/onboarding';
import { useMyProfile } from '@/hooks/queries';
import { backend } from '@/services';
import { celebrate, haptic } from '@/services/feedback';
import { useOnboarding } from '@/state/onboarding';
import { colors, radius, space } from '@/theme/tokens';

/** The win screen: the biodata is live (or with the team for review). Extras are one-tap suggestions. */
export default function Live() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const { data: profile } = useMyProfile();
  const [answers] = useState(() => useOnboarding.getState().answers);
  const band = partnerAgeRange(answers);
  const region = previewRegion(answers.region);
  const side = profile?.biodata.basic.lookingFor ?? answers.lookingFor;
  const { data: preview } = useQuery({
    queryKey: ['matchPreview', side, band?.min, band?.max, region],
    queryFn: () => backend.getMatchPreview({ show: side!, ageMin: band?.min, ageMax: band?.max, region }),
    enabled: !!side,
  });
  useEffect(() => {
    useOnboarding.getState().finish(); // the journey is over: reopening the app goes Home
  }, []);
  const published = status === 'published';
  const b = profile?.biodata.basic;
  const ctx = subjectOf(b?.createdFor || 'self', b?.lookingFor || undefined);
  const name = b?.fullName.split(' ')[0] ?? '';
  const count = preview?.count ?? 0;
  const extras: [IconName, string, string][] = [
    ['camera', 'onb.live.photo', '/biodata?step=0&focus=photos'],
    ['users', 'onb.live.family', '/biodata?step=4&focus=familyType'],
    ['edit', 'onb.live.aboutMe', '/biodata?step=0&focus=aboutMe'],
  ];
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xxl, paddingBottom: Math.max(insets.bottom, space.lg) }]} testID="onb-live">
      <View style={styles.column}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <PopIn
            delay={150}
            onShown={() => {
              haptic('success');
              if (published) celebrate('published');
            }}
          >
            <View style={styles.badge}>
              <Icon name="check" size={48} color={colors.success} strokeWidth={2.6} />
            </View>
          </PopIn>
          <FadeIn delay={260}>
            <Text variant="display" center accessibilityRole="header" style={{ fontSize: 32 }}>
              {published ? t('onb.live.title', { name: name || t('onb.live.your'), context: ctx === 'you' ? 'you' : undefined }) : t('onb.live.reviewTitle')}
            </Text>
          </FadeIn>
          <FadeIn delay={320}>
            <Text variant="body" color={colors.muted} center style={{ fontSize: T.body }}>
              {published ? (count > 0 ? t('onb.live.sub', { count, context: side }) : t('onb.live.subNone')) : t('onb.live.reviewSub')}
            </Text>
          </FadeIn>
        </View>
        <FadeIn delay={420} style={styles.card}>
          <Text variant="bodyStrong" style={{ fontSize: T.label + 1, marginBottom: space.xs }}>
            {t('onb.live.moreReplies')}
          </Text>
          {extras.map(([icon, key, href]) => (
            <PressableScale key={key} onPress={() => router.push(href as never)} style={styles.extra} accessibilityRole="button" accessibilityLabel={t(key, { context: ctx })}>
              <Icon name={icon} size={22} color={colors.emerald} />
              <Text variant="body" style={{ flex: 1, fontSize: T.label + 1 }}>
                {t(key, { context: ctx })}
              </Text>
              <Text variant="bodyStrong" color={colors.emerald}>
                {t('onb.live.add')}
              </Text>
            </PressableScale>
          ))}
        </FadeIn>
        {published ? <InviteAfterLive /> : null}
      </View>
      <View style={[styles.column, { marginTop: 'auto' }]}>
        <Button
          label={count > 0 ? t('onb.live.see', { count, context: side }) : t('onb.live.explore')}
          onPress={() => router.replace('/discover')}
          full
          arrow
          testID="live-see-matches"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space.xl, gap: space.xl },
  badge: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.sm, marginTop: space.xl },
  extra: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
});
