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

/**
 * Step 2: the side (only if not implied), then the age and home of the person the biodata is FOR — all
 * taps. (Owner request 2026-11-02: asking for the partner's age and place confused families.) The partner
 * age range for the preview and the saved preference is worked out from this.
 */
export default function Wants() {
  const { t } = useTranslation();
  const { answer, reach } = useOnboarding();
  const { answers, side, createdFor } = useSubject();
  useEffect(() => reach('wants'), [reach]);
  if (!answers.createdFor) return <Redirect href="/start/who" />;
  const implied = !!lookingForFor(createdFor);
  // Who we're asking about: "you" for one's own biodata, else him / her once the side is known.
  const who = createdFor === 'self' ? 'you' : side === 'bride' ? 'he' : side === 'groom' ? 'she' : 'they';
  const ready = !!side && !!answers.ageBand && !!answers.region;
  return (
    <OnbScreen
      step="wants"
      title={t(`onb.wants.title_${who}`)}
      subtitle={t('onb.wants.sub')}
      testID="onb-wants"
      footer={<Button label={t('onb.wants.show', { context: side ?? 'none' })} onPress={() => router.push('/start/matches')} disabled={!ready} full testID="wants-show" />}
    >
      {!implied ? (
        <Group label={t(createdFor === 'self' ? 'onb.wants.lookingForSelf' : 'onb.wants.lookingFor')}>
          <Chips<LookingFor>
            label={t(createdFor === 'self' ? 'onb.wants.lookingForSelf' : 'onb.wants.lookingFor')}
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
      <Group label={t(`onb.wants.age_${who}`)}>
        <Chips<AgeBandId>
          label={t(`onb.wants.age_${who}`)}
          options={AGE_BANDS.map((b) => ({ value: b.id, label: b.id === '33+' ? t('onb.wants.ageOver', { n: 33 }) : `\u2066${b.min}–${b.max}\u2069` }))}
          value={answers.ageBand}
          onChange={(v) => answer({ ageBand: v })}
          testID="wants-age"
        />
      </Group>
      <Group label={t(`onb.wants.where_${who}`)}>
        <View style={{ gap: space.sm }}>
          {REGIONS.map((r: Region) => (
            <ChoiceTile key={r} icon="mapPin" label={t(`onb.wants.lives.${r}`)} selected={answers.region === r} onPress={() => answer({ region: r })} testID={`wants-region-${r}`} />
          ))}
        </View>
      </Group>
    </OnbScreen>
  );
}
