import { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { declinedRecently, relationBadge } from '@/domain/connections';
import { formatHeight } from '@/domain/format';
import type { PublicProfile } from '@/domain/types';
import { useOptions } from '@/hooks/useOptions';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptic } from '@/services/feedback';
import { backend } from '@/services';
import { colors, motion, radius, shadow, space } from '@/theme/tokens';
import { Button } from './ui/Button';
import { Badge, confirm, useToast } from './ui/feedback';
import { Icon, type IconName } from './ui/Icon';
import { Text } from './ui/Text';

/** One static, pre-blurred violet image (1 KB, bundled) stands in for every photo the viewer can't see. */
const PHOTO_ON_REQUEST = require('../../assets/placeholders/photo-on-request.webp');

/**
 * The member's photo (respecting the owner's visibility setting) — or, when there's no photo the viewer may
 * see (photos restricted, or none uploaded), a static blurred image with a lock and "Photo on request"
 * (owner 2026-11-09; replaces the bride/groom portraits). The placeholder is the same picture for everyone and
 * contains no member's photo, so nothing is revealed and nothing extra is downloaded. Restricted photos never
 * reach the client. Small avatars show the lock only.
 */
export const ProfilePhoto = memo(function ProfilePhoto({ profile, height = 200, rounded = true, index = 0 }: { profile: PublicProfile; height?: number | '100%'; rounded?: boolean; index?: number }) {
  const { t } = useTranslation();
  // Only photos the server sent (the owner's visibility rule applied) can ever be shown.
  const uri = profile.photos[Math.min(index, Math.max(0, profile.photos.length - 1))]?.uri;
  const [photoFailed, setPhotoFailed] = useState<string | null>(null);
  const r = rounded ? { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg } : null;
  if (uri && photoFailed !== uri) {
    return <Image source={{ uri }} onError={() => setPhotoFailed(uri)} style={[{ height, width: '100%' }, r]} contentFit="cover" contentPosition="top" transition={200} cachePolicy="memory-disk" accessibilityLabel={profile.displayName} />;
  }
  const avatar = typeof height === 'number' && height < 120;
  return (
    <View style={[{ height, width: '100%', overflow: 'hidden', backgroundColor: colors.emeraldSoft }, r]} accessibilityLabel={`${profile.displayName}, ${t('card.photoHidden')}`} testID="photo-on-request">
      <Image source={PHOTO_ON_REQUEST} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory" accessible={false} />
      <View style={[StyleSheet.absoluteFill, styles.lockCenter]} pointerEvents="none">
        <Icon name="lock" size={avatar ? 20 : 44} color={colors.white} strokeWidth={2.4} />
        {avatar ? null : (
          <Text variant="bodyStrong" color={colors.white} center style={styles.lockText}>
            {t('card.photoHidden')}
          </Text>
        )}
      </View>
    </View>
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
            : { label: t('card.sendInterest'), kind: 'primary', icon: 'send', go: () => router.push({ pathname: '/profile/[id]', params: { id: profile.id, express: '1' } }) };

  if (variant === 'standard') {
    return (
      <ListCard
        profile={profile}
        shortlisted={shortlisted}
        onToggleShortlist={onToggleShortlist}
        onOpen={onOpen}
        primary={primary}
        facts={{ edu, prof, place, tongue, maslak, marital: label('marital', profile.maritalStatus) ?? '' }}
        more={moreFacts(profile, label, t)}
        rel={rel && relLabel ? { label: relLabel, tone: rel.tone, connected: rel.key === 'connected' } : null}
        summary={summary}
      />
    );
  }
  const featured = variant === 'featured';
  return (
    <Animated.View style={[styles.card, featured && styles.cardFeatured, profile.boosted && styles.cardBoosted, { transform: [{ scale: press }] }]}>
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
            {/* Rail cards keep one line: "Bachelor's · IT" (same height for every card). */}
            {featured ? <Meta icon="cap" text={[edu, prof].filter(Boolean).join(' · ')} /> : <Meta icon="cap" text={edu} />}
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

type MoreFacts = { about?: string; prays?: string; native?: string; family?: string; income?: string; seeks?: string };
type LabelFn = ReturnType<typeof useOptions>['label'];
type TFn = ReturnType<typeof useTranslation>['t'];

/**
 * The extra card details (owner request 2026-11-02: the card looked empty on wide screens). Everything
 * here comes from the privacy-filtered profile the server sent: hidden family / income never arrive.
 */
function moreFacts(p: PublicProfile, label: LabelFn, t: TFn): MoreFacts {
  const keep = (v?: string) => (v && v !== 'prefer_not' && v !== 'undisclosed' ? v : undefined);
  const namaz = keep(p.religion.namaz);
  const familyType = p.family?.familyType === 'other' ? undefined : keep(p.family?.familyType);
  const income = keep(p.career.income);
  const native = p.location.nativePlace?.trim();
  const pr = p.preferences;
  const seeking = p.profileType === 'groom' ? 'bride' : 'groom';
  const ages = pr?.ageMin && pr?.ageMax ? `\u2066${pr.ageMin}–${pr.ageMax}\u2069` : '';
  const where = pr?.cities?.[0] ?? pr?.states?.[0] ?? '';
  return {
    about: p.aboutMe?.trim() || undefined,
    prays: namaz ? t('card.prays', { v: label('practice', namaz) }) : undefined,
    native: native ? t('card.native', { v: native }) : undefined,
    family: familyType ? t('card.family', { v: label('familyType', familyType) }) : undefined,
    income: income ? t('card.income', { v: label('income', income) }) : undefined,
    seeks: t('card.seeks', { who: label('lookingFor', seeking), more: [ages, where].filter(Boolean).join(' · ') }).replace(/[,،]\s*$/, ''),
  };
}

/** Loading placeholder with a soft pulse (static when Reduce Motion is on). */
type Primary = { label: string; kind: 'primary' | 'secondary'; icon?: IconName; go: () => void } | null;
const NEW_DAYS = 14;

/**
 * Discover / Shortlist card (Design PRD "Discover Screen & Premium Matrimonial Profile Cards", 2026-11-01):
 * photo on the start side (~45 % boosted, ~38 % ordinary), biodata on the other, actions below. Boosted
 * profiles get the champagne-gold edge, gold photo frame and ★ Boosted badge; ordinary cards are more compact.
 * No public engagement numbers and no verification tick (neither exists as a real, private-safe signal).
 */
const ListCard = memo(function ListCard({ profile, shortlisted, onToggleShortlist, onOpen, primary, facts, more, rel, summary }: {
  profile: PublicProfile;
  shortlisted: boolean;
  onToggleShortlist: (id: string) => void;
  onOpen: (id: string) => void;
  primary: Primary;
  facts: { edu?: string; prof?: string; place: string; tongue?: string; maslak?: string; marital: string };
  more: MoreFacts;
  rel: { label: string; tone: 'gold' | 'emerald' | 'muted' | 'danger' | 'success'; connected: boolean } | null;
  summary: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  // Small phones: keep both button labels on one line by dropping their icons (text never shrinks).
  const { width } = useWindowDimensions();
  const narrow = width < 360;
  // Wide screens (tablet / laptop) have room beside the tall photo: show the extra details there.
  const wide = width >= 600;
  const boosted = !!profile.boosted;
  const photos = profile.photos.length;
  const [idx, setIdx] = useState(0);
  const [menu, setMenu] = useState(false);
  const [enter] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    Animated.timing(enter, { toValue: 1, duration: motion.fade, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [enter, reduced]);
  const [mountedAt] = useState(() => Date.now());
  const isNew = !boosted && !!profile.publishedAt && mountedAt - new Date(profile.publishedAt).getTime() < NEW_DAYS * 86400000;
  const step = (d: number) => setIdx((i) => (i + d + photos) % photos);

  const block = async () => {
    setMenu(false);
    const ok = await confirm({ title: t('card.blockTitle', { name: profile.displayName }), body: t('card.blockBody'), confirmLabel: t('card.block'), danger: true });
    if (!ok) return;
    try {
      await backend.blockProfile(profile.id);
      useToast.getState().show(t('card.blocked'));
      qc.invalidateQueries();
    } catch {
      useToast.getState().show(t('common.somethingWrong'), 'danger');
    }
  };

  return (
    <Animated.View
      style={[
        styles.lcard,
        boosted && styles.lcardBoosted,
        { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
      testID={`list-card-${profile.id}`}
    >
      <View style={styles.lrow}>
        <View style={[styles.lphoto, boosted ? styles.lphotoBoosted : styles.lphotoCompact]}>
          <Pressable onPress={() => onOpen(profile.id)} accessibilityRole="button" accessibilityLabel={`${t('card.view')}: ${summary}`} style={StyleSheet.absoluteFill}>
            <ProfilePhoto profile={profile} height="100%" rounded={false} index={idx} />
          </Pressable>
          {photos > 1 ? (
            <>
              <View style={styles.lcount} pointerEvents="none">
                <Text variant="caption" color={colors.ivory} style={{ fontSize: 12 }}>
                  {idx + 1}/{photos}
                </Text>
              </View>
              <Pressable onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel={t('card.prevPhoto')} hitSlop={6} style={[styles.larrow, { left: 6 }]}>
                <Icon name="chevronLeft" size={16} color={colors.emerald} />
              </Pressable>
              <Pressable onPress={() => step(1)} accessibilityRole="button" accessibilityLabel={t('card.nextPhoto')} hitSlop={6} style={[styles.larrow, { right: 6 }]}>
                <Icon name="chevronRight" size={16} color={colors.emerald} />
              </Pressable>
              <View style={styles.ldots} pointerEvents="none">
                {Array.from({ length: Math.min(photos, 5) }, (_, i) => (
                  <View key={i} style={[styles.ldot, i === Math.min(idx, 4) && styles.ldotOn]} />
                ))}
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.linfo}>
          <View style={styles.ltop}>
            {boosted ? (
              <View style={styles.lboost} testID={`boosted-${profile.id}`}>
                <Icon name="star" size={13} color={colors.goldDeep} />
                <Text variant="caption" color={colors.goldDeep} style={styles.lbadgeText}>
                  {t('discover.boosted')}
                </Text>
              </View>
            ) : isNew ? (
              <View style={styles.lnew}>
                <Text variant="caption" color={colors.emerald} style={styles.lbadgeText}>
                  {t('card.new')}
                </Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            <HeartButton on={shortlisted} onToggle={() => onToggleShortlist(profile.id)} tone="plain" style={styles.lheart} />
            <Pressable onPress={() => setMenu((m) => !m)} accessibilityRole="button" accessibilityLabel={t('card.more')} accessibilityState={{ expanded: menu }} hitSlop={6} style={styles.lmore} testID={`card-menu-${profile.id}`}>
              <Icon name="dots" size={20} color={colors.charcoal} />
            </Pressable>
          </View>

          <Pressable onPress={() => onOpen(profile.id)} accessible={false} style={{ gap: 2 }}>
            <Text variant="h2" numberOfLines={1} style={{ fontSize: boosted ? 22 : 20 }}>
              {profile.displayName}, {profile.age}
            </Text>
            <Text variant="caption">{profile.code}</Text>
          </Pressable>
          {rel ? (
            <View style={styles.relation} testID={`relation-${profile.id}`}>
              <Badge label={`${rel.connected ? '✓ ' : ''}${rel.label}`} tone={rel.tone} />
            </View>
          ) : null}
          <View style={{ gap: 3, marginTop: 2 }}>
            <Meta icon="ruler" text={formatHeight(profile.heightCm, false)} />
            <Meta icon="mapPin" text={facts.place} />
            <Meta icon="cap" text={facts.edu} />
            <Meta icon="briefcase" text={facts.prof} />
          </View>
          <View style={styles.tags}>
            {facts.marital ? <Badge label={facts.marital} tone="muted" /> : null}
            {facts.tongue ? <Badge label={facts.tongue} tone="emerald" /> : null}
            {facts.maslak ? <Badge label={facts.maslak} tone="muted" /> : null}
          </View>
          {more.about && (wide || boosted) ? (
            <Text variant="body" color={colors.charcoal} numberOfLines={wide ? 3 : 2} style={styles.labout} testID={`card-about-${profile.id}`}>
              “{more.about}”
            </Text>
          ) : null}
          {wide ? (
            <View style={styles.lmoreFacts} testID={`card-more-${profile.id}`}>
              <Meta icon="star" text={more.prays} />
              <Meta icon="home" text={more.native} />
              <Meta icon="users" text={more.family} />
              <Meta icon="chart" text={more.income} />
              {more.seeks ? (
                <View style={styles.lseeks}>
                  <Icon name="search" size={15} color={colors.goldDeep} />
                  <Text variant="label" color={colors.goldDeep} numberOfLines={2} style={{ flexShrink: 1 }}>
                    {more.seeks}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.lactions}>
        <Button label={t('card.viewShort')} kind="secondary" size="sm" icon={narrow ? undefined : <Icon name="eye" size={16} color={colors.emerald} />} onPress={() => onOpen(profile.id)} style={{ flex: 1 }} />
        {primary ? (
          <Button
            label={primary.label}
            kind={primary.kind}
            size="sm"
            icon={primary.icon && !narrow ? <Icon name={primary.icon} size={15} color={primary.kind === 'primary' ? colors.white : colors.emerald} /> : undefined}
            onPress={primary.go}
            style={{ flex: 1.2 }}
            testID={`card-express-${profile.id}`}
          />
        ) : null}
      </View>

      {menu ? (
        <View style={styles.lmenu} testID={`card-menu-list-${profile.id}`}>
          <Pressable
            onPress={() => {
              setMenu(false);
              router.push({ pathname: '/profile/[id]', params: { id: profile.id, report: '1' } });
            }}
            accessibilityRole="menuitem"
            style={styles.lmenuItem}
          >
            <Icon name="flag" size={16} color={colors.charcoal} />
            <Text variant="label">{t('card.report')}</Text>
          </Pressable>
          <Pressable onPress={block} accessibilityRole="menuitem" style={styles.lmenuItem} testID={`card-block-${profile.id}`}>
            <Icon name="ban" size={16} color={colors.danger} />
            <Text variant="label" color={colors.danger}>
              {t('card.block')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
});

export function ProfileCardSkeleton({ layout = 'card' }: { layout?: 'card' | 'list' } = {}) {
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
  if (layout === 'list') {
    return (
      <Animated.View style={[styles.lcard, { opacity: o }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.lrow}>
          <View style={[styles.lphoto, styles.lphotoCompact, { backgroundColor: colors.skeleton }]} />
          <View style={[styles.linfo, { gap: space.sm, paddingTop: space.sm }]}>
            <View style={[styles.bar, { width: '70%', height: 18 }]} />
            <View style={[styles.bar, { width: '40%' }]} />
            <View style={[styles.bar, { width: '80%' }]} />
            <View style={[styles.bar, { width: '65%' }]} />
          </View>
        </View>
        <View style={styles.lactions}>
          <View style={[styles.bar, { flex: 1, height: 36, borderRadius: radius.pill }]} />
          <View style={[styles.bar, { flex: 1.2, height: 36, borderRadius: radius.pill }]} />
        </View>
      </Animated.View>
    );
  }
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
  // Boosted cards: a subtle gold edge (with the ★ Boosted badge), never a louder card.
  cardBoosted: { borderColor: colors.gold, borderWidth: 1.5 },
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
    backgroundColor: 'rgba(42,11,19,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartOn: { backgroundColor: 'rgba(255,255,255,0.92)' },
  heartPlain: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  boost: { position: 'absolute', top: space.md, left: space.md },
  lockCenter: { alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: space.sm },
  lockText: { fontSize: 17, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  bar: { height: 12, borderRadius: 6, backgroundColor: colors.skeleton },
  // List card (Discover / Shortlist)
  lcard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md, ...shadow.card },
  lcardBoosted: { borderColor: colors.gold, borderWidth: 1.5, backgroundColor: colors.white, shadowColor: colors.goldMuted, shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  lrow: { flexDirection: 'row', gap: space.md },
  lphoto: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.sage },
  lphotoBoosted: { width: '45%', aspectRatio: 0.74, borderWidth: 1.5, borderColor: colors.gold },
  lphotoCompact: { width: '38%', aspectRatio: 0.8 },
  lcount: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(42,11,19,0.6)' },
  larrow: { position: 'absolute', top: '50%', marginTop: -14, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
  ldots: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: 4 },
  ldot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.55)' },
  ldotOn: { backgroundColor: colors.white },
  linfo: { flex: 1, minWidth: 0, gap: 4 },
  ltop: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 },
  lboost: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  lnew: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.sage },
  lbadgeText: { fontSize: 12, fontWeight: '600' },
  lheart: { width: 36, height: 36 },
  lmore: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  lactions: { flexDirection: 'row', gap: space.sm },
  labout: { marginTop: space.sm, fontSize: 14, lineHeight: 21, fontStyle: 'italic', borderStartWidth: 2, borderStartColor: colors.gold, paddingStart: space.sm },
  lmoreFacts: { marginTop: space.sm, gap: 5, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  lseeks: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  lmenu: { position: 'absolute', top: 48, right: space.md, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, minWidth: 170, ...shadow.card, elevation: 8, zIndex: 10 },
  lmenuItem: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm + 2 },
});
