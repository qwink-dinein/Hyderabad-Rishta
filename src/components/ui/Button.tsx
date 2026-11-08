import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, space } from '@/theme/tokens';
import { isRTL } from '@/i18n';
import { Icon } from './Icon';
import { Text } from './Text';
import { useUiLang } from '@/i18n/uiLang';
import { FadeIn, usePressScale } from './motion';

type Kind = 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger' | 'light';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  /** Show a trailing arrow (→, mirrored in RTL) — used on forward-moving primary actions. */
  arrow?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
  /** Finished state for async actions: the same button turns emerald with a tick (e.g. "Interest sent"). */
  done?: boolean;
}

/**
 * Premium redesign 2026-11-08: primary and gold actions are a champagne-to-gold surface with royal-maroon
 * text (8.4:1); secondary is warm ivory with a thin antique-gold outline; `light` sits on dark screens.
 */
const KIND: Record<Kind, { bg: string; fg: string; border: string; gilded?: boolean }> = {
  primary: { bg: colors.gold, fg: colors.forest, border: colors.gold, gilded: true },
  secondary: { bg: colors.white, fg: colors.emerald, border: colors.borderGold },
  ghost: { bg: 'transparent', fg: colors.emerald, border: 'transparent' },
  gold: { bg: colors.gold, fg: colors.forest, border: colors.gold, gilded: true },
  danger: { bg: colors.white, fg: colors.dangerText, border: colors.danger },
  light: { bg: 'transparent', fg: colors.cream, border: colors.borderGold },
};
// A soft light-to-deep sweep, not a shine: champagne at the top edge settling into royal gold.
const GILD = ['#E9CB6E', colors.gold, '#C29A2B'] as const;
const DONE: { bg: string; fg: string; border: string; gilded?: boolean } = { bg: colors.success, fg: colors.white, border: colors.success };

export const Button = memo(function Button({ label, onPress, kind = 'primary', size = 'md', loading, disabled, icon, arrow, full, style, accessibilityHint, testID, done }: ButtonProps) {
  const k = done ? DONE : KIND[kind];
  const rtl = isRTL(useUiLang());
  const inactive = disabled || loading || done;
  // Premium press: dips to 97% on touch-down; the commit buttons (primary, gold) add a light tap.
  const [outer, inner] = splitStyle(style);
  const press = usePressScale({ disabled: !!inactive, haptic: kind === 'primary' || kind === 'gold' ? 'light' : false });
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      aria-disabled={!!inactive}
      aria-busy={!!loading}
      disabled={inactive}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      pressRetentionOffset={16}
      hitSlop={size === 'sm' ? 6 : 0}
      style={[full && styles.full, outer]}
    >
      <Animated.View
        style={[
          styles.base,
          size === 'sm' ? styles.sm : styles.md,
          { backgroundColor: k.bg, borderColor: k.border },
          k.gilded && !done && styles.gilded,
          (disabled || (loading && !done)) && styles.disabled,
          inner,
          press.style,
        ]}
      >
        {k.gilded && !done ? <LinearGradient colors={GILD} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.gild} pointerEvents="none" /> : null}
        {/* Label changes (Send → Sending… → Sent) cross-fade instead of snapping. */}
        <FadeIn key={`${label}|${loading ? 1 : 0}|${done ? 1 : 0}`} rise={0} duration={180}>
          <View style={styles.row}>
            {loading ? <ActivityIndicator color={k.fg} size="small" /> : done ? <Icon name="check" size={18} color={k.fg} /> : icon}
            <Text variant="button" color={k.fg} numberOfLines={2} center style={size === 'sm' ? { fontSize: 14 } : undefined}>
              {label}
            </Text>
            {arrow && !loading && !done ? <Icon name={rtl ? 'arrowLeft' : 'arrowRight'} size={18} color={k.fg} /> : null}
          </View>
        </FadeIn>
      </Animated.View>
    </Pressable>
  );
});

/** Layout props go on the touch target (so flex/margins/width behave as before); looks go on the moving part. */
const LAYOUT = new Set(['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd', 'width', 'minWidth', 'maxWidth', 'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'zIndex']);
function splitStyle(style: StyleProp<ViewStyle>): [ViewStyle, ViewStyle] {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (LAYOUT.has(k) ? outer : inner)[k] = v;
  if (outer.width != null || outer.flex != null) inner.flexGrow = 1;
  return [outer as ViewStyle, inner as ViewStyle];
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gilded: { shadowColor: '#7A5C27', shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  gild: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  md: { minHeight: 52, paddingHorizontal: space.lg, paddingVertical: space.sm },
  sm: { minHeight: 38, paddingHorizontal: space.lg, paddingVertical: space.xs },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  disabled: { opacity: 0.5 },
});
