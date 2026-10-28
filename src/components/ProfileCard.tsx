import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { relationBadge } from '@/domain/connections';
import { formatHeight } from '@/domain/format';
import type { PublicProfile } from '@/domain/types';
import { useOptions } from '@/hooks/useOptions';
import { colors, radius, shadow, space } from '@/theme/tokens';
import { Badge } from './ui/feedback';
import { Icon, StarMotif } from './ui/Icon';
import { Text } from './ui/Text';

/** Photo or an elegant placeholder (initial on a patterned emerald field). */
export const ProfilePhoto = memo(function ProfilePhoto({ profile, height = 200, rounded = true }: { profile: PublicProfile; height?: number; rounded?: boolean }) {
  const { t } = useTranslation();
  const uri = profile.photos[0]?.uri;
  const r = rounded ? { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg } : null;
  if (uri) {
    return <Image source={{ uri }} style={[{ height, width: '100%' }, r]} contentFit="cover" transition={200} cachePolicy="memory-disk" accessibilityLabel={profile.displayName} />;
  }
  const initial = profile.displayName.replace(/[^\p{L}]/gu, '').charAt(0).toUpperCase() || '•';
  return (
    <LinearGradient colors={[colors.emerald, colors.emeraldSoft]} style={[{ height, width: '100%', alignItems: 'center', justifyContent: 'center' }, r]}>
      <View style={styles.motifA}>
        <StarMotif size={90} opacity={0.18} />
      </View>
      <View style={styles.motifB}>
        <StarMotif size={60} opacity={0.14} />
      </View>
      <View style={styles.initialRing}>
        <Text variant="h1" color={colors.gold} style={{ lineHeight: 44 }}>
          {initial}
        </Text>
      </View>
      {profile.photosHidden ? (
        <View style={styles.lockPill}>
          <Icon name="lock" size={13} color={colors.ivory} />
          <Text variant="caption" color={colors.ivory}>
            {t('card.photoHidden')}
          </Text>
        </View>
      ) : null}
    </LinearGradient>
  );
});

export const ProfileCard = memo(function ProfileCard({ profile, shortlisted, onToggleShortlist, onOpen }: {
  profile: PublicProfile;
  shortlisted: boolean;
  onToggleShortlist: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { label, maslakLabel } = useOptions();
  const edu = label('education', profile.career.education, profile.career.educationOther);
  const prof = label('profession', profile.career.profession, profile.career.professionOther);
  const place = [profile.location.city, profile.location.state].filter(Boolean).join(', ');
  const rel = relationBadge(profile.relation);
  const relLabel = rel ? t(`card.rel.${rel.key}`) : null;
  const summary = [`${profile.displayName}, ${t('common.years', { n: profile.age })}, ${place}`, relLabel].filter(Boolean).join('. ');
  return (
    <View style={styles.card}>
      <Pressable onPress={() => onOpen(profile.id)} accessibilityRole="button" accessibilityLabel={`${t('card.view')}: ${summary}`}>
        <ProfilePhoto profile={profile} height={180} />
        {profile.boosted ? (
          <View style={styles.boost}>
            <Badge label={`★ ${t('discover.boosted')}`} />
          </View>
        ) : null}
        <View style={styles.body}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1 }}>
              {profile.displayName}
            </Text>
            <Text variant="caption">{profile.code}</Text>
          </View>
          {rel && relLabel ? (
            <View style={styles.relation} testID={`relation-${profile.id}`}>
              <Badge label={`${rel.key === 'connected' ? '✓ ' : ''}${relLabel}`} tone={rel.tone} />
            </View>
          ) : null}
          <Text variant="label" color={colors.muted}>
            {t('common.years', { n: profile.age })} · {formatHeight(profile.heightCm, false)} · {label('marital', profile.maritalStatus)}
          </Text>
          <Text variant="body" numberOfLines={1}>
            {place}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {[edu, prof].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.tags}>
            <Badge label={label('tongue', profile.motherTongue) ?? ''} tone="emerald" />
            {profile.religion.maslak && profile.religion.maslak !== 'prefer_not' ? <Badge label={maslakLabel(profile.religion.maslak, profile.religion.subMaslak, profile.religion.maslakOther) ?? ''} tone="muted" /> : null}
            {profile.location.willingToRelocate === 'yes' ? <Badge label={`${t('f.willingToRelocate')}`} tone="muted" /> : null}
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={() => onToggleShortlist(profile.id)}
        accessibilityRole="button"
        accessibilityState={{ selected: shortlisted }}
        accessibilityLabel={shortlisted ? t('card.shortlisted') : t('card.shortlist')}
        hitSlop={8}
        style={styles.heart}
      >
        <Icon name={shortlisted ? 'heartFilled' : 'heart'} color={shortlisted ? colors.gold : colors.white} size={22} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.card },
  body: { padding: space.lg, gap: 4 },
  relation: { flexDirection: 'row', marginVertical: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm },
  heart: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(18,61,50,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boost: { position: 'absolute', top: space.md, left: space.md },
  initialRing: { width: 84, height: 84, borderRadius: 42, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  motifA: { position: 'absolute', top: -14, left: -10 },
  motifB: { position: 'absolute', bottom: 10, right: 16 },
  lockPill: {
    position: 'absolute',
    bottom: space.md,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
});
