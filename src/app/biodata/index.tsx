import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Button } from '@/components/ui/Button';
import { Banner, EmptyState, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, Field, OptionList, RangeSelect, Reveal, Select, TextField, ToggleRow } from '@/components/ui/forms';
import { Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { ageFromDob, maskPhone } from '@/domain/format';
import { citiesOf, COUNTRIES, districtsOf, statesOf } from '@/domain/options';
import type { Biodata } from '@/domain/types';
import { emptyBiodata, STEP_KEYS, stepErrors } from '@/domain/validation';
import { useMyProfile, useSaveDraft } from '@/hooks/queries';
import { haptic, playSound } from '@/services/feedback';
import { useGoHome } from '@/hooks/useGoHome';
import { useOptions } from '@/hooks/useOptions';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

type Section = keyof Biodata;

/** Multi-step biodata wizard (PRD §6): progress, save-and-continue, validation, preview. */
export default function BiodataWizard() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ step?: string }>();
  const user = useSession((s) => s.user);
  const { data: profile, isLoading } = useMyProfile();
  const save = useSaveDraft();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { opts, heights, ages, plain, subMaslakOpts } = useOptions();
  const [bd, setBd] = useState<Biodata | null>(null);
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const goHome = useGoHome();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // One number = one biodata: if the team removed this account's biodata, a new one can't be started here.
  const { data: fresh } = useQuery({ queryKey: ['session', 'fresh'], queryFn: () => backend.getSession(), enabled: !!user && !isLoading && !profile });

  // Initialise once from the saved draft (or a blank biodata) and resume at the last step.
  // Done during render (React's "adjust state on prop change" pattern) rather than in an effect.
  if (!isLoading && !bd) {
    setBd(profile ? profile.biodata : emptyBiodata());
    const requested = params.step != null ? Number(params.step) : NaN;
    setStep(Number.isFinite(requested) ? Math.min(Math.max(requested, 0), 6) : profile ? Math.min(profile.lastStep, 6) : 0);
  }

  const sectionFor = (s: number): Section => STEP_KEYS[s] as Section;
  const errors = useMemo(() => (bd && showErrors ? stepErrors(step, bd[sectionFor(step)]) : {}), [bd, step, showErrors]);

  const set = useCallback(<S extends Section>(section: S, key: string, value: unknown) => {
    setBd((prev) => (prev ? { ...prev, [section]: { ...(prev[section] as object), [key]: value } } : prev));
  }, []);

  if (!user) return <Redirect href="/login" />;
  if (!profile && fresh?.profileRemovedAt)
    return (
      <Screen header={<Header title={t('wizard.title')} onHome={goHome} />}>
        <EmptyState
          icon="shield"
          title={t('wizard.removedTitle')}
          body={t('wizard.removedBody')}
          action={<Button label={t('wizard.removedAction')} kind="secondary" onPress={() => router.replace('/settings')} testID="removed-settings" />}
        />
      </Screen>
    );
  if (!bd) return <Loading />;

  const go = async (target: number, validate: boolean) => {
    if (validate) {
      const errs = stepErrors(step, bd[sectionFor(step)]);
      if (Object.keys(errs).length) {
        setShowErrors(true);
        toast(t('v.fixErrors'), 'danger');
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        return;
      }
    }
    try {
      await save.mutateAsync({ biodata: bd, step: validate ? Math.max(step + 1, target) : step });
      setShowErrors(false);
      if (validate) haptic('light'); // saved — quiet confirmation, no sound on every step
      if (target > 6) playSound('save');
      if (target > 6) router.push('/biodata/preview');
      else {
        setStep(target);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const err = (k: string) => errors[k];
  const b = bd.basic;
  const age = ageFromDob(b.dob);
  const [y, m, d] = (b.dob || '--').split('-');
  const setDob = (part: 'y' | 'm' | 'd', v: string) => {
    const next = { y, m, d, [part]: v };
    set('basic', 'dob', `${next.y || ''}-${next.m || ''}-${next.d || ''}`);
  };
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 63 }, (_, i) => String(thisYear - 18 - i)).map((v) => ({ value: v, label: v }));
  const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: t(`opt.months.${i + 1}`) }));
  const days = Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1).padStart(2, '0'), label: String(i + 1) }));

  const loc = bd.location;
  const car = bd.career;
  const rel = bd.religion;
  const fam = bd.family;
  const pref = bd.preferences;
  const prv = bd.privacy;
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/\D/g, '')));

  const steps: React.ReactNode[] = [
    // 0 — Basic (photos first, per PRD §6.2)
    <View key="basic">
      <View style={{ marginBottom: space.xl }}>
        <PhotoPicker photos={bd.photos} onChange={(p) => setBd({ ...bd, photos: p })} />
      </View>
      <Field label={t('f.createdFor')} required error={err('createdFor')}>
        <OptionList
          options={opts('createdFor')}
          value={b.createdFor}
          onChange={(v) => set('basic', 'createdFor', v ?? '')}
          icons={{ self: 'user', son: 'user', daughter: 'user', brother: 'users', sister: 'users', relative: 'users', other: 'sparkle' }}
          accessibilityLabel={t('f.createdFor')}
        />
      </Field>
      <Field label={t('f.lookingFor')} required error={err('lookingFor')}>
        <ChipGroup options={opts('lookingFor')} value={b.lookingFor} onChange={(v) => set('basic', 'lookingFor', v ?? '')} accessibilityLabel={t('f.lookingFor')} />
      </Field>
      <Field label={t('f.fullName')} required error={err('fullName')}>
        <TextField value={b.fullName} onChangeText={(v) => set('basic', 'fullName', v)} autoComplete="name" accessibilityLabel={t('f.fullName')} error={!!err('fullName')} maxLength={80} />
      </Field>
      <Field label={t('f.dob')} required error={err('dob')} hint={Number.isFinite(age) ? t('f.age', { age }) : undefined}>
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}>
            <Select label={t('f.day')} placeholder={t('f.day')} options={days} value={d || undefined} onChange={(v: string) => setDob('d', v)} error={!!err('dob')} />
          </View>
          <View style={{ flex: 1.2 }}>
            <Select label={t('f.month')} placeholder={t('f.month')} options={months} value={m || undefined} onChange={(v: string) => setDob('m', v)} error={!!err('dob')} />
          </View>
          <View style={{ flex: 1.2 }}>
            <Select label={t('f.year')} placeholder={t('f.year')} options={years} value={y || undefined} onChange={(v: string) => setDob('y', v)} error={!!err('dob')} />
          </View>
        </Row>
      </Field>
      <Field label={t('f.height')} required error={err('heightCm')}>
        <Select label={t('f.height')} options={heights} value={b.heightCm ? String(b.heightCm) : undefined} onChange={(v: string) => set('basic', 'heightCm', Number(v))} error={!!err('heightCm')} />
      </Field>
      <Field label={t('f.maritalStatus')} required error={err('maritalStatus')}>
        <ChipGroup
          options={opts('marital')}
          value={b.maritalStatus}
          onChange={(v) => setBd({ ...bd, basic: { ...b, maritalStatus: v ?? '', children: v && v !== 'never_married' ? b.children : undefined } })}
          accessibilityLabel={t('f.maritalStatus')}
        />
      </Field>
      {b.maritalStatus && b.maritalStatus !== 'never_married' ? (
        <Reveal>
        <Field label={t('f.children')} required error={err('children')} hint={t('f.childrenHint')}>
          <TextField
            value={b.children != null ? String(b.children) : ''}
            onChangeText={(v) => set('basic', 'children', num(v))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            accessibilityLabel={t('f.children')}
            error={!!err('children')}
            testID="children-input"
          />
        </Field>
        </Reveal>
      ) : null}
      <Field label={t('f.motherTongue')} required error={err('motherTongue')}>
        <Select label={t('f.motherTongue')} options={opts('tongue')} value={b.motherTongue || undefined} onChange={(v: string) => set('basic', 'motherTongue', v)} error={!!err('motherTongue')} />
      </Field>
      <Field label={t('f.aboutMe')} optional hint={t('f.aboutMeHint')} error={err('aboutMe')}>
        <TextField value={b.aboutMe} onChangeText={(v) => set('basic', 'aboutMe', v)} multiline maxLength={1000} accessibilityLabel={t('f.aboutMe')} />
      </Field>
    </View>,

    // 1 — Location
    <View key="location">
      <Banner icon="shield">{t('f.addressNote')}</Banner>
      <View style={{ height: space.lg }} />
      <Field label={t('f.country')} required error={err('country')}>
        <Select
          label={t('f.country')}
          options={plain(COUNTRIES)}
          allowCustom
          value={loc.country || undefined}
          onChange={(v: string) => setBd({ ...bd, location: { ...loc, country: v, state: '', district: '', city: '' } })}
          error={!!err('country')}
        />
      </Field>
      <Field label={t('f.state')} required error={err('state')}>
        <Select
          label={t('f.state')}
          options={plain(statesOf(loc.country))}
          allowCustom
          value={loc.state || undefined}
          onChange={(v: string) => setBd({ ...bd, location: { ...loc, state: v, district: '', city: '' } })}
          error={!!err('state')}
        />
      </Field>
      <Field label={t('f.district')} optional>
        <Select label={t('f.district')} options={plain(districtsOf(loc.country, loc.state))} allowCustom value={loc.district || undefined} onChange={(v: string) => set('location', 'district', v)} />
      </Field>
      <Field label={t('f.city')} required error={err('city')}>
        <Select label={t('f.city')} options={plain(citiesOf(loc.country, loc.state))} allowCustom value={loc.city || undefined} onChange={(v: string) => set('location', 'city', v)} error={!!err('city')} />
      </Field>
      <Field label={t('f.locality')} optional>
        <TextField value={loc.locality} onChangeText={(v) => set('location', 'locality', v)} accessibilityLabel={t('f.locality')} maxLength={80} />
      </Field>
      <Field label={t('f.nativePlace')} optional>
        <TextField value={loc.nativePlace} onChangeText={(v) => set('location', 'nativePlace', v)} accessibilityLabel={t('f.nativePlace')} maxLength={80} />
      </Field>
      <Field label={t('f.nationality')} optional>
        <TextField value={loc.nationality} onChangeText={(v) => set('location', 'nationality', v)} accessibilityLabel={t('f.nationality')} maxLength={60} />
      </Field>
      <ToggleRow label={t('f.livingAbroad')} value={!!loc.livingAbroad} onChange={(v) => set('location', 'livingAbroad', v)} />
      <Field label={t('f.willingToRelocate')} optional>
        <ChipGroup options={opts('relocate')} value={loc.willingToRelocate} onChange={(v) => set('location', 'willingToRelocate', v)} />
      </Field>
    </View>,

    // 2 — Education & career (with conditional "Other")
    <View key="career">
      <Field label={t('f.education')} required error={err('education')}>
        <Select label={t('f.education')} options={opts('education')} value={car.education || undefined} onChange={(v: string) => set('career', 'education', v)} error={!!err('education')} />
      </Field>
      {car.education === 'other' ? (
        <Reveal>
        <Field label={t('f.educationOther')} required error={err('educationOther')}>
          <TextField value={car.educationOther} onChangeText={(v) => set('career', 'educationOther', v)} accessibilityLabel={t('f.educationOther')} error={!!err('educationOther')} maxLength={80} />
        </Field>
        </Reveal>
      ) : null}
      <Field label={t('f.educationDetails')} optional>
        <TextField value={car.educationDetails} onChangeText={(v) => set('career', 'educationDetails', v)} accessibilityLabel={t('f.educationDetails')} maxLength={120} />
      </Field>
      <Field label={t('f.profession')} required error={err('profession')}>
        <Select label={t('f.profession')} options={opts('profession')} value={car.profession || undefined} onChange={(v: string) => set('career', 'profession', v)} error={!!err('profession')} />
      </Field>
      {car.profession === 'other' ? (
        <Reveal>
        <Field label={t('f.professionOther')} required error={err('professionOther')}>
          <TextField value={car.professionOther} onChangeText={(v) => set('career', 'professionOther', v)} accessibilityLabel={t('f.professionOther')} error={!!err('professionOther')} maxLength={80} />
        </Field>
        </Reveal>
      ) : null}
      <Field label={t('f.professionDetails')} optional>
        <TextField value={car.professionDetails} onChangeText={(v) => set('career', 'professionDetails', v)} accessibilityLabel={t('f.professionDetails')} maxLength={120} />
      </Field>
      <Field label={t('f.employmentType')} optional>
        <ChipGroup options={opts('employment')} value={car.employmentType} onChange={(v) => set('career', 'employmentType', v)} />
      </Field>
      <Field label={t('f.employer')} optional>
        <TextField value={car.employer} onChangeText={(v) => set('career', 'employer', v)} accessibilityLabel={t('f.employer')} maxLength={120} />
      </Field>
      <Field label={t('f.income')} optional>
        <Select label={t('f.income')} options={opts('income')} value={car.income || undefined} onChange={(v: string) => set('career', 'income', v)} />
      </Field>
      <Field label={t('f.workLocation')} optional>
        <TextField value={car.workLocation} onChangeText={(v) => set('career', 'workLocation', v)} accessibilityLabel={t('f.workLocation')} maxLength={80} />
      </Field>
    </View>,

    // 3 — Religious background (all optional, neutral wording)
    <View key="religion">
      <Banner>{t('wizard.religionNote')}</Banner>
      <View style={{ height: space.lg }} />
      <Field label={t('f.maslak')} optional>
        <Select
          label={t('f.maslak')}
          options={opts('maslak')}
          value={rel.maslak}
          onChange={(v: string) => setBd({ ...bd, religion: { ...rel, maslak: v, subMaslak: undefined, maslakOther: undefined } })}
        />
      </Field>
      {subMaslakOpts([rel.maslak]).length ? (
        <Field label={t('f.subMaslak')} optional>
          <Select
            label={t('f.subMaslak')}
            options={subMaslakOpts([rel.maslak])}
            value={rel.subMaslak}
            onChange={(v: string) => setBd({ ...bd, religion: { ...rel, subMaslak: v, maslakOther: v === 'other' ? rel.maslakOther : undefined } })}
          />
        </Field>
      ) : null}
      {rel.maslak === 'other' || rel.subMaslak === 'other' ? (
        <Reveal>
        <Field label={t('f.maslakOther')} optional>
          <TextField value={rel.maslakOther} onChangeText={(v) => set('religion', 'maslakOther', v)} accessibilityLabel={t('f.maslakOther')} maxLength={60} />
        </Field>
        </Reveal>
      ) : null}
      <Field label={t('f.namaz')} optional>
        <ChipGroup options={opts('practice')} value={rel.namaz} onChange={(v) => set('religion', 'namaz', v)} />
      </Field>
      <Field label={t('f.fasting')} optional>
        <ChipGroup options={opts('practice')} value={rel.fasting} onChange={(v) => set('religion', 'fasting', v)} />
      </Field>
      <Field label={t('f.hajj')} optional>
        <ChipGroup options={opts('yesNo')} value={rel.hajj} onChange={(v) => set('religion', 'hajj', v)} />
      </Field>
      <Field label={t('f.umrah')} optional>
        <ChipGroup options={opts('yesNo')} value={rel.umrah} onChange={(v) => set('religion', 'umrah', v)} />
      </Field>
      <Field label={t('f.dargah')} optional>
        <ChipGroup options={opts('practice')} value={rel.dargah} onChange={(v) => set('religion', 'dargah', v)} />
      </Field>
      <Field label={t('f.compatibilityImportance')} optional>
        <ChipGroup options={opts('importance')} value={rel.compatibilityImportance} onChange={(v) => set('religion', 'compatibilityImportance', v)} />
      </Field>
      <Field label={t('f.expectations')} optional>
        <TextField value={rel.expectations} onChangeText={(v) => set('religion', 'expectations', v)} multiline maxLength={500} accessibilityLabel={t('f.expectations')} />
      </Field>
    </View>,

    // 4 — Family (optional, minimal identifying info)
    <View key="family">
      <Banner>{t('wizard.familyNote')}</Banner>
      <View style={{ height: space.lg }} />
      <Field label={t('f.familyType')} optional>
        <ChipGroup options={opts('familyType')} value={fam.familyType} onChange={(v) => set('family', 'familyType', v)} />
      </Field>
      <Field label={t('f.familyValues')} optional>
        <ChipGroup options={opts('familyValues')} value={fam.familyValues} onChange={(v) => set('family', 'familyValues', v)} />
      </Field>
      <Field label={t('f.fatherOccupation')} optional>
        <TextField value={fam.fatherOccupation} onChangeText={(v) => set('family', 'fatherOccupation', v)} accessibilityLabel={t('f.fatherOccupation')} maxLength={80} />
      </Field>
      <Field label={t('f.motherOccupation')} optional>
        <TextField value={fam.motherOccupation} onChangeText={(v) => set('family', 'motherOccupation', v)} accessibilityLabel={t('f.motherOccupation')} maxLength={80} />
      </Field>
      <Row gap={space.sm} style={{ alignItems: 'flex-start' }}>
        {(['siblings', 'brothers', 'sisters'] as const).map((k) => (
          <View key={k} style={{ flex: 1 }}>
            <Field label={t(`f.${k}`)} error={err(k)}>
              <TextField value={fam[k] != null ? String(fam[k]) : ''} onChangeText={(v) => set('family', k, num(v))} keyboardType="number-pad" inputMode="numeric" maxLength={2} accessibilityLabel={t(`f.${k}`)} error={!!err(k)} />
            </Field>
          </View>
        ))}
      </Row>
      <Field label={t('f.residence')} optional>
        <TextField value={fam.residence} onChangeText={(v) => set('family', 'residence', v)} accessibilityLabel={t('f.residence')} maxLength={80} />
      </Field>
      <Field label={t('f.familyDescription')} optional>
        <TextField value={fam.description} onChangeText={(v) => set('family', 'description', v)} multiline maxLength={1000} accessibilityLabel={t('f.familyDescription')} />
      </Field>
    </View>,

    // 5 — Partner preferences (non-excluding by default)
    <View key="preferences">
      <Banner>{t('wizard.preferencesNote')}</Banner>
      <View style={{ height: space.lg }} />
      <RangeSelect label={t('f.prefAge')} options={ages} min={pref.ageMin} max={pref.ageMax} onChange={(a, z) => setBd({ ...bd, preferences: { ...pref, ageMin: a, ageMax: z } })} error={err('ageMax')} />
      <RangeSelect label={t('f.prefHeight')} options={heights} min={pref.heightMin} max={pref.heightMax} onChange={(a, z) => setBd({ ...bd, preferences: { ...pref, heightMin: a, heightMax: z } })} error={err('heightMax')} />
      <Field label={t('f.prefMarital')} optional>
        <ChipGroup multiple options={opts('marital')} value={pref.maritalStatus} onChange={(v) => set('preferences', 'maritalStatus', v)} />
      </Field>
      <Field label={t('f.prefEducation')} optional>
        <Select multiple label={t('f.prefEducation')} options={opts('education')} value={pref.education} onChange={(v: string[]) => set('preferences', 'education', v)} />
      </Field>
      <Field label={t('f.prefProfession')} optional>
        <Select multiple label={t('f.prefProfession')} options={opts('profession')} value={pref.profession} onChange={(v: string[]) => set('preferences', 'profession', v)} />
      </Field>
      <Field label={t('f.prefCountry')} optional>
        <Select multiple allowCustom label={t('f.prefCountry')} options={plain(COUNTRIES)} value={pref.countries} onChange={(v: string[]) => set('preferences', 'countries', v)} />
      </Field>
      <Field label={t('f.prefState')} optional>
        <Select multiple allowCustom label={t('f.prefState')} options={plain((pref.countries.length ? pref.countries : ['India']).flatMap((c) => statesOf(c)))} value={pref.states} onChange={(v: string[]) => set('preferences', 'states', v)} />
      </Field>
      <Field label={t('f.prefCity')} optional>
        <Select
          multiple
          allowCustom
          label={t('f.prefCity')}
          options={plain([...new Set((pref.countries.length ? pref.countries : ['India']).flatMap((c) => (pref.states.length ? pref.states : statesOf(c)).flatMap((s) => citiesOf(c, s))))])}
          value={pref.cities}
          onChange={(v: string[]) => set('preferences', 'cities', v)}
        />
      </Field>
      <Field label={t('f.prefTongue')} optional>
        <Select multiple label={t('f.prefTongue')} options={opts('tongue')} value={pref.motherTongues} onChange={(v: string[]) => set('preferences', 'motherTongues', v)} />
      </Field>
      <Field label={t('f.prefRelocation')} optional>
        <ChipGroup options={[...opts('relocate'), { value: 'any', label: t('opt.relocate.any') }]} value={pref.relocation} onChange={(v) => set('preferences', 'relocation', v)} />
      </Field>
      <Field label={t('f.prefReligious')} optional>
        <TextField value={pref.religious} onChangeText={(v) => set('preferences', 'religious', v)} multiline maxLength={500} accessibilityLabel={t('f.prefReligious')} />
      </Field>
      <Field label={t('f.prefExpectations')} optional>
        <TextField value={pref.expectations} onChangeText={(v) => set('preferences', 'expectations', v)} multiline maxLength={1000} accessibilityLabel={t('f.prefExpectations')} />
      </Field>
    </View>,

    // 6 — Privacy
    <View key="privacy">
      <Banner icon="lock">{t('f.phonePrivate', { phone: `${user.countryCode} ${maskPhone(user.phone)}` })}</Banner>
      <View style={{ height: space.md }} />
      <Text variant="caption" style={{ marginBottom: space.lg }}>
        {t('wizard.privacyNote')}
      </Text>
      <Field label={t('f.displayName')}>
        <ChipGroup options={opts('displayName')} value={prv.displayName} onChange={(v) => v && set('privacy', 'displayName', v)} />
      </Field>
      <Field label={t('f.photoVisibility')}>
        <ChipGroup options={opts('visibility')} value={prv.photoVisibility} onChange={(v) => v && set('privacy', 'photoVisibility', v)} />
      </Field>
      <Field label={t('f.incomeVisibility')}>
        <ChipGroup options={opts('visibility')} value={prv.incomeVisibility} onChange={(v) => v && set('privacy', 'incomeVisibility', v)} />
      </Field>
      <Field label={t('f.familyVisibility')}>
        <ChipGroup options={opts('visibility')} value={prv.familyVisibility} onChange={(v) => v && set('privacy', 'familyVisibility', v)} />
      </Field>
      <ToggleRow label={t('f.acceptRequests')} value={prv.acceptContactRequests} onChange={(v) => set('privacy', 'acceptContactRequests', v)} />
    </View>,
  ];

  const maxReachable = Math.max(profile?.lastStep ?? 0, step);
  return (
    <Screen
      header={
        <Header
          title={profile ? t('wizard.editTitle') : t('wizard.title')}
          onBack={() => (step > 0 ? go(step - 1, false) : router.canGoBack() ? router.back() : router.replace('/dashboard'))}
          onHome={async () => {
            // Keep what they typed: save the draft (only if there is something to save), then go home.
            if (profile || bd.basic.fullName.trim()) await save.mutateAsync({ biodata: bd, step }).catch(() => undefined);
            goHome();
          }}
        />
      }
      scrollProps={{ ref: scrollRef } as never}
      footer={
        <Row gap={space.sm}>
          {step > 0 ? <Button label={t('common.back')} kind="secondary" onPress={() => go(step - 1, false)} style={{ flex: 1 }} disabled={save.isPending} /> : null}
          <Button
            label={step === 6 ? (profile && profile.status !== 'draft' && profile.status !== 'rejected' ? t('wizard.saveReview') : t('wizard.reviewPreview')) : t('common.saveContinue')}
            onPress={() => go(step + 1, true)}
            loading={save.isPending}
            style={{ flex: 2 }}
            arrow
            testID="wizard-next"
          />
        </Row>
      }
    >
      <View style={{ paddingTop: space.lg, gap: space.sm }}>
        <Text variant="overline">{t('common.step', { n: step + 1, total: 7 })}</Text>
        <Text variant="h1" accessibilityRole="header">
          {t(`wizard.steps.${STEP_KEYS[step]}`)}
        </Text>
        <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: 7, now: step + 1 }}>
          {STEP_KEYS.map((k, i) => (
            <View key={k} style={[styles.segment, i < step && styles.segmentDone, i === step && styles.segmentNow]} />
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingVertical: space.sm }}>
          {STEP_KEYS.map((k, i) => {
            const reachable = i <= maxReachable;
            return (
              <Pressable
                key={k}
                disabled={!reachable || i === step}
                onPress={() => go(i, i > step)}
                accessibilityRole="tab"
                accessibilityState={{ selected: i === step, disabled: !reachable }}
                style={[styles.stepPill, i === step && styles.stepPillOn, !reachable && { opacity: 0.45 }]}
              >
                <Text variant="caption" color={i === step ? colors.white : colors.emerald}>
                  {i + 1}. {t(`wizard.steps.${k}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View style={{ marginTop: space.md }}>{steps[step]}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressTrack: { flexDirection: 'row', gap: 4, marginTop: space.xs },
  segment: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.border },
  segmentDone: { backgroundColor: colors.gold },
  segmentNow: { backgroundColor: colors.emerald },
  stepPill: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  stepPillOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
});
