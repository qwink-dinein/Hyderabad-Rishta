import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatHeight } from '@/domain/format';
import type { PublicProfile } from '@/domain/types';
import { useOptions } from '@/hooks/useOptions';
import { colors, space } from '@/theme/tokens';
import { ProfilePhoto } from './ProfileCard';
import { Badge, Banner } from './ui/feedback';
import { Icon, type IconName } from './ui/Icon';
import { Card, InfoRow, Section } from './ui/layout';
import { Text } from './ui/Text';

/** Read-only biodata, organised in the 7 PRD sections (§10). Renders only what the projection allows. */
export function ProfileDetails({ profile, contactSlot }: { profile: PublicProfile; contactSlot?: React.ReactNode }) {
  const { t } = useTranslation();
  const { label, maslakLabel } = useOptions();
  const p = profile;
  const [sel, setSel] = useState(0);
  const list = (g: Parameters<typeof label>[0], vals: string[]) => (vals.length ? vals.map((v) => label(g, v) ?? v).join(', ') : undefined);
  const range = (a?: number, b?: number, fmt: (n: number) => string = String) => (a == null && b == null ? undefined : `${a != null ? fmt(a) : '…'} – ${b != null ? fmt(b) : '…'}`);

  const photo = p.photos[Math.min(sel, Math.max(0, p.photos.length - 1))];
  const facts: { icon: IconName; text?: string }[] = [
    { icon: 'ruler', text: formatHeight(p.heightCm, false) },
    { icon: 'cap', text: label('education', p.career.education, p.career.educationOther) },
    { icon: 'briefcase', text: label('profession', p.career.profession, p.career.professionOther) },
  ];

  return (
    <View>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        {/* Gallery: main photo + thumbnails (only photos the viewer is allowed to see ever arrive here). */}
        <View style={styles.gallery}>
          <ProfilePhoto profile={{ ...p, photos: photo ? [photo] : [] }} height="100%" />
          {p.photos.length > 1 ? (
            <View style={styles.counter}>
              <Text variant="caption" color={colors.white}>
                {sel + 1}/{p.photos.length}
              </Text>
            </View>
          ) : null}
        </View>
        {p.photos.length > 1 ? (
          <View style={styles.thumbs}>
            {p.photos.map((ph, i) => (
              <Pressable
                key={ph.id}
                onPress={() => setSel(i)}
                accessibilityRole="button"
                accessibilityState={{ selected: i === sel }}
                aria-selected={i === sel}
                accessibilityLabel={t('f.photoN', { n: i + 1 })}
                style={[styles.thumb, i === sel && styles.thumbOn]}
              >
                <ProfilePhoto profile={{ ...p, photos: [ph] }} height="100%" rounded={false} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={{ padding: space.lg, gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <Text variant="h1" style={{ flexShrink: 1 }}>
              {p.displayName}, {p.age}
            </Text>
            {p.boosted ? <Badge label={`★ ${t('discover.boosted')}`} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <Icon name="mapPin" size={16} color={colors.goldMuted} />
            <Text variant="body" color={colors.muted} style={{ flexShrink: 1 }}>
              {[p.location.city, p.location.state, p.location.country].filter(Boolean).join(', ')}
            </Text>
          </View>
          <View style={styles.facts}>
            {facts.map((f) =>
              f.text ? (
                <View key={f.icon} style={styles.fact}>
                  <Icon name={f.icon} size={15} color={colors.goldMuted} />
                  <Text variant="label" numberOfLines={1}>
                    {f.text}
                  </Text>
                </View>
              ) : null,
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge label={p.code} tone="emerald" />
            {p.createdFor !== 'self' ? <Text variant="caption">{t('profile.createdBy', { who: label('createdFor', p.createdFor) })}</Text> : null}
          </View>
          {p.photosHidden ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <Icon name="lock" size={14} color={colors.muted} />
              <Text variant="caption">{t('profile.photosHidden')}</Text>
            </View>
          ) : null}
        </View>
      </Card>

      {p.aboutMe ? (
        <Section title={t('profile.about')}>
          <Card>
            <Text variant="body">{p.aboutMe}</Text>
          </Card>
        </Section>
      ) : null}

      <Section title={t('profile.personal')}>
        <Card>
          <InfoRow label={t('f.maritalStatus')} value={label('marital', p.maritalStatus)} />
          <InfoRow label={t('f.children')} value={p.children} />
          <InfoRow label={t('f.height')} value={formatHeight(p.heightCm)} />
          <InfoRow label={t('f.motherTongue')} value={label('tongue', p.motherTongue)} />
          <InfoRow label={t('f.createdFor')} value={label('createdFor', p.createdFor)} />
        </Card>
      </Section>

      <Section title={t('profile.location')}>
        <Card>
          <InfoRow label={t('f.country')} value={p.location.country} />
          <InfoRow label={t('f.state')} value={p.location.state} />
          <InfoRow label={t('f.district')} value={p.location.district} />
          <InfoRow label={t('f.city')} value={p.location.city} />
          <InfoRow label={t('f.locality')} value={p.location.locality} />
          <InfoRow label={t('f.nativePlace')} value={p.location.nativePlace} />
          <InfoRow label={t('f.nationality')} value={p.location.nationality} />
          <InfoRow label={t('f.livingAbroad')} value={p.location.livingAbroad ? t('common.yes') : undefined} />
          <InfoRow label={t('f.willingToRelocate')} value={label('relocate', p.location.willingToRelocate)} />
        </Card>
      </Section>

      <Section title={t('profile.career')}>
        <Card>
          <InfoRow label={t('f.education')} value={label('education', p.career.education, p.career.educationOther)} />
          <InfoRow label={t('f.educationDetails')} value={p.career.educationDetails} />
          <InfoRow label={t('f.profession')} value={label('profession', p.career.profession, p.career.professionOther)} />
          <InfoRow label={t('f.professionDetails')} value={p.career.professionDetails} />
          <InfoRow label={t('f.employmentType')} value={label('employment', p.career.employmentType)} />
          <InfoRow label={t('f.employer')} value={p.career.employer} />
          <InfoRow label={t('f.income')} value={label('income', p.career.income)} />
          <InfoRow label={t('f.workLocation')} value={p.career.workLocation} />
        </Card>
      </Section>

      {Object.values(p.religion).some(Boolean) ? (
        <Section title={t('profile.religion')}>
          <Card>
            <InfoRow label={t('f.maslak')} value={maslakLabel(p.religion.maslak, p.religion.subMaslak, p.religion.maslakOther)} />
            <InfoRow label={t('f.namaz')} value={label('practice', p.religion.namaz)} />
            <InfoRow label={t('f.fasting')} value={label('practice', p.religion.fasting)} />
            <InfoRow label={t('f.hajj')} value={label('yesNo', p.religion.hajj)} />
            <InfoRow label={t('f.umrah')} value={label('yesNo', p.religion.umrah)} />
            <InfoRow label={t('f.dargah')} value={label('practice', p.religion.dargah)} />
            <InfoRow label={t('f.compatibilityImportance')} value={label('importance', p.religion.compatibilityImportance)} />
            <InfoRow label={t('f.expectations')} value={p.religion.expectations} />
          </Card>
        </Section>
      ) : null}

      <Section title={t('profile.family')}>
        {p.family ? (
          <Card>
            <InfoRow label={t('f.familyType')} value={label('familyType', p.family.familyType)} />
            <InfoRow label={t('f.familyValues')} value={label('familyValues', p.family.familyValues)} />
            <InfoRow label={t('f.fatherOccupation')} value={p.family.fatherOccupation} />
            <InfoRow label={t('f.motherOccupation')} value={p.family.motherOccupation} />
            <InfoRow label={t('f.siblings')} value={p.family.siblings} />
            <InfoRow label={t('f.brothers')} value={p.family.brothers} />
            <InfoRow label={t('f.sisters')} value={p.family.sisters} />
            <InfoRow label={t('f.residence')} value={p.family.residence} />
            {p.family.description ? <Text variant="body" style={{ marginTop: space.sm }}>{p.family.description}</Text> : null}
          </Card>
        ) : (
          <Banner icon="lock">{t('profile.familyHidden')}</Banner>
        )}
      </Section>

      <Section title={t('profile.preferences')}>
        <Card>
          <InfoRow label={t('f.prefAge')} value={range(p.preferences.ageMin, p.preferences.ageMax)} />
          <InfoRow label={t('f.prefHeight')} value={range(p.preferences.heightMin, p.preferences.heightMax, (n) => formatHeight(n, false))} />
          <InfoRow label={t('f.prefMarital')} value={list('marital', p.preferences.maritalStatus)} />
          <InfoRow label={t('f.prefEducation')} value={list('education', p.preferences.education)} />
          <InfoRow label={t('f.prefProfession')} value={list('profession', p.preferences.profession)} />
          <InfoRow label={t('f.prefCountry')} value={p.preferences.countries.join(', ') || undefined} />
          <InfoRow label={t('f.prefState')} value={p.preferences.states.join(', ') || undefined} />
          <InfoRow label={t('f.prefCity')} value={p.preferences.cities.join(', ') || undefined} />
          <InfoRow label={t('f.prefTongue')} value={list('tongue', p.preferences.motherTongues)} />
          <InfoRow label={t('f.prefRelocation')} value={label('relocate', p.preferences.relocation)} />
          <InfoRow label={t('f.prefReligious')} value={p.preferences.religious} />
          <InfoRow label={t('profile.expectations')} value={p.preferences.expectations} />
        </Card>
      </Section>

      {contactSlot ? <Section title={t('profile.contact')}>{contactSlot}</Section> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: { width: '100%', aspectRatio: 4 / 5, maxHeight: 460, backgroundColor: colors.sage },
  counter: { position: 'absolute', top: space.md, right: space.md, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(11,48,40,0.6)' },
  thumbs: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  thumb: { width: 64, height: 80, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbOn: { borderColor: colors.gold },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 2 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.ivory, borderWidth: 1, borderColor: colors.border, maxWidth: '100%' },
});
