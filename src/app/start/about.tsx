import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Group, OnbScreen, T, UnitToggle, Wheel, WheelField } from '@/components/onboarding/kit';
import { useDraft } from '@/components/onboarding/useDraft';
import { Button } from '@/components/ui/Button';
import { Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/forms';
import { Text } from '@/components/ui/Text';
import { subjectOf } from '@/domain/onboarding';
import { ageFromDob } from '@/domain/format';
import { MAX_AGE, MIN_AGE } from '@/domain/validation';
import { useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

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

/** Heights one inch apart from 4′6″ to 7′0″ (stored in cm), or every cm in cm mode. */
const INCHES = Array.from({ length: 84 - 54 + 1 }, (_, i) => 54 + i);
const cmOf = (inch: number) => Math.round(inch * 2.54);
const ftIn = (inch: number) => `${Math.floor(inch / 12)}′ ${inch % 12}″`;
const CMS = Array.from({ length: 214 - 137 + 1 }, (_, i) => 137 + i);

/** Step 6: name, date of birth (scroll wheels, no typing dates) and height (a full scroll list). */
export default function About() {
  const { t } = useTranslation();
  const errMsg = useErrorMessage();
  const toast = useToast((s) => s.show);
  const lang = useSession((s) => s.lang);
  const user = useSession((s) => s.user);
  const { reach } = useOnboarding();
  const { bd, setBd, loading, save, errorsFor } = useDraft();
  const [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState<'ft' | 'cm'>('ft');
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => reach('about'), [reach]);
  const months = useMemo(() => monthNames(lang), [lang]);
  if (!user) return <Redirect href="/start/phone" />;
  if (loading || !bd) return <Loading />;
  const b = bd.basic;
  const ctx = subjectOf(b.createdFor || 'self', b.lookingFor || undefined);
  const isBride = b.lookingFor === 'groom';
  const minAge = isBride ? MIN_AGE.bride : MIN_AGE.groom;
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: Math.min(MAX_AGE, 60) - minAge + 1 }, (_, i) => thisYear - minAge - i);
  const [yy, mm, dd] = b.dob ? b.dob.split('-').map(Number) : [thisYear - (isBride ? 24 : 27), 1, 1];
  const setDob = (y: number, m: number, d: number) => setBd({ ...bd, basic: { ...b, dob: `${y}-${pad(m)}-${pad(Math.min(d, daysIn(y, m)))}` } });
  const heightItems = unit === 'ft' ? INCHES.map((i) => ({ value: String(cmOf(i)), label: ftIn(i), sub: `${cmOf(i)} cm` })) : CMS.map((c) => ({ value: String(c), label: `${c} cm`, sub: ftIn(Math.round(c / 2.54)) }));
  const nearest = (cm: number) => heightItems.reduce((best, it) => (Math.abs(Number(it.value) - cm) < Math.abs(Number(best.value) - cm) ? it : best), heightItems[0]).value;
  const heightDisplay = b.heightCm ? `${ftIn(Math.round(b.heightCm / 2.54))} · ${b.heightCm} cm` : undefined;
  const ready = b.fullName.trim().length >= 2 && !!b.dob && !!b.heightCm;

  const next = async () => {
    const errs = errorsFor(bd, 0, 'basic', ['fullName', 'dob', 'heightCm']);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await save(bd);
      router.push('/start/more');
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <OnbScreen
      step="about"
      title={t('onb.about.title', { context: ctx })}
      subtitle={t('onb.about.sub')}
      testID="onb-about"
      footer={<Button label={t('onb.next')} onPress={next} loading={busy} disabled={!ready} full testID="about-next" />}
    >
      <Group label={t('onb.about.name', { context: ctx })}>
        <TextField
          value={b.fullName}
          onChangeText={(v) => setBd({ ...bd, basic: { ...b, fullName: v } })}
          autoCapitalize="words"
          autoComplete="name"
          maxLength={80}
          accessibilityLabel={t('onb.about.name', { context: ctx })}
          error={!!errors.fullName}
          style={{ fontSize: T.body + 1 }}
          testID="about-name"
        />
        {errors.fullName ? <Text variant="caption" color={colors.dangerText}>{t(errors.fullName)}</Text> : null}
      </Group>
      <Group label={t('onb.about.dob')} hint={b.dob ? t('onb.about.age', { age: ageFromDob(b.dob) }) : t('onb.about.dobHint')}>
        <View style={{ flexDirection: 'row', gap: space.xs }} testID="about-dob">
          <Wheel width={70} label={t('f.day')} items={Array.from({ length: daysIn(yy, mm) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} value={String(dd)} onChange={(v) => setDob(yy, mm, Number(v))} testID="dob-day" />
          <Wheel grow label={t('f.month')} items={months.map((n, i) => ({ value: String(i + 1), label: n }))} value={String(mm)} onChange={(v) => setDob(yy, Number(v), dd)} testID="dob-month" />
          <Wheel width={96} label={t('f.year')} items={years.map((y) => ({ value: String(y), label: String(y) }))} value={String(yy)} onChange={(v) => setDob(Number(v), mm, dd)} testID="dob-year" />
        </View>
        {errors.dob ? <Text variant="caption" color={colors.dangerText}>{t(errors.dob)}</Text> : null}
      </Group>
      <WheelField
        label={t('f.height')}
        placeholder={t('onb.about.heightPick')}
        display={heightDisplay}
        sheetTitle={t('onb.about.heightTitle', { context: ctx })}
        items={heightItems}
        value={b.heightCm ? nearest(b.heightCm) : undefined}
        onChange={(v) => setBd({ ...bd, basic: { ...b, heightCm: Number(v) } })}
        toggle={<UnitToggle options={[{ value: 'ft', label: t('onb.about.ftIn') }, { value: 'cm', label: 'cm' }]} value={unit} onChange={setUnit} />}
        testID="about-height"
      />
      {errors.heightCm ? <Text variant="caption" color={colors.dangerText}>{t(errors.heightCm)}</Text> : null}
    </OnbScreen>
  );
}
