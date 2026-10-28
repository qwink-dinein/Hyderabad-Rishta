import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatHeight, profileCode } from '@/domain/format';
import type { PublicProfile } from '@/domain/types';
import { useOptions } from '@/hooks/useOptions';
import { colors, space } from '@/theme/tokens';
import { ProfilePhoto } from './ProfileCard';
import { Badge, Banner } from './ui/feedback';
import { Card, InfoRow, Section } from './ui/layout';
import { Text } from './ui/Text';

/** Read-only biodata, organised in the 7 PRD sections (§10). Renders only what the projection allows. */
export function ProfileDetails({ profile, contactSlot }: { profile: PublicProfile; contactSlot?: React.ReactNode }) {
  const { t } = useTranslation();
  const { label, maslakLabel } = useOptions();
  const p = profile;
  const list = (g: Parameters<typeof label>[0], vals: string[]) => (vals.length ? vals.map((v) => label(g, v) ?? v).join(', ') : undefined);
  const range = (a?: number, b?: number, fmt: (n: number) => string = String) => (a == null && b == null ? undefined : `${a != null ? fmt(a) : '…'} – ${b != null ? fmt(b) : '…'}`);

  return (
    <View>
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <ProfilePhoto profile={p} height={260} />
        {p.photos.length > 1 ? (
          <View style={{ flexDirection: 'row', gap: space.xs, padding: space.sm }}>
            {p.photos.slice(1).map((ph) => (
              <View key={ph.id} style={{ flex: 1 }}>
                <ProfilePhoto profile={{ ...p, photos: [ph] }} height={110} rounded={false} />
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ padding: space.lg, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' }}>
            <Text variant="h1">{p.displayName}</Text>
            <Text variant="caption">{profileCode(p.id)}</Text>
            {p.boosted ? <Badge label={`★ ${t('discover.boosted')}`} /> : null}
          </View>
          <Text variant="label" color={colors.muted}>
            {t('common.years', { n: p.age })} · {formatHeight(p.heightCm)} · {[p.location.city, p.location.country].join(', ')}
          </Text>
          {p.createdFor !== 'self' ? <Text variant="caption">{t('profile.createdBy', { who: label('createdFor', p.createdFor) })}</Text> : null}
          {p.photosHidden ? <Text variant="caption">🔒 {t('profile.photosHidden')}</Text> : null}
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
