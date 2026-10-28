import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ChipGroup, Field, RangeSelect, Select, TextField, ToggleRow } from '@/components/ui/forms';
import { Header, Row, Screen, Section } from '@/components/ui/layout';
import { citiesOf, COUNTRIES, districtsOf, statesOf } from '@/domain/options';
import { EMPTY_FILTERS, type SearchFilters } from '@/domain/search';
import { useOptions } from '@/hooks/useOptions';
import { backend } from '@/services';
import { useFilters } from '@/state/filters';
import { space } from '@/theme/tokens';

/**
 * Detailed filters (PRD §9.1–9.2). Edits a local draft; the live match count updates as you go,
 * and nothing applies until "Show N profiles". Location lists are dependent (country → state → city).
 */
export default function Filters() {
  const { t } = useTranslation();
  const { filters, setFilters } = useFilters();
  const [f, setF] = useState<SearchFilters>(filters);
  const [count, setCount] = useState<number | null>(null);
  const { opts, heights, ages, plain, subMaslakOpts } = useOptions();
  const patch = (p: Partial<SearchFilters>) => setF((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      backend
        .searchProfiles(f, 0, 1)
        .then((r) => alive && setCount(r.total))
        .catch(() => alive && setCount(null));
    }, 250); // debounce
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [f]);

  const stateOpts = (f.countries.length ? f.countries : COUNTRIES).flatMap((c) => statesOf(c));
  const pairs = (f.countries.length ? f.countries : COUNTRIES).flatMap((c) => (f.states.length ? f.states : statesOf(c)).map((s) => [c, s] as const));
  const districtOpts = [...new Set(pairs.flatMap(([c, s]) => districtsOf(c, s)))];
  const cityOpts = [...new Set(pairs.flatMap(([c, s]) => citiesOf(c, s)))];

  return (
    <Screen
      header={<Header title={t('filters.title')} right={<Button label={t('common.clearAll')} kind="ghost" size="sm" onPress={() => setF({ ...EMPTY_FILTERS, sort: f.sort })} />} />}
      footer={
        <Button
          label={count == null ? t('common.apply') : t('filters.apply', { count })}
          onPress={() => {
            setFilters(f);
            // Always land on the results — also when Filters was opened from Home (was: back to Home).
            router.dismissTo('/discover');
          }}
          full
          arrow
          testID="apply-filters"
        />
      }
    >
      <Section title={t('filters.basic')}>
        <Field label={t('filters.show')} optional>
          <ChipGroup options={opts('lookingFor')} value={f.show} onChange={(v) => patch({ show: v })} />
        </Field>
        <RangeSelect label={t('filters.ageRange')} options={ages} min={f.ageMin} max={f.ageMax} onChange={(a, b) => patch({ ageMin: a, ageMax: b })} />
        <RangeSelect label={t('filters.heightRange')} options={heights} min={f.heightMin} max={f.heightMax} onChange={(a, b) => patch({ heightMin: a, heightMax: b })} />
        <Field label={t('f.maritalStatus')} optional>
          <ChipGroup multiple options={opts('marital')} value={f.maritalStatus} onChange={(v) => patch({ maritalStatus: v })} />
        </Field>
      </Section>

      <Section title={t('filters.location')}>
        <Field label={t('f.country')} optional>
          <Select multiple label={t('f.country')} options={plain(COUNTRIES)} value={f.countries} onChange={(v: string[]) => patch({ countries: v, states: [], districts: [], cities: [] })} />
        </Field>
        <Field label={t('f.state')} optional>
          <Select multiple label={t('f.state')} options={plain(stateOpts)} value={f.states} onChange={(v: string[]) => patch({ states: v, districts: [], cities: [] })} />
        </Field>
        <Field label={t('f.district')} optional>
          <Select multiple label={t('f.district')} options={plain(districtOpts)} value={f.districts} onChange={(v: string[]) => patch({ districts: v })} />
        </Field>
        <Field label={t('f.city')} optional>
          <Select multiple allowCustom label={t('f.city')} options={plain(cityOpts)} value={f.cities} onChange={(v: string[]) => patch({ cities: v })} />
        </Field>
        <Field label={t('f.locality')} optional>
          <TextField value={f.locality ?? ''} onChangeText={(v) => patch({ locality: v || undefined })} accessibilityLabel={t('f.locality')} />
        </Field>
      </Section>

      <Section title={t('filters.language')}>
        <Field label={t('f.motherTongue')} optional>
          <Select multiple label={t('f.motherTongue')} options={opts('tongue')} value={f.motherTongues} onChange={(v: string[]) => patch({ motherTongues: v })} />
        </Field>
      </Section>

      <Section title={t('filters.education')}>
        <Field label={t('f.education')} optional>
          <Select multiple allowCustom label={t('f.education')} options={opts('education')} value={f.education} onChange={(v: string[]) => patch({ education: v })} />
        </Field>
      </Section>

      <Section title={t('filters.career')}>
        <Field label={t('f.profession')} optional>
          <Select multiple allowCustom label={t('f.profession')} options={opts('profession')} value={f.profession} onChange={(v: string[]) => patch({ profession: v })} />
        </Field>
        <Field label={t('f.employmentType')} optional>
          <ChipGroup multiple options={opts('employment')} value={f.employmentType} onChange={(v) => patch({ employmentType: v })} />
        </Field>
        <Field label={t('filters.keyword')} optional hint={t('filters.keywordHint')}>
          <TextField value={f.keyword ?? ''} onChangeText={(v) => patch({ keyword: v || undefined })} accessibilityLabel={t('filters.keyword')} />
        </Field>
      </Section>

      <Section title={t('filters.income')}>
        <Field label={t('filters.incomeMin')} optional>
          <Select label={t('filters.incomeMin')} options={[{ value: '', label: t('common.any') }, ...opts('income').filter((o) => o.value !== 'undisclosed')]} value={f.incomeMin} onChange={(v: string) => patch({ incomeMin: v || undefined })} />
        </Field>
      </Section>

      <Section title={t('filters.religion')}>
        <Field label={t('f.maslak')} optional>
          <Select
            multiple
            label={t('f.maslak')}
            options={opts('maslak').filter((o) => o.value !== 'prefer_not')}
            value={f.maslak}
            onChange={(v: string[]) => patch({ maslak: v, subMaslak: f.subMaslak.filter((s) => subMaslakOpts(v).some((o) => o.value === s)) })}
          />
        </Field>
        {subMaslakOpts(f.maslak).length ? (
          <Field label={t('f.subMaslak')} optional>
            <Select multiple label={t('f.subMaslak')} options={subMaslakOpts(f.maslak)} value={f.subMaslak} onChange={(v: string[]) => patch({ subMaslak: v })} />
          </Field>
        ) : null}
      </Section>

      <Section title={t('filters.family')}>
        <Field label={t('f.familyType')} optional>
          <ChipGroup multiple options={opts('familyType')} value={f.familyType} onChange={(v) => patch({ familyType: v })} />
        </Field>
        <Field label={t('f.familyValues')} optional>
          <ChipGroup multiple options={opts('familyValues').filter((o) => o.value !== 'prefer_not')} value={f.familyValues} onChange={(v) => patch({ familyValues: v })} />
        </Field>
      </Section>

      <Section title={t('filters.relocation')}>
        <Field label={t('f.willingToRelocate')} optional>
          <ChipGroup multiple options={opts('relocate')} value={f.relocation} onChange={(v) => patch({ relocation: v })} />
        </Field>
      </Section>

      <Section title={t('filters.discovery')}>
        <View style={{ gap: space.xs }}>
          <ToggleRow label={t('filters.recent')} value={!!f.recentDays} onChange={(v) => patch({ recentDays: v ? 30 : undefined })} />
          <ToggleRow label={t('filters.boostedOnly')} value={f.boostedOnly} onChange={(v) => patch({ boostedOnly: v })} hint={t('discover.boostedNote')} />
          <ToggleRow label={t('filters.shortlistedOnly')} value={f.shortlistedOnly} onChange={(v) => patch({ shortlistedOnly: v })} />
          <ToggleRow label={t('filters.strict')} value={f.strictOptional} onChange={(v) => patch({ strictOptional: v })} />
        </View>
      </Section>
      <Row style={{ height: space.xl }}>{null}</Row>
    </Screen>
  );
}
