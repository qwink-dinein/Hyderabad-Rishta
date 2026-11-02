import { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FollowUp, Group, OnbScreen } from '@/components/onboarding/kit';
import { useDraft } from '@/components/onboarding/useDraft';
import { Button } from '@/components/ui/Button';
import { Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Select, TextField } from '@/components/ui/forms';
import { Text } from '@/components/ui/Text';
import { onboardingGap } from '@/domain/onboarding';
import { useOptions } from '@/hooks/useOptions';
import { backend } from '@/services';
import { useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

/** Step 8: education and work (search lists; "Other" asks them to write it). Gold button = finish line. */
export default function Work() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errMsg = useErrorMessage();
  const toast = useToast((s) => s.show);
  const user = useSession((s) => s.user);
  const { reach } = useOnboarding();
  const { opts } = useOptions();
  const { bd, setBd, loading, save, errorsFor } = useDraft();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => reach('work'), [reach]);
  if (!user) return <Redirect href="/start/phone" />;
  if (loading || !bd) return <Loading />;
  const c = bd.career;
  const setCareer = (patch: Partial<typeof c>) => setBd({ ...bd, career: { ...c, ...patch } });
  const ready = !!c.education && !!c.profession && (c.education !== 'other' || !!c.educationOther?.trim()) && (c.profession !== 'other' || !!c.professionOther?.trim());

  const finish = async () => {
    const errs = errorsFor(bd, 2, 'career', ['education', 'educationOther', 'profession', 'professionOther']);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await save(bd);
      // Something needed earlier is missing (e.g. who the biodata is for): go to that screen and say so.
      const gap = onboardingGap(bd);
      if (gap) {
        toast(t(`onb.gap.${gap}`), 'danger');
        return router.push(`/start/${gap}`);
      }
      const res = await backend.submitForPublication();
      void qc.invalidateQueries();
      // A publication fee (if the team switches one on) is paid on the existing preview screen.
      if (res.order) return router.replace('/biodata/preview');
      router.replace({ pathname: '/start/live', params: { status: res.profile.status } });
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  const err = (k: string) => (errors[k] ? <Text variant="caption" color={colors.dangerText}>{t(errors[k])}</Text> : null);
  return (
    <OnbScreen
      step="work"
      title={t('onb.work.title')}
      testID="onb-work"
      footer={<Button label={t('onb.work.finish')} kind="gold" onPress={finish} loading={busy} disabled={!ready} full testID="work-finish" />}
    >
      <Group label={t('f.education')}>
        <Select label={t('f.education')} options={opts('education')} value={c.education || undefined} onChange={(v: string) => setCareer({ education: v, educationOther: v === 'other' ? c.educationOther : undefined })} error={!!errors.education} />
        {err('education')}
      </Group>
      {c.education === 'other' ? (
        <FollowUp>
          <Group label={t('f.educationOther')}>
            <TextField value={c.educationOther} onChangeText={(v) => setCareer({ educationOther: v })} maxLength={80} accessibilityLabel={t('f.educationOther')} error={!!errors.educationOther} testID="work-education-other" />
            {err('educationOther')}
          </Group>
        </FollowUp>
      ) : null}
      <Group label={t('onb.work.profession')}>
        <Select label={t('f.profession')} options={opts('profession')} value={c.profession || undefined} onChange={(v: string) => setCareer({ profession: v, professionOther: v === 'other' ? c.professionOther : undefined })} error={!!errors.profession} />
        {err('profession')}
      </Group>
      {c.profession === 'other' ? (
        <FollowUp>
          <Group label={t('f.professionOther')}>
            <TextField value={c.professionOther} onChangeText={(v) => setCareer({ professionOther: v })} maxLength={80} accessibilityLabel={t('f.professionOther')} error={!!errors.professionOther} testID="work-profession-other" />
            {err('professionOther')}
          </Group>
        </FollowUp>
      ) : null}
    </OnbScreen>
  );
}
