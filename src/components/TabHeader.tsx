import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useShortlistIds, useUnreadCount } from '@/hooks/queries';
import { colors, maxContentWidth, space } from '@/theme/tokens';
import { BrandMark } from './art/Illustrations';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

/** Notification bell for the top navigation (Design PRD §10) with an unread badge. */
export function BellButton() {
  const { t } = useTranslation();
  const unread = useUnreadCount();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      accessibilityRole="button"
      accessibilityLabel={unread ? t('nav.bellUnread', { count: unread }) : t('nav.notifications')}
      hitSlop={6}
      style={styles.iconBtn}
      testID="bell"
    >
      <Icon name="bell" />
      {unread ? (
        <View style={styles.badge}>
          <Text variant="caption" color={colors.emerald} style={styles.badgeText}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Saved profiles (heart + count) — the shortlist's home on Discover now that Boost has the centre tab. */
export function ShortlistButton() {
  const { t } = useTranslation();
  const { data } = useShortlistIds();
  const count = data?.length ?? 0;
  return (
    <Pressable
      onPress={() => router.push('/shortlist')}
      accessibilityRole="button"
      accessibilityLabel={t('discover.openShortlist', { count })}
      hitSlop={6}
      style={styles.iconBtn}
      testID="open-shortlist"
    >
      <Icon name={count ? 'heartFilled' : 'heart'} color={count ? colors.emerald : undefined} />
      {count ? (
        <View style={styles.badge}>
          <Text variant="caption" color={colors.emerald} style={styles.badgeText}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function SettingsButton() {
  const { t } = useTranslation();
  return (
    <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel={t('common.settings')} hitSlop={6} style={styles.iconBtn}>
      <Icon name="settings" />
    </Pressable>
  );
}

/** Top bar for tab screens: brand or title on the start side, bell (+ optional extras) on the end side. */
export function TabHeader({ title, subtitle, brand, right, settings }: { title?: string; subtitle?: string; brand?: boolean; right?: ReactNode; settings?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 }}>
        {brand ? <BrandMark size={30} color={colors.goldMuted} /> : null}
        <View style={{ flexShrink: 1 }}>
          <Text variant={brand ? 'h2' : 'h1'} numberOfLines={1} accessibilityRole="header">
            {brand ? t('common.appName') : title}
          </Text>
          {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        {right}
        {settings ? <SettingsButton /> : null}
        <BellButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.ivory },
  badgeText: { fontSize: 10.5, lineHeight: 13, fontWeight: '700' },
});
