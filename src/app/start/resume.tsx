import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/art/Illustrations';
import { T } from '@/components/onboarding/kit';
import { Button } from '@/components/ui/Button';
import { FadeIn, ProgressBar } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { isQKey, subjectOf } from '@/domain/onboarding';
import { useMyProfile } from '@/hooks/queries';
import { STEP_PROGRESS, useOnboarding } from '@/state/onboarding';
import { colors, space } from '@/theme/tokens';

/** Reopened the app halfway through: one tap continues at the exact question. */
export default function Resume() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { step, answers, reset } = useOnboarding();
  const { data: profile } = useMyProfile();
  const b = profile?.biodata.basic;
  const ctx = subjectOf(b?.createdFor || answers.createdFor || 'self', b?.lookingFor || answers.lookingFor);
  const name = b?.fullName?.split(' ')[0];
  // Before sign-up steps can't be resumed here (no account yet); after it, start at the first question.
  const at = isQKey(step) ? step : step === 'more' ? 'marital' : step === 'work' ? 'education' : 'name';
  const pct = Math.round(STEP_PROGRESS[at] * 100);
  // Copy groups: about him (name/dob/height), a little more (marital…city), work.
  const left = ['name', 'dob', 'height'].includes(at) ? 'about' : ['education', 'profession'].includes(at) ? 'work' : 'more';
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.lg, paddingBottom: Math.max(insets.bottom, space.lg) }]} testID="onb-resume">
      <View style={styles.column}>
        <BrandMark size={38} />
        <FadeIn delay={60}>
          <Text variant="display" color={colors.ivory} accessibilityRole="header" style={{ fontSize: 34, marginTop: space.xl }}>
            {t('onb.resume.title')}
          </Text>
        </FadeIn>
        <FadeIn delay={120}>
          <Text variant="body" color={colors.sage} style={{ fontSize: T.body + 1, marginTop: space.sm }}>
            {t(`onb.resume.left_${left}`, { pct, name: name ?? '', context: name ? undefined : ctx })}
          </Text>
        </FadeIn>
        <View style={{ flexDirection: 'row', marginTop: space.lg }}>
          <ProgressBar value={STEP_PROGRESS[at]} from={0} fill={colors.gold} track={colors.emeraldSoft} />
        </View>
      </View>
      <View style={[styles.column, { marginTop: 'auto', gap: space.sm }]}>
        <Button label={t('onb.resume.continue')} kind="gold" onPress={() => router.replace(`/start/q/${at}`)} full arrow testID="resume-continue" />
        <Button
          label={t('onb.resume.startOver')}
          kind="light"
          onPress={() => {
            reset();
            router.replace('/start/who');
          }}
          full
          testID="resume-restart"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.emerald },
  column: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: space.xl },
});
