import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptic, type HapticKind } from '@/services/feedback';
import { isRTL } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, radius } from '@/theme/tokens';

/**
 * Motion primitives (owner request 2026-11-01: "button animations must be very premium, and the
 * navigation to the next screen too"). Values follow the animate-expo / Emil Kowalski rules:
 *  - press feedback starts on press-IN (before the finger lifts), 97% scale, 120 ms strong ease-out,
 *    release 160 ms; never longer — buttons are touched dozens of times a session;
 *  - only transform and opacity animate (UI thread via the native driver), except the progress fill,
 *    an absolutely positioned childless bar, the one case where animating width is cheap;
 *  - entrances: 8–12 px rise + fade, 260 ms, 50 ms stagger, once; success: scale 0.9 → 1 + opacity;
 *  - Reduce Motion: no movement, short fades only. Haptics fire in the same frame as the visual.
 */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const native = Platform.OS !== 'web';

/** Scale-on-press for any pressable: returns handlers + the animated style to put on the moving view. */
export function usePressScale(opts: { scale?: number; haptic?: HapticKind | false; disabled?: boolean } = {}) {
  const { scale = 0.97, disabled } = opts;
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(1));
  const to = (value: number, duration: number) => Animated.timing(v, { toValue: value, duration, easing: EASE_OUT, useNativeDriver: native }).start();
  return {
    style: { transform: [{ scale: v }] },
    onPressIn: () => {
      if (disabled) return;
      if (!reduced) to(scale, 120);
      if (opts.haptic) haptic(opts.haptic);
    },
    onPressOut: () => {
      if (!reduced) to(1, 160);
    },
  };
}

/** A Pressable whose content dips to 97% the moment it is touched (and springs back on release). */
export function PressableScale({
  children,
  style,
  scale,
  hapticKind = false,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { children: ReactNode; style?: StyleProp<ViewStyle>; scale?: number; hapticKind?: HapticKind | false }) {
  const p = usePressScale({ scale, haptic: hapticKind, disabled: !!disabled });
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        p.onPressIn();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        p.onPressOut();
        rest.onPressOut?.(e);
      }}
      pressRetentionOffset={16}
    >
      <Animated.View style={[style, p.style]}>{children}</Animated.View>
    </Pressable>
  );
}

/** Children rise 10 px and fade in, one after another (50 ms apart), once on mount. */
export function Stagger({ children, delay = 0, step = 50, rise = 10, style }: { children: ReactNode[] | ReactNode; delay?: number; step?: number; rise?: number; style?: StyleProp<ViewStyle> }) {
  const list = (Array.isArray(children) ? children : [children]).filter((c) => c != null && c !== false);
  return (
    <View style={style}>
      {list.map((c, i) => (
        <FadeIn key={i} delay={delay + i * step} rise={rise}>
          {c}
        </FadeIn>
      ))}
    </View>
  );
}

export function FadeIn({ children, delay = 0, rise = 10, duration = 260, style }: { children: ReactNode; delay?: number; rise?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: 1, duration: reduced ? 140 : duration, delay: reduced ? 0 : delay, easing: EASE_OUT, useNativeDriver: native });
    a.start();
    return () => a.stop();
  }, [v, delay, duration, reduced]);
  const dy = reduced ? 0 : rise;
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] }) }] }]}>{children}</Animated.View>;
}

/** A success mark that pops in (0.9 → 1 + fade, 340 ms) with a success haptic on the same frame. */
export function PopIn({ children, delay = 0, onShown }: { children: ReactNode; delay?: number; onShown?: () => void }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  const shown = useRef(onShown);
  useEffect(() => {
    const t = setTimeout(() => {
      shown.current?.();
      Animated.timing(v, { toValue: 1, duration: reduced ? 140 : 340, easing: EASE_OUT, useNativeDriver: native }).start();
    }, delay);
    return () => clearTimeout(t);
  }, [v, delay, reduced]);
  const from = reduced ? 1 : 0.9;
  return <Animated.View style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [from, 1] }) }] }}>{children}</Animated.View>;
}

/**
 * Onboarding progress bar: glides from where the previous screen left it to `value` (0–1) in 420 ms.
 * `from` is the previous screen's value so the bar continues instead of restarting.
 */
export function ProgressBar({ value, from, testID, fill = colors.emerald, track = colors.border }: { value: number; from?: number; testID?: string; fill?: string; track?: string }) {
  const reduced = useReducedMotion();
  const rtl = isRTL(useSession((s) => s.lang));
  const [v] = useState(() => new Animated.Value(from ?? value));
  useEffect(() => {
    const a = Animated.timing(v, { toValue: value, duration: reduced ? 0 : 420, delay: reduced ? 0 : 120, easing: EASE_OUT, useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [v, value, reduced]);
  return (
    <View
      style={[styles.track, { backgroundColor: track }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      testID={testID}
    >
      <Animated.View style={[styles.fill, rtl ? { right: 0 } : { left: 0 }, { backgroundColor: fill, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: 'hidden', flex: 1 },
  fill: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.pill, backgroundColor: colors.emerald },
});
