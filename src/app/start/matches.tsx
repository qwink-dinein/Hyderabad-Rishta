import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { OnbScreen, T } from '@/components/onboarding/kit';
import { useSubject } from '@/components/onboarding/useSubject';
import { seedDraft } from '@/components/onboarding/signIn';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Stagger } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { partnerAgeRange, previewRegion } from '@/domain/onboarding';
import { qk } from '@/hooks/queries';
import { useOptions } from '@/hooks/useOptions';
import { backend } from '@/services';
import { STEP_PROGRESS, useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

const TINTS = ['#EDE3F0', '#EFE4D4', '#DCEBE3', '#E3E3F0', '#F1E2D6'];

/** Step 3: real matching profiles BEFORE any number is asked — a live count and 3 safe rows. */
export default function Matches() {
  const { t } = useTranslation();
  const { label } = useOptions();
  const { reach } = useOnboarding();
  const { answers, side, ctx } = useSubject();
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  useEffect(() => reach('matches'), [reach]);
  // Already signed in (came from the login screen): save these answers to the biodata right away.
  const next = async () => {
    if (!user) return router.push('/start/phone');
    setSaving(true);
    try {
      const p = await seedDraft(answers);
      if (p) qc.setQueryData(qk.myProfile, p);
    } catch {
      // The next screens merge the answers in again and save them, so carrying on is safe.
    } finally {
      setSaving(false);
    }
    router.push('/start/q/name');
  };
  const band = partnerAgeRange(answers);
  const region = previewRegion(answers.region);
  const q = useQuery({
    queryKey: ['matchPreview', side, band?.min, band?.max, region],
    queryFn: () => backend.getMatchPreview({ show: side!, ageMin: band?.min, ageMax: band?.max, region }),
    enabled: !!side,
    staleTime: 60_000,
  });
  if (!side) return <Redirect href="/start/wants" />;
  const count = q.data?.count ?? 0;
  const where = region ? t(`onb.region.${region}`) : '';
  const ages = band ? (band.max >= 60 ? t('onb.wants.ageOver', { n: band.min }) : `\u2066${band.min}–${band.max}\u2069`) : '';
  const title = q.isLoading ? t('onb.matches.finding', { context: side }) : count > 0 ? t('onb.matches.title', { count, context: side }) : t('onb.matches.none', { context: side });
  return (
    <OnbScreen
      step="matches"
      title={title}
      subtitle={q.isLoading ? undefined : count > 0 ? t('onb.matches.sub', { ages, where }) : t('onb.matches.noneSub')}
      testID="onb-matches"
      footer={
        <View style={{ gap: space.sm }}>
          <Button label={t('onb.matches.save')} onPress={next} loading={saving} full arrow testID="matches-save" />
          <Text variant="caption" center style={{ fontSize: T.small }}>
            {t('onb.matches.note')}
          </Text>
        </View>
      }
    >
      {count > 0 && q.data ? (
        <View style={styles.card} testID="matches-list">
          <Stagger step={60} rise={8}>
            {q.data.items.map((it, i) => (
              <View key={i} style={[styles.row, i > 0 && styles.rule]}>
                <View style={[styles.avatar, { backgroundColor: TINTS[i % TINTS.length] }]}>
                  <Text variant="h2" color={colors.charcoal}>
                    {it.initial || '•'}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" style={{ fontSize: T.body + 1 }}>{`${it.initial || '•'}., ${it.age}`}</Text>
                  <Text variant="caption" style={{ fontSize: T.label }}>
                    {[label('profession', it.profession, it.professionOther), it.city].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Icon name="lock" size={20} color={colors.muted} />
              </View>
            ))}
          </Stagger>
          {count > q.data.items.length ? (
            <Text variant="label" color={colors.muted} center style={[styles.more, styles.rule]}>
              {t('onb.matches.more', { n: count - q.data.items.length })}
            </Text>
          ) : null}
        </View>
      ) : null}
      {!q.isLoading ? (
        <View style={styles.done}>
          <Icon name="sparkle" size={22} color={colors.emerald} />
          <Text variant="body" style={{ flex: 1, fontSize: T.label + 1 }}>
            {t('onb.matches.already', { context: ctx, pct: Math.round(STEP_PROGRESS.matches * 100) })}
          </Text>
        </View>
      ) : null}
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  rule: { borderTopWidth: 1, borderTopColor: colors.border },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  more: { paddingVertical: space.md },
  done: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.goldSoft },
});
