import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChoiceTile, Chips, FollowUp, Group, OnbScreen, Stepper, T, UnitToggle, Wheel } from '@/components/onboarding/kit';
import { useDraft } from '@/components/onboarding/useDraft';
import { Button } from '@/components/ui/Button';
import { Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Select, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { ageFromDob } from '@/domain/format';
import { isQKey, onboardingGap, QUESTION_FIELDS, questionOrder, subjectOf, type QKey } from '@/domain/onboarding';
import { citiesOf, COUNTRIES, EDUCATION, MARITAL_STATUS, MOTHER_TONGUES, PROFESSION, statesOf } from '@/domain/options';
import type { Biodata } from '@/domain/types';
import { MAX_AGE, MIN_AGE } from '@/domain/validation';
import { useOptions } from '@/hooks/useOptions';
import { backend } from '@/services';
import { STEP_PROGRESS, useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthNames(lang: string) {
  try {
    const f = new Intl.DateTimeFormat(lang === 'ur' ? 'ur-IN' : lang === 'te' ? 'te-IN' : 'en-IN', { month: 'long' });
    return EN_MONTHS.map((_, i) => f.format(new Date(2000, i, 1)));
  } catch {
    return EN_MONTHS;
  }
}
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const pad = (n: number) => String(n).padStart(2, '0');
const INCHES = Array.from({ length: 84 - 54 + 1 }, (_, i) => 54 + i);
const cmOf = (inch: number) => Math.round(inch * 2.54);
const ftIn = (inch: number) => `${Math.floor(inch / 12)}′ ${inch % 12}″`;
const CMS = Array.from({ length: 214 - 137 + 1 }, (_, i) => 137 + i);
const TOP_TONGUES = ['urdu', 'dakhini', 'telugu', 'hindi', 'english'];

/**
 * After sign-up: ONE question per screen, sitting in the lower half next to the button (owner request
 * 2026-11-02: people read the lower half and skipped fields at the top). Choice questions move on with
 * one tap; every answer is saved before moving on, so leaving halfway loses nothing.
 */
export default function Question() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errMsg = useErrorMessage();
  const toast = useToast((s) => s.show);
  const lang = useSession((s) => s.lang);
  const user = useSession((s) => s.user);
  const { reach } = useOnboarding();
  const { opts, plain } = useOptions();
  const { bd, setBd, loading, save, errorsFor } = useDraft();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<'ft' | 'cm'>('ft');
  const [editPlace, setEditPlace] = useState(false);
  const [otherTongueOpen, setOtherTongueOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const months = useMemo(() => monthNames(lang), [lang]);
  const q = isQKey(key) ? key : null;
  useEffect(() => {
    if (q) reach(q);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, reach]);

  if (!q) return <Redirect href="/start/q/name" />;
  if (!user) return <Redirect href="/start/phone" />;
  if (loading || !bd) return <Loading />;

  const b = bd.basic;
  const ctx = subjectOf(b.createdFor || 'self', b.lookingFor || undefined);
  const tx = (k: string, opt: Record<string, unknown> = {}) => t(`onb.q.${k}`, { context: ctx, ...opt });
  const order = questionOrder(bd);
  const idx = Math.max(0, order.indexOf(q));
  const nextQ = order[idx + 1] as QKey | undefined;
  const count = t('onb.q.count', { n: idx + 1, total: order.length });
  const setBasic = (patch: Partial<Biodata['basic']>) => setBd({ ...bd, basic: { ...b, ...patch } });

  // Finish line: publish (or go to the exact missing answer).
  const finish = async (next: Biodata) => {
    const gap = onboardingGap(next);
    if (gap) {
      toast(t(gap === 'who' ? 'onb.gap.who' : 'onb.q.missing'), 'danger');
      return router.push(gap === 'who' ? '/start/who' : `/start/q/${gap}`);
    }
    const res = await backend.submitForPublication();
    void qc.invalidateQueries();
    if (res.order) return router.replace('/biodata/preview');
    router.replace({ pathname: '/start/live', params: { status: res.profile.status } });
  };

  // Validate this question's answer, save, then the next question (or finish).
  const advance = async (next: Biodata = bd) => {
    const { section, step, fields } = QUESTION_FIELDS[q];
    const errs = errorsFor(next, step, section, fields);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await save(next);
      const after = questionOrder(next);
      const n = after[after.indexOf(q) + 1];
      if (n) router.push(`/start/q/${n}`);
      else await finish(next);
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  // One tap = answer + move on (a short pause so the selection registers).
  const pick = (next: Biodata) => {
    setBd(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void advance(next), 220);
  };
  const err = (k: string) => (errors[k] ? <Text variant="caption" color={colors.dangerText}>{t(errors[k])}</Text> : null);
  const nextLabel = nextQ ? t('onb.q.nextTo', { what: t(`onb.q.what.${nextQ}`) }) : t('onb.work.finish');
  const nextButton = (enabled: boolean, label = nextLabel, with_?: () => Biodata) => (
    <Button label={label} kind={nextQ ? 'primary' : 'gold'} onPress={() => advance(with_ ? with_() : bd)} loading={busy} disabled={!enabled} full arrow={!!nextQ} testID="q-next" />
  );
  const tapFooter = (
    <Text variant="caption" center color={colors.success} style={{ fontSize: T.small }}>
      {t('onb.q.tapToGo')}
    </Text>
  );
  const screen = (title: string, hint: string | undefined, body: React.ReactNode, footer: React.ReactNode) => (
    <OnbScreen step={q} progress={STEP_PROGRESS[q]} title={title} subtitle={hint} count={count} low footer={footer} testID={`q-${q}`}>
      {body}
    </OnbScreen>
  );

  switch (q) {
    case 'name':
      return screen(
        tx('name'),
        tx('nameHint'),
        <>
          <TextField
            value={b.fullName}
            onChangeText={(v) => setBasic({ fullName: v })}
            autoCapitalize="words"
            autoComplete="name"
            autoFocus
            maxLength={80}
            returnKeyType="next"
            onSubmitEditing={() => b.fullName.trim().length >= 2 && advance()}
            accessibilityLabel={tx('name')}
            error={!!errors.fullName}
            style={{ fontSize: T.body + 3, minHeight: 60 }}
            testID="q-name-input"
          />
          {err('fullName')}
        </>,
        nextButton(b.fullName.trim().length >= 2),
      );

    case 'dob': {
      const isBride = b.lookingFor === 'groom';
      const minAge = isBride ? MIN_AGE.bride : MIN_AGE.groom;
      const thisYear = new Date().getFullYear();
      const years = Array.from({ length: Math.min(MAX_AGE, 60) - minAge + 1 }, (_, i) => thisYear - minAge - i);
      const [yy, mm, dd] = b.dob ? b.dob.split('-').map(Number) : [thisYear - (isBride ? 24 : 27), 1, 1];
      const setDob = (y: number, m: number, d: number) => setBasic({ dob: `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}` });
      return screen(
        tx('dob'),
        tx('dobHint'),
        <>
          <View style={{ flexDirection: 'row', gap: space.xs }} testID="q-dob">
            <Wheel width={70} label={t('f.day')} items={Array.from({ length: daysIn(yy, mm) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} value={String(dd)} onChange={(v) => setDob(yy, mm, Number(v))} testID="dob-day" />
            <Wheel grow label={t('f.month')} items={months.map((n, i) => ({ value: String(i + 1), label: n }))} value={String(mm)} onChange={(v) => setDob(yy, Number(v), dd)} testID="dob-month" />
            <Wheel width={96} label={t('f.year')} items={years.map((y) => ({ value: String(y), label: String(y) }))} value={String(yy)} onChange={(v) => setDob(Number(v), mm, dd)} testID="dob-year" />
          </View>
          {b.dob ? (
            <View style={styles.chip} testID="q-age">
              <Text variant="bodyStrong" color={colors.goldDeep}>
                {t('onb.q.ageChip', { age: ageFromDob(b.dob) })}
              </Text>
            </View>
          ) : null}
          {err('dob')}
        </>,
        // The wheels start on a sensible date; Next confirms what is shown.
        nextButton(true, nextLabel, () => ({ ...bd, basic: { ...b, dob: b.dob || `${yy}-${pad(mm)}-${pad(dd)}` } })),
      );
    }

    case 'height': {
      const items = unit === 'ft' ? INCHES.map((i) => ({ value: String(cmOf(i)), label: ftIn(i) })) : CMS.map((c) => ({ value: String(c), label: `${c} cm` }));
      const nearest = (cm: number) => items.reduce((best, it) => (Math.abs(Number(it.value) - cm) < Math.abs(Number(best.value) - cm) ? it : best), items[0]).value;
      const current = b.heightCm || (b.lookingFor === 'groom' ? 160 : 173);
      return screen(
        tx('height'),
        tx('heightHint'),
        <>
          <View style={{ alignItems: 'center' }}>
            <UnitToggle options={[{ value: 'ft', label: t('onb.about.ftIn') }, { value: 'cm', label: 'cm' }]} value={unit} onChange={setUnit} />
          </View>
          <Wheel label={t('f.height')} items={items} value={nearest(current)} onChange={(v) => setBasic({ heightCm: Number(v) })} testID="q-height-wheel" />
          {b.heightCm ? (
            <View style={styles.chip} testID="q-height-value">
              <Text variant="bodyStrong" color={colors.goldDeep}>{`${ftIn(Math.round(b.heightCm / 2.54))} · ${b.heightCm} cm`}</Text>
            </View>
          ) : null}
          {err('heightCm')}
        </>,
        // The wheel shows a sensible start; tapping Next confirms it.
        nextButton(true, nextLabel, () => ({ ...bd, basic: { ...b, heightCm: b.heightCm || Number(nearest(current)) } })),
      );
    }

    case 'marital':
      return screen(
        tx('marital'),
        t('onb.q.oneTap'),
        <View style={{ gap: space.sm }}>
          {MARITAL_STATUS.map((v) => (
            <ChoiceTile
              key={v}
              label={t(`opt.marital.${v}`)}
              selected={b.maritalStatus === v}
              onPress={() => {
                const prev = v !== 'never_married';
                pick({ ...bd, basic: { ...b, maritalStatus: v, children: prev ? b.children : undefined, childrenLiveWith: prev ? b.childrenLiveWith : undefined, childrenNote: prev ? b.childrenNote : undefined } });
              }}
              testID={`q-marital-${v}`}
            />
          ))}
          {err('maritalStatus')}
        </View>,
        tapFooter,
      );

    case 'children':
      return screen(
        tx('children'),
        t('onb.q.childrenHint'),
        <>
          <View style={{ alignItems: 'center' }}>
            <Stepper label={tx('children')} value={b.children} onChange={(n) => setBasic({ children: n, ...(n === 0 ? { childrenLiveWith: undefined, childrenNote: undefined } : {}) })} testID="q-children" />
          </View>
          {err('children')}
          {(b.children ?? 0) > 0 ? (
            <FollowUp>
              <Group label={t('onb.more.liveWith', { context: ctx })} optional>
                <Chips label={t('onb.more.liveWith', { context: ctx })} options={opts('childrenLive') as { value: 'yes' | 'no' | 'sometimes'; label: string }[]} value={b.childrenLiveWith} onChange={(v) => setBasic({ childrenLiveWith: v })} testID="q-livewith" />
              </Group>
              <Group label={t('f.childrenNote')} optional>
                <TextField value={b.childrenNote} onChangeText={(v) => setBasic({ childrenNote: v })} multiline maxLength={300} placeholder={t('onb.more.notePlaceholder')} accessibilityLabel={t('f.childrenNote')} error={!!errors.childrenNote} testID="q-note" />
                {err('childrenNote')}
              </Group>
            </FollowUp>
          ) : null}
        </>,
        nextButton(b.children != null),
      );

    case 'tongue': {
      const other = !!b.motherTongue && !TOP_TONGUES.includes(b.motherTongue);
      return screen(
        tx('tongue'),
        t('onb.q.tongueHint'),
        <>
          <View style={styles.grid}>
            {TOP_TONGUES.map((v) => (
              <View key={v} style={styles.cell}>
                <ChoiceTile compact label={t(`opt.tongue.${v}`)} selected={b.motherTongue === v} onPress={() => pick({ ...bd, basic: { ...b, motherTongue: v } })} testID={`q-tongue-${v}`} />
              </View>
            ))}
            <View style={styles.cell}>
              <ChoiceTile compact label={other ? t(`opt.tongue.${b.motherTongue}`) : t('onb.more.otherTongue')} selected={other || otherTongueOpen} onPress={() => setOtherTongueOpen(true)} testID="q-tongue-other" />
            </View>
          </View>
          {otherTongueOpen || other ? (
            <Select
              label={t('f.motherTongue')}
              options={MOTHER_TONGUES.filter((v) => !TOP_TONGUES.includes(v)).map((v) => ({ value: v, label: t(`opt.tongue.${v}`) }))}
              value={other ? b.motherTongue : undefined}
              onChange={(v: string) => pick({ ...bd, basic: { ...b, motherTongue: v } })}
            />
          ) : null}
          {err('motherTongue')}
        </>,
        tapFooter,
      );
    }

    case 'city': {
      const loc = bd.location;
      const known = !!loc.country && !!loc.state && !!loc.city;
      const setLoc = (patch: Partial<typeof loc>) => setBd({ ...bd, location: { ...loc, ...patch } });
      const editing = editPlace || !known;
      return screen(
        tx('city'),
        editing ? t('onb.q.cityPick') : t('onb.q.cityKnown'),
        editing ? (
          <View style={{ gap: space.sm }}>
            <Select label={t('f.country')} options={plain(COUNTRIES)} allowCustom value={loc.country || undefined} onChange={(v: string) => setLoc({ country: v, state: '', city: '' })} />
            <Select label={t('f.state')} options={plain(statesOf(loc.country))} allowCustom value={loc.state || undefined} onChange={(v: string) => setLoc({ state: v, city: '' })} />
            <Select label={t('f.city')} options={plain(citiesOf(loc.country, loc.state))} allowCustom value={loc.city || undefined} onChange={(v: string) => setLoc({ city: v })} />
            {err('city') || err('state') || err('country')}
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <View style={styles.place} testID="q-place">
              <View style={styles.pin}>
                <Icon name="mapPin" size={20} color={colors.emerald} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" style={{ fontSize: T.body + 2 }}>{loc.city}</Text>
                <Text variant="caption">{[loc.state, loc.country].filter(Boolean).join(', ')}</Text>
              </View>
              <Icon name="check" size={22} color={colors.success} />
            </View>
            <PressableScale onPress={() => setEditPlace(true)} accessibilityRole="button" style={{ alignSelf: 'center', padding: space.sm }} testID="q-place-change">
              <Text variant="label" color={colors.emerald} style={{ textDecorationLine: 'underline' }}>
                {t('onb.q.cityChange')}
              </Text>
            </PressableScale>
          </View>
        ),
        nextButton(known, editing ? nextLabel : t('onb.q.cityYes')),
      );
    }

    case 'education':
    case 'profession': {
      const c = bd.career;
      const field = q;
      const otherKey = q === 'education' ? 'educationOther' : 'professionOther';
      const values: readonly string[] = q === 'education' ? EDUCATION : PROFESSION;
      const value = c[field];
      const otherText = c[otherKey];
      const setCareer = (patch: Partial<typeof c>) => setBd({ ...bd, career: { ...c, ...patch } });
      const isOther = value === 'other';
      return screen(
        tx(q),
        t(q === 'education' ? 'onb.q.educationHint' : 'onb.q.professionHint'),
        <>
          <View style={styles.grid}>
            {values.map((v) => (
              <View key={v} style={styles.cell}>
                <ChoiceTile
                  compact
                  label={t(`opt.${q}.${v}`)}
                  selected={value === v}
                  onPress={() => {
                    const next = { ...bd, career: { ...c, [field]: v, [otherKey]: v === 'other' ? otherText : undefined } };
                    // "Other" needs a few words first; every other answer moves on (or finishes) at once.
                    if (v === 'other') setBd(next);
                    else pick(next);
                  }}
                  testID={`q-${q}-${v}`}
                />
              </View>
            ))}
          </View>
          {isOther ? (
            <FollowUp>
              <Group label={t('onb.q.otherWrite')}>
                <TextField value={otherText} onChangeText={(v) => setCareer({ [otherKey]: v })} autoFocus maxLength={80} accessibilityLabel={t('onb.q.otherWrite')} error={!!errors[otherKey]} testID={`q-${q}-other-text`} />
                {err(otherKey)}
              </Group>
            </FollowUp>
          ) : null}
          {err(field)}
        </>,
        isOther ? nextButton(!!otherText?.trim()) : tapFooter,
      );
    }
  }
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'center', paddingHorizontal: space.lg, height: 40, borderRadius: radius.pill, backgroundColor: colors.goldSoft, justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  cell: { width: '50%', padding: space.xs },
  place: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.emerald, backgroundColor: colors.white },
  pin: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FBF0EE', alignItems: 'center', justifyContent: 'center' },
});
