import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChoiceTile, OnbScreen, T } from '@/components/onboarding/kit';
import { Text } from '@/components/ui/Text';
import type { IconName } from '@/components/ui/Icon';
import { lookingForFor } from '@/domain/onboarding';
import { useOnboarding } from '@/state/onboarding';
import { space } from '@/theme/tokens';

const WHO: [string, IconName][] = [
  ['self', 'user'],
  ['son', 'user'],
  ['daughter', 'user'],
  ['brother', 'users'],
  ['sister', 'users'],
  ['relative', 'users'],
];

/** Step 1: who the rishta is for. One tap moves on (no Continue button). */
export default function Who() {
  const { t } = useTranslation();
  const { answers, answer, reach } = useOnboarding();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    reach('who');
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reach]);
  const pick = (v: string) => {
    const side = lookingForFor(v);
    answer({ createdFor: v, lookingFor: side ?? (answers.createdFor === v ? answers.lookingFor : undefined) });
    // Let the selection register visually (≈220 ms), then move on.
    if (timer.current) clearTimeout(timer.current);
    // Bride/groom is implied for son/daughter/brother/sister; otherwise it gets its own screen.
    timer.current = setTimeout(() => router.push(side ? '/start/wants' : '/start/side'), 220);
  };
  return (
    <OnbScreen step="who" title={t('onb.who.title')} subtitle={t('onb.who.sub')} testID="onb-who">
      <View style={styles.grid}>
        {WHO.map(([v, icon]) => (
          <View key={v} style={styles.cell}>
            <ChoiceTile tall icon={icon} label={t(`onb.who.${v}`)} selected={answers.createdFor === v} onPress={() => pick(v)} testID={`who-${v}`} />
          </View>
        ))}
      </View>
      <Text variant="caption" center style={{ fontSize: T.small }}>
        {t('onb.who.hint')}
      </Text>
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  cell: { width: '50%', padding: space.xs },
});
