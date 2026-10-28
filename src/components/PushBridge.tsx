import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { qk, useNotifications } from '@/hooks/queries';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { NOTIFICATION_ICONS, useNotificationText } from '@/hooks/useNotificationText';
import { backend, type NotificationView } from '@/services';
import { haptic } from '@/services/feedback';
import { configurePush, enablePush, getPushStatus, listenToPush, setBadge } from '@/services/push';
import { useSession } from '@/state/session';
import { colors, maxContentWidth, motion, radius, shadow, space } from '@/theme/tokens';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';
import { safeDeepLink } from '@/domain/security';

/**
 * Glue between the session and phone notifications, mounted once at the root:
 *  - on sign-in, silently re-binds this phone to the account if permission was already granted;
 *  - taps on a push open the right screen and mark the notification read;
 *  - an incoming push refreshes the inbox immediately; the app-icon badge mirrors unread count;
 *  - while the app is open, a new notification slides in as an in-app banner (all platforms, incl. web).
 */
export function PushBridge() {
  const user = useSession((s) => s.user);
  const qc = useQueryClient();

  useEffect(() => {
    configurePush();
  }, []);

  useEffect(() => {
    if (!user) return;
    getPushStatus()
      .then((s) => (s === 'granted' ? enablePush(false) : undefined))
      .catch(() => undefined);
    return listenToPush({
      onTap: (deepLink, notificationId) => {
        if (notificationId) backend.markNotificationRead(notificationId).catch(() => undefined);
        qc.invalidateQueries({ queryKey: qk.notifications });
        router.push(safeDeepLink(deepLink) as Href); // a push payload is untrusted input
      },
      onReceive: () => qc.invalidateQueries({ queryKey: qk.notifications }),
    });
  }, [user, qc]);

  return user ? <ArrivalBanner /> : null;
}

function ArrivalBanner() {
  const { data } = useNotifications();
  const text = useNotificationText();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const seen = useRef<Set<string> | null>(null);
  const [current, setCurrent] = useState<NotificationView | null>(null);
  const [y] = useState(() => new Animated.Value(0));
  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  useEffect(() => {
    setBadge(unread);
  }, [unread]);

  useEffect(() => {
    if (!data) return;
    if (!seen.current) {
      seen.current = new Set(data.map((n) => n.id)); // don't replay the backlog on launch
      return;
    }
    const fresh = data.find((n) => !n.readAt && !seen.current!.has(n.id));
    for (const n of data) seen.current.add(n.id);
    if (!fresh) return;
    setCurrent(fresh);
    haptic('light');
    y.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(y, { toValue: 1, duration: motion.sheet, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [data, reduced, y]);

  // The timer belongs to the banner, not to data refreshes (a refetch must not keep it on screen).
  useEffect(() => {
    if (!current) return;
    const id = setTimeout(() => setCurrent(null), 4500);
    return () => clearTimeout(id);
  }, [current]);

  if (!current) return null;
  const { title } = text(current);
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + space.sm }]}>
      <Animated.View style={{ opacity: y, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }}>
        <Pressable
          onPress={() => {
            backend.markNotificationRead(current.id).catch(() => undefined);
            setCurrent(null);
            router.push(safeDeepLink(current.deepLink) as Href);
          }}
          accessibilityRole="button"
          accessibilityLiveRegion="polite"
          accessibilityLabel={title}
          style={styles.banner}
          testID="arrival-banner"
        >
          <View style={styles.icon}>
            <Icon name={NOTIFICATION_ICONS[current.type] ?? 'bell'} size={18} />
          </View>
          <Text variant="label" numberOfLines={2} style={{ flex: 1 }}>
            {title}
          </Text>
          <Icon name="chevronRight" size={16} color={colors.muted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: space.md, alignItems: 'center', zIndex: 50 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
    maxWidth: maxContentWidth - 64,
    minHeight: 60,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gold,
    ...shadow.card,
  },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
});
