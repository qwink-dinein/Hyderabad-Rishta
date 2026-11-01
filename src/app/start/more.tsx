import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Chips, FollowUp, Group, OnbScreen, Stepper, T } from '@/components/onboarding/kit';
import { useDraft } from '@/components/onboarding/useDraft';
import { Button } from '@/components/ui/Button';
import { Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Select, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { subjectOf } from '@/domain/onboarding';
import { citiesOf, COUNTRIES, MARITAL_STATUS, MOTHER_TONGUES, statesOf } from '@/domain/options';
import { useOptions } from '@/hooks/useOptions';
import { useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

const TOP_TONGUES = ['urdu', 'dakhini', 'telugu', 'hindi', 'english'];

/**
 * Step 7: marital status (with follow-ups only when they apply), mother tongue and where they live
 * (pre-filled from the earlier answer, tap to change).
 */
export default function More() {
  const { t } = useTranslation();
  const errMsg = useErrorMessage();
  const toast = useToast((s) => s.show);
  const user = useSession((s) => s.user);
  const { reach } = useOnboarding();
  const { opts, plain } = useOptions();
  const { bd, setBd, loading, save, errorsFor } = useDraft();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editPlace, setEditPlace] = useState(false);
  useEffect(() => reach('more'), [reach]);
  if (!user) return <Redirect href="/start/phone" />;
  if (loading || !bd) return <Loading />;
  const b = bd.basic;
  const loc = bd.location;
  const ctx = subjectOf(b.createdFor || 'self', b.lookingFor || undefined);
  const before = !!b.maritalStatus && b.maritalStatus !== 'never_married';
  const otherTongue = !!b.motherTongue && !TOP_TONGUES.includes(b.motherTongue);
  const placeKnown = !!loc.country && !!loc.state && !!loc.city;
  const ready = !!b.maritalStatus && (!before || b.children != null) && !!b.motherTongue && placeKnown;
  const setBasic = (patch: Partial<typeof b>) => setBd({ ...bd, basic: { ...b, ...patch } });
  const setLoc = (patch: Partial<typeof loc>) => setBd({ ...bd, location: { ...loc, ...patch } });

  const next = async () => {
    const errs = { ...errorsFor(bd, 0, 'basic', ['maritalStatus', 'children', 'childrenNote', 'motherTongue']), ...errorsFor(bd, 1, 'location', ['country', 'state', 'city']) };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await save(bd);
      router.push('/start/work');
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  const err = (k: string) => (errors[k] ? <Text variant="caption" color={colors.dangerText}>{t(errors[k])}</Text> : null);

  return (
    <OnbScreen
      step="more"
      title={t('onb.more.title', { context: ctx, name: b.fullName.split(' ')[0] })}
      testID="onb-more"
      footer={<Button label={t('onb.next')} onPress={next} loading={busy} disabled={!ready} full testID="more-next" />}
    >
      <Group label={t('f.maritalStatus')}>
        <Chips
          label={t('f.maritalStatus')}
          options={MARITAL_STATUS.map((v) => ({ value: v, label: t(`opt.marital.${v}`) }))}
          value={b.maritalStatus || undefined}
          onChange={(v) => {
            const prev = v !== 'never_married';
            setBasic({ maritalStatus: v, children: prev ? b.children : undefined, childrenLiveWith: prev ? b.childrenLiveWith : undefined, childrenNote: prev ? b.childrenNote : undefined });
          }}
          testID="more-marital"
        />
        {err('maritalStatus')}
      </Group>
      {before ? (
        <FollowUp>
          <Group label={t('onb.more.children', { context: ctx })} hint={t('onb.more.childrenHint')}>
            <Stepper label={t('onb.more.children', { context: ctx })} value={b.children} onChange={(n) => setBasic({ children: n, ...(n === 0 ? { childrenLiveWith: undefined, childrenNote: undefined } : {}) })} testID="more-children" />
            {err('children')}
          </Group>
          {(b.children ?? 0) > 0 ? (
            <>
              <Group label={t('onb.more.liveWith', { context: ctx })} optional>
                <Chips label={t('onb.more.liveWith', { context: ctx })} options={opts('childrenLive') as { value: 'yes' | 'no' | 'sometimes'; label: string }[]} value={b.childrenLiveWith} onChange={(v) => setBasic({ childrenLiveWith: v })} testID="more-livewith" />
              </Group>
              <Group label={t('f.childrenNote')} optional>
                <TextField value={b.childrenNote} onChangeText={(v) => setBasic({ childrenNote: v })} multiline maxLength={300} placeholder={t('onb.more.notePlaceholder')} accessibilityLabel={t('f.childrenNote')} error={!!errors.childrenNote} testID="more-note" />
                {err('childrenNote')}
              </Group>
            </>
          ) : null}
        </FollowUp>
      ) : null}
      <Group label={t('f.motherTongue')}>
        <Chips
          label={t('f.motherTongue')}
          options={[...TOP_TONGUES.map((v) => ({ value: v, label: t(`opt.tongue.${v}`) })), { value: otherTongue ? b.motherTongue : 'other', label: otherTongue ? t(`opt.tongue.${b.motherTongue}`) : t('onb.more.otherTongue') }]}
          value={b.motherTongue || undefined}
          onChange={(v) => setBasic({ motherTongue: v })}
          testID="more-tongue"
        />
        {b.motherTongue === 'other' || otherTongue ? (
          <Select label={t('f.motherTongue')} options={MOTHER_TONGUES.filter((v) => !TOP_TONGUES.includes(v)).map((v) => ({ value: v, label: t(`opt.tongue.${v}`) }))} value={b.motherTongue} onChange={(v: string) => setBasic({ motherTongue: v })} />
        ) : null}
        {err('motherTongue')}
      </Group>
      <Group label={t('onb.more.livesIn', { context: ctx })}>
        {placeKnown && !editPlace ? (
          <PressableScale onPress={() => setEditPlace(true)} accessibilityRole="button" accessibilityLabel={t('onb.more.changePlace')} style={styles.place} testID="more-place">
            <Text variant="body" style={{ flex: 1, fontSize: T.body + 1 }}>{[loc.city, loc.state, loc.country].join(', ')}</Text>
            <Icon name="edit" size={18} color={colors.muted} />
          </PressableScale>
        ) : (
          <View style={{ gap: space.sm }}>
            <Select label={t('f.country')} options={plain(COUNTRIES)} allowCustom value={loc.country || undefined} onChange={(v: string) => setLoc({ country: v, state: '', city: '' })} />
            <Select label={t('f.state')} options={plain(statesOf(loc.country))} allowCustom value={loc.state || undefined} onChange={(v: string) => setLoc({ state: v, city: '' })} />
            <Select label={t('f.city')} options={plain(citiesOf(loc.country, loc.state))} allowCustom value={loc.city || undefined} onChange={(v: string) => setLoc({ city: v })} />
          </View>
        )}
        {placeKnown && !editPlace ? (
          <Text variant="caption" style={{ fontSize: T.small }}>
            {t('onb.more.placeHint')}
          </Text>
        ) : null}
        {err('city') || err('state') || err('country')}
      </Group>
    </OnbScreen>
  );
}

const styles = {
  place: { minHeight: 56, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: space.lg, gap: space.sm },
};
