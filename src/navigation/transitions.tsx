import { useCallback, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { BottomTabNavigationOptions } from 'expo-router/js-tabs';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSession } from '@/state/session';
import { isRTL } from '@/i18n';
import { colors, motion } from '@/theme/tokens';

/**
 * Screen-to-screen motion, one place for the whole app (owner request 2026-10-28: "whenever the app
 * moves to the next screen, give a smooth transition").
 *
 *  - Phones: native stack transitions (60 fps on the UI thread). Android uses the iOS-style slide so
 *    both platforms feel the same; Urdu slides from the other side; swipe-back works anywhere on iOS.
 *    Modals rise from the bottom. Login → app (a replace) still slides forward, never a hard cut.
 *  - Tabs: a short sideways shift between tabs.
 *  - Web: browsers get no native transition, so each screen fades and rises in softly as it gains
 *    focus (also when going back).
 *  - Reduce Motion (OS setting): a quick cross-fade only.
 */
const EASE = Easing.bezier(0.22, 1, 0.36, 1); // gentle "ease-out-quint": quick start, soft landing

export function useStackTransitions(): NativeStackNavigationOptions {
  const rtl = isRTL(useSession((s) => s.lang));
  const reduced = useReducedMotion();
  if (Platform.OS === 'web') return { animation: 'none' }; // web: <ScreenTransition> below
  if (reduced) return { animation: 'fade', animationDuration: motion.fade };
  return {
    animation: Platform.OS === 'android' ? (rtl ? 'ios_from_left' : 'ios_from_right') : rtl ? 'slide_from_left' : 'default',
    animationDuration: 340,
    animationTypeForReplace: 'push',
    gestureEnabled: true,
    fullScreenGestureEnabled: true,
  };
}

export const modalTransition: NativeStackNavigationOptions = Platform.OS === 'web' ? {} : { presentation: 'modal', animation: 'slide_from_bottom' };

export function useTabTransitions(): Pick<BottomTabNavigationOptions, 'animation' | 'transitionSpec'> {
  const reduced = useReducedMotion();
  return {
    animation: reduced ? 'fade' : 'shift',
    transitionSpec: { animation: 'timing', config: { duration: reduced ? 120 : 240, easing: EASE } },
  };
}

/** Web only: fade + rise each time the screen comes into focus (push, back, or tab switch). */
export function ScreenTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(1));
  useFocusEffect(
    useCallback(() => {
      v.setValue(0);
      const a = Animated.timing(v, { toValue: 1, duration: reduced ? 140 : 320, easing: EASE, useNativeDriver: false });
      a.start();
      return () => a.stop();
    }, [v, reduced]),
  );
  const rise = reduced ? 0 : 14;
  return (
    <Animated.View style={[styles.fill, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** `screenLayout` for a stack: wraps screens on web; nested navigators animate their own screens. */
export const webScreenLayout =
  Platform.OS === 'web'
    ? ({ route, children }: { route: { name: string }; children: ReactNode }) =>
        route.name === 'admin' ? <>{children}</> : <ScreenTransition>{children}</ScreenTransition>
    : undefined;

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: colors.ivory } });
