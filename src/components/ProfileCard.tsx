import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { declinedRecently, relationBadge } from '@/domain/connections';
import { formatHeight } from '@/domain/format';
import type { PublicProfile } from '@/domain/types';
import { useOptions } from '@/hooks/useOptions';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptic } from '@/services/feedback';
import { colors, motion, radius, shadow, space } from '@/theme/tokens';
import { PersonaArt } from './art/Illustrations';
import { Button } from './ui/Button';
import { Badge } from './ui/feedback';
import { Icon, StarMotif, type IconName } from './ui/Icon';
import { Text } from './ui/Text';

/**
 * Photo (respecting the owner's visibility setting) or, with no photo, a bride or groom illustration
 * (owner request 2026-10-29) inside the gold arch. Restricted photos never reach the client.
 */
export const ProfilePhoto = memo(function ProfilePhoto({ profile, height = 200, rounded = true }: { profile: PublicProfile; height?: number | '100%'; rounded?: boolean }) {
  const { t } = useTranslation();
  const uri = profile.photos[0]?.uri;
  const r = rounded ? { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg } : null;
  if (uri) {
    return <Image source={{ uri }} style={[{ height, width: '100%' }, r]} contentFit="cover" contentPosition="top" transition={200} cachePolicy="memory-disk" accessibilityLabel={profile.displayName} />;
  }
  const kind = profile.profileType === 'groom' ? 'groom' : 'bride';
  if (typeof height === 'number' && height < 120) {
    // Avatars: just the figure on a soft field — the arch artwork needs room to read.
    return (
      <LinearGradient colors={[colors.goldSoft, colors.sage]} style={[{ height, width: '100%', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }, r]} accessibilityLabel={profile.displayName} testID={`persona-${kind}`}>
        <PersonaArt kind={kind} seed={profile.id} width={Math.round(height * 0.86)} height={Math.round(height * 0.92)} />
      </LinearGradient>
    );
  }
  return (
    <LinearGradient colors={[colors.goldSoft, colors.sage]} style={[{ height, width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, r]} accessibilityLabel={profile.displayName} testID={`persona-${kind}`}>
      <View style={styles.motifA}>
        <StarMotif size={110} opacity={0.22} color={colors.goldMuted} />
      </View>
      <View style={styles.motifB}>
        <StarMotif size={70} opacity={0.18} color={colors.goldMuted} />
      </View>
      <Svg width={150} height={180} viewBox="0 0 150 180" style={{ position: 'absolute' }}>
        <Path d="M15 180V80C15 40 50 16 75 4c25 12 60 36 60 76v100" stroke={colors.goldMuted} strokeWidth="1.6" fill="rgba(255,255,255,0.55)" />
        <Path d="M27 180V84c0-32 28-52 48-62c20 10 48 30 48 62v96" stroke={colors.gold} strokeWidth="0.8" fill="none" opacity={0.7} />
      </Svg>
      <View style={styles.persona}>
        <PersonaArt kind={kind} seed={profile.id} width={120} height={140} />
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

/** Shortlist heart with a short fill/scale animation, light haptic and an accessible announcement. */
export const HeartButton = memo(function HeartButton({ on, onToggle, style, tone = 'overlay' }: { on: boolean; onToggle: () => void; style?: object; tone?: 'overlay' | 'plain' }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const prev = useRef(on);
  useEffect(() => {
    if (prev.current === on) return;
    prev.current = on;
    if (reduced) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.25, duration: motion.heart / 2, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: motion.heart / 2, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [on, reduced, scale]);
  const overlay = tone === 'overlay';
  return (
    <Pressable
      onPress={() => {
        haptic('select');
        AccessibilityInfo.announceForAccessibility(on ? t('card.removedFromShortlist') : t('card.addedToShortlist'));
        onToggle();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      aria-selected={on}
      accessibilityLabel={on ? t('card.shortlisted') : t('card.shortlist')}
      hitSlop={8}
      style={[overlay ? styles.heart : styles.heartPlain, on && overlay && styles.heartOn, style]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon name={on ? 'heartFilled' : 'heart'} color={on ? colors.goldMuted : overlay ? colors.white : colors.emerald} size={22} />
      </Animated.View>
    </Pressable>
  );
});

function Meta({ icon, text }: { icon: IconName; text?: string }) {
  if (!text) return null;
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={15} color={colors.goldMuted} />
      <Text variant="label" color={colors.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
        {text}
      </Text>
    </View>
  );
}

export const ProfileCard = memo(function ProfileCard({ profile, shortlisted, onToggleShortlist, onOpen, variant = 'standard' }: {
  profile: PublicProfile;
  shortlisted: boolean;
  onToggleShortlist: (id: string) => void;
  onOpen: (id: string) => void;
  /** `featured`: narrower card for horizontal rails. */
  variant?: 'standard' | 'featured';
}) {
  const { t } = useTranslation();
  const { label, maslakLabel } = useOptions();
  const reduced = useReducedMotion();
  const [press] = useState(() => new Animated.Value(1));
  const edu = label('education', profile.career.education, profile.career.educationOther);
  const prof = label('profession', profile.career.profession, profile.career.professionOther);
  const place = [profile.location.city, profile.location.state].filter(Boolean).join(', ');
  const rel = relationBadge(profile.relation);
  const relLabel = rel ? t(`card.rel.${rel.key}`) : null;
  const summary = [`${profile.displayName}, ${t('common.years', { n: profile.age })}, ${place}`, relLabel].filter(Boolean).join('. ');
  const tongue = label('tongue', profile.motherTongue);
  const maslak = profile.religion.maslak && profile.religion.maslak !== 'prefer_not' ? maslakLabel(profile.religion.maslak, profile.religion.subMaslak, profile.religion.maslakOther) : undefined;

  const animate = (to: number) => {
    if (reduced) return;
    Animated.timing(press, { toValue: to, duration: motion.press, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  // The primary action reflects your history with this person (no blind re-sends).
  const status = profile.relation?.status;
  const dir = profile.relation?.direction;
  const declined = declinedRecently(profile.relation);
  const primary: { label: string; kind: 'primary' | 'secondary'; icon?: IconName; go: () => void } | null =
    status === 'accepted'
      ? { label: t('card.rel.connected'), kind: 'secondary', icon: 'check', go: () => onOpen(profile.id) }
      : status === 'pending' && dir === 'sent'
        ? { label: t('card.rel.sent'), kind: 'secondary', icon: 'check', go: () => router.push('/requests') }
        : status === 'pending' && dir === 'received'
          ? { label: t('card.respond'), kind: 'primary', go: () => router.push('/requests') }
          : declined || !profile.acceptsRequests || status === 'blocked'
            ? null
            : { label: t('profile.expressInterest'), kind: 'primary', go: () => router.push({ pathname: '/profile/[id]', params: { id: profile.id, express: '1' } }) };

  const featured = variant === 'featured';
  return (
    <Animated.View style={[styles.card, featured && styles.cardFeatured, { transform: [{ scale: press }] }]}>
      <Pressable
        onPress={() => onOpen(profile.id)}
        onPressIn={() => animate(0.985)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityLabel={`${t('card.view')}: ${summary}`}
      >
        <View style={styles.photo}>
          <ProfilePhoto profile={profile} height="100%" />
        </View>
        {profile.boosted ? (
          <View style={styles.boost}>
            <Badge label={`★ ${t('discover.boosted')}`} />
          </View>
        ) : null}
        <View style={[styles.body, featured && { padding: space.md }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
            <Text variant="h2" numberOfLines={1} style={{ flexShrink: 1, fontSize: featured ? 18 : 21 }}>
              {profile.displayName}, {profile.age}
            </Text>
            <Text variant="caption" style={{ marginStart: 'auto' }}>
              {profile.code}
            </Text>
          </View>
          {rel && relLabel ? (
            <View style={styles.relation} testID={`relation-${profile.id}`}>
              <Badge label={`${rel.key === 'connected' ? '✓ ' : ''}${relLabel}`} tone={rel.tone} />
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Meta icon="ruler" text={formatHeight(profile.heightCm, false)} />
            <Meta icon="mapPin" text={place} />
          </View>
          <View style={styles.metaRow}>
            <Meta icon="cap" text={edu} />
            {!featured ? <Meta icon="briefcase" text={prof} /> : null}
          </View>
          {!featured ? (
            <View style={styles.tags}>
              <Badge label={label('marital', profile.maritalStatus) ?? ''} tone="muted" />
              {tongue ? <Badge label={tongue} tone="emerald" /> : null}
              {maslak ? <Badge label={maslak} tone="muted" /> : null}
            </View>
          ) : null}
        </View>
      </Pressable>
      {!featured ? (
        <View style={styles.actions}>
          <Button label={t('card.viewShort')} kind="secondary" size="sm" onPress={() => onOpen(profile.id)} style={{ flex: 1 }} />
          {primary ? (
            <Button
              label={primary.label}
              kind={primary.kind}
              size="sm"
              icon={primary.icon ? <Icon name={primary.icon} size={15} color={primary.kind === 'primary' ? colors.white : colors.emerald} /> : undefined}
              onPress={primary.go}
              style={{ flex: 1.3 }}
              testID={`card-express-${profile.id}`}
            />
          ) : null}
        </View>
      ) : null}
      <HeartButton on={shortlisted} onToggle={() => onToggleShortlist(profile.id)} />
    </Animated.View>
  );
});

/** Loading placeholder with a soft pulse (static when Reduce Motion is on). */
export function ProfileCardSkeleton() {
  const reduced = useReducedMotion();
  const [o] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o, reduced]);
  return (
    <Animated.View style={[styles.card, { opacity: o }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.photo, { backgroundColor: colors.skeleton }]} />
      <View style={[styles.body, { gap: space.sm }]}>
        <View style={[styles.bar, { width: '55%', height: 18 }]} />
        <View style={[styles.bar, { width: '75%' }]} />
        <View style={[styles.bar, { width: '60%' }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.card },
  cardFeatured: { width: 230 },
  photo: { width: '100%', aspectRatio: 4 / 5, maxHeight: 400, backgroundColor: colors.sage },
  body: { padding: space.lg, gap: 6 },
  relation: { flexDirection: 'row', marginVertical: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, maxWidth: '100%' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.xs },
  actions: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.lg },
  heart: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(11,48,40,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartOn: { backgroundColor: 'rgba(255,255,255,0.92)' },
  heartPlain: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  boost: { position: 'absolute', top: space.md, left: space.md },
  // Bottom of the figure meets the bottom of the 180-px arch (both centred).
  persona: { marginTop: 40 },
  motifA: { position: 'absolute', top: -18, left: -14 },
  motifB: { position: 'absolute', bottom: 14, right: 18 },
  lockPill: {
    position: 'absolute',
    bottom: space.md,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    backgroundColor: 'rgba(11,48,40,0.6)',
    paddingHorizontal: space.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  bar: { height: 12, borderRadius: 6, backgroundColor: colors.skeleton },
});
