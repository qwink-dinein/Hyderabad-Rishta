import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { profileCompletion } from '@/domain/completion';
import { formatDate } from '@/domain/format';
import { useDashboard, useMyProfile } from '@/hooks/queries';
import { useBoostStatus } from '@/hooks/useBoostStatus';
import { colors, radius, shadow, space } from '@/theme/tokens';
import { ProgressRing } from './ProgressRing';
import { Button } from './ui/Button';
import { Icon, type IconName } from './ui/Icon';
import { Row } from './ui/layout';
import { Text } from './ui/Text';

/** Home: real completion from the saved biodata; opens the first section that still needs details. */
export function CompletionCard() {
  const { t } = useTranslation();
  const { data: me } = useMyProfile();
  if (!me) return null;
  const c = profileCompletion(me.biodata);
  const open = () => router.push({ pathname: '/biodata', params: { step: String(c.next?.step ?? 0) } });
  if (c.complete) {
    return (
      <View style={[styles.card, styles.row]} testID="completion-done">
        <ProgressRing percent={100} size={52} label={t('completion.a11y', { percent: 100 })} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t('completion.doneTitle')}</Text>
          <Text variant="caption">{t('completion.doneBody')}</Text>
        </View>
      </View>
    );
  }
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${t('completion.title')}. ${t('completion.a11y', { percent: c.percent })}`} style={styles.card} testID="completion-card">
      <Row gap={space.md} style={{ alignItems: 'center' }}>
        <ProgressRing percent={c.percent} label={t('completion.a11y', { percent: c.percent })} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t('completion.title')}</Text>
          <Text variant="caption">{t('completion.body')}</Text>
          {c.next ? (
            <Text variant="label" color={colors.goldDeep} testID="completion-next">
              {t('completion.next', { item: t(`completion.item.${c.next.key}`) })}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronRight" size={18} color={colors.muted} />
      </Row>
      <Button label={t('completion.cta')} size="sm" onPress={open} style={{ alignSelf: 'flex-start' }} testID="completion-cta" />
    </Pressable>
  );
}

/** Home: three real counts (others' views, shortlists of you, interests received). No trends we can't back up. */
export function ActivityStats() {
  const { t } = useTranslation();
  const { data: me } = useMyProfile();
  const { data: m } = useDashboard();
  if (!me || !m) return null;
  const live = me.status === 'published' || me.status === 'paused';
  const none = !m.views && !m.shortlistedBy && !m.requestsReceived;
  const tile = (icon: IconName, label: string, value: number, go: string, id: string) => (
    <Pressable key={id} onPress={() => router.push(go as never)} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={styles.tile} testID={`stat-${id}`}>
      <Icon name={icon} size={18} color={colors.goldDeep} />
      <Text variant="h2" style={{ lineHeight: 30 }}>
        {value}
      </Text>
      <Text variant="caption" numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <View style={{ marginTop: space.md, gap: space.sm }} testID="home-stats">
      <Text variant="overline">{t('stats.title')}</Text>
      {!live ? (
        <View style={styles.empty}>
          <Text variant="caption">{t('stats.emptyUnpublished')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.tiles}>
            {tile('eye', t('stats.views'), m.views, '/activity', 'views')}
            {tile('heart', t('stats.shortlists'), m.shortlistedBy, '/activity', 'shortlists')}
            {tile('mail', t('stats.interests'), m.requestsReceived, '/requests', 'interests')}
          </View>
          {none ? <Text variant="caption">{t('stats.empty')}</Text> : null}
        </>
      )}
    </View>
  );
}

const SNOOZE_KEY = 'hr.boost.reminderSnoozedAt';
const SNOOZE_MS = 3 * 86400000;

/** Home: Boost card that follows the real state — publish first, active status, or the configured price. */
export function BoostPromoCard() {
  const { t } = useTranslation();
  const { data: me } = useMyProfile();
  const s = useBoostStatus();
  const [snoozed, setSnoozed] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((v) => setSnoozed(!!v && Date.now() - Number(v) < SNOOZE_MS))
      .catch(() => setSnoozed(false));
  }, []);
  if (!s.nudge || s.nudge === 'no_profile' || s.nudge === 'disabled') return null;

  if (s.nudge === 'active') {
    return (
      <Pressable onPress={() => router.push('/boost')} accessibilityRole="button" style={[styles.boost, styles.row]} testID="boost-active-card">
        <View style={styles.crown}>
          <Icon name="crown" size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t('myBoost.activeTitle')}</Text>
          <Text variant="caption">{t('myBoost.validTill', { date: formatDate(s.until) })}</Text>
        </View>
        <Text variant="label" color={colors.emerald}>
          {t('myBoost.titleMy')}
        </Text>
        <Icon name="chevronRight" size={18} color={colors.muted} />
      </Pressable>
    );
  }
  if (s.nudge === 'not_published') {
    return (
      <View style={styles.boost} testID="boost-publish-card">
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          <View style={styles.crown}>
            <Icon name="crown" size={20} color={colors.white} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('boost.notPublishedTitle')}</Text>
            <Text variant="caption">{t('boost.notPublishedBody')}</Text>
          </View>
        </Row>
        <Button label={t('boost.notPublishedCta')} kind="secondary" size="sm" arrow onPress={() => router.push(me && me.lastStep >= 7 ? '/biodata/preview' : '/biodata')} style={{ alignSelf: 'flex-start' }} />
      </View>
    );
  }
  if (snoozed) return null;
  return (
    <View style={styles.boost} testID="boost-reminder">
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={styles.crown}>
          <Icon name="crown" size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t('home.boostTitle')}</Text>
          <Text variant="caption">{t('home.boostBody')}</Text>
          <Text variant="label" color={colors.goldDeep} testID="boost-price">
            {s.free ? t('me.boostHintFree') : s.fromPrice ? t('me.boostHintFrom', { price: s.fromPrice }) : ''}
          </Text>
        </View>
      </Row>
      <Row gap={space.sm}>
        <Button
          label={t('boost.notNow')}
          kind="ghost"
          size="sm"
          onPress={() => {
            setSnoozed(true);
            AsyncStorage.setItem(SNOOZE_KEY, String(Date.now())).catch(() => undefined);
          }}
          style={{ flex: 1 }}
          testID="boost-reminder-later"
        />
        <Button label={s.free ? t('myBoost.activateFree') : t('me.boostMy')} kind="gold" size="sm" arrow onPress={() => router.push('/boost')} style={{ flex: 1.6 }} testID="boost-reminder-cta" />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md, padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, minWidth: 0, padding: space.md, gap: 2, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  empty: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.sage },
  boost: { marginTop: space.md, padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  crown: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
});
