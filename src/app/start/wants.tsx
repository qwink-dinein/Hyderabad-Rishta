import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChoiceTile, Chips, Group, OnbScreen } from '@/components/onboarding/kit';
import { useSubject } from '@/components/onboarding/useSubject';
import { Button } from '@/components/ui/Button';
import { AGE_BANDS, lookingForFor, REGIONS, type AgeBandId, type Region } from '@/domain/onboarding';
import type { LookingFor } from '@/domain/types';
import { useOnboarding } from '@/state/onboarding';
import { space } from '@/theme/tokens';

/** Step 2: the side (only if not implied), the age band and where — all taps. */
export default function Wants() {
  const { t } = useTranslation();
  const { answer, reach } = useOnboarding();
  const { answers, side, createdFor } = useSubject();
  useEffect(() => reach('wants'), [reach]);
  if (!answers.createdFor) return <Redirect href="/start/who" />;
  const implied = !!lookingForFor(createdFor);
  const ready = !!side && !!answers.ageBand && !!answers.region;
  return (
    <OnbScreen
      step="wants"
      title={side ? t('onb.wants.title', { context: side }) : t('onb.wants.titleAsk')}
      testID="onb-wants"
      footer={<Button label={t('onb.wants.show', { context: side ?? 'none' })} onPress={() => router.push('/start/matches')} disabled={!ready} full testID="wants-show" />}
    >
      {!implied ? (
        <Group label={t('onb.wants.lookingFor')}>
          <Chips<LookingFor>
            label={t('onb.wants.lookingFor')}
            options={[
              { value: 'bride', label: t('onb.wants.aBride') },
              { value: 'groom', label: t('onb.wants.aGroom') },
            ]}
            value={side}
            onChange={(v) => answer({ lookingFor: v })}
            testID="wants-side"
          />
        </Group>
      ) : null}
      <Group label={t('onb.wants.age', { context: side ?? 'none' })}>
        <Chips<AgeBandId>
          label={t('onb.wants.age', { context: side ?? 'none' })}
          options={AGE_BANDS.map((b) => ({ value: b.id, label: b.id === '33+' ? t('onb.wants.ageOver', { n: 33 }) : `\u2066${b.min}–${b.max}\u2069` }))}
          value={answers.ageBand}
          onChange={(v) => answer({ ageBand: v })}
          testID="wants-age"
        />
      </Group>
      <Group label={t('onb.wants.where', { context: side ?? 'none' })}>
        <View style={{ gap: space.sm }}>
          {REGIONS.map((r: Region) => (
            <ChoiceTile key={r} icon="mapPin" label={t(`onb.region.${r}`)} selected={answers.region === r} onPress={() => answer({ region: r })} testID={`wants-region-${r}`} />
          ))}
        </View>
      </Group>
    </OnbScreen>
  );
}
