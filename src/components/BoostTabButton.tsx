import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { useBoostNudge } from '@/hooks/useBoostNudge';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSession } from '@/state/session';
import { fontFamily } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

/**
 * The raised centre tab. While the member could boost and hasn't, it keeps reminding them —
 * quietly: a gold dot, and a soft halo that pulses every few seconds (off under Reduce Motion,
 * and never while they're already on the Boost screen).
 */
export function BoostTabButton(props: BottomTabBarButtonProps) {
  const { onPress, onLongPress, accessibilityState, style } = props;
  const { t } = useTranslation();
  const lang = useSession((s) => s.lang);
  const nudge = useBoostNudge();
  const reduced = useReducedMotion();
  // React Navigation 7 passes `aria-selected`; older builds used accessibilityState.
  const focused = !!((props as { 'aria-selected'?: boolean })['aria-selected'] ?? accessibilityState?.selected);
  const remind = nudge === 'ready';
  const active = nudge === 'active';
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!remind || reduced || focused) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [remind, reduced, focused, pulse]);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      role="tab"
      aria-selected={focused}
      accessibilityLabel={remind ? t('nav.boostReady') : t('nav.boost')}
      style={[style, styles.wrap]}
      testID="tab-boost"
    >
      <View style={styles.lift}>
        {remind ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }] }]}
          />
        ) : null}
        <LinearGradient colors={focused || active ? [colors.emeraldSoft, colors.forest] : [colors.gold, colors.goldMuted]} style={styles.circle}>
          <Icon name="star" size={24} color={focused || active ? colors.gold : colors.white} strokeWidth={2.2} />
        </LinearGradient>
        {remind ? <View style={styles.dot} testID="boost-reminder-dot" /> : null}
      </View>
      <Text variant="caption" color={focused ? colors.emerald : colors.goldDeep} style={{ fontFamily: fontFamily(lang, 'medium'), fontSize: 11, marginTop: 2 }}>
        {t('nav.boost')}
      </Text>
    </Pressable>
  );
}

const SIZE = 56;
const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4 },
  lift: { marginTop: -26, width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.white,
    shadowColor: colors.forest,
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.gold },
  dot: { position: 'absolute', top: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.white },
});
