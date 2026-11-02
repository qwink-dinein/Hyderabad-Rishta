import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChoiceTile, OnbScreen } from '@/components/onboarding/kit';
import type { LookingFor } from '@/domain/types';
import { useOnboarding } from '@/state/onboarding';
import { space } from '@/theme/tokens';

/**
 * Step 1b (only for "myself" / "a relative"): bride or groom — the partner question on its own screen,
 * kept apart from the questions about the member (owner request 2026-11-02). One tap moves on.
 */
export default function Side() {
  const { t } = useTranslation();
  const { answers, answer, reach } = useOnboarding();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    reach('side');
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reach]);
  if (!answers.createdFor) return <Redirect href="/start/who" />;
  const self = answers.createdFor === 'self';
  const pick = (v: LookingFor) => {
    answer({ lookingFor: v });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.push('/start/wants'), 220);
  };
  return (
    <OnbScreen step="side" title={t('onb.side.title')} subtitle={t(self ? 'onb.side.sub_you' : 'onb.side.sub_they')} testID="onb-side">
      <View style={{ gap: space.sm }}>
        <ChoiceTile icon="user" label={t('onb.wants.aBride')} selected={answers.lookingFor === 'bride'} onPress={() => pick('bride')} testID="side-bride" />
        <ChoiceTile icon="user" label={t('onb.wants.aGroom')} selected={answers.lookingFor === 'groom'} onPress={() => pick('groom')} testID="side-groom" />
      </View>
    </OnbScreen>
  );
}
