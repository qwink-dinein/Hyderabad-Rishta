import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '@/theme/tokens';
import { isRTL } from '@/i18n';
import { Icon } from './Icon';
import { Text } from './Text';
import { useUiLang } from '@/i18n/uiLang';

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
}

const KIND: Record<Kind, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.emerald, fg: colors.white, border: colors.emerald },
  secondary: { bg: colors.white, fg: colors.emerald, border: colors.emerald },
  ghost: { bg: 'transparent', fg: colors.emerald, border: 'transparent' },
  gold: { bg: colors.gold, fg: colors.emerald, border: colors.gold },
  danger: { bg: colors.white, fg: colors.dangerText, border: colors.danger },
  light: { bg: 'transparent', fg: colors.ivory, border: 'rgba(248,244,235,0.7)' },
};

export const Button = memo(function Button({ label, onPress, kind = 'primary', size = 'md', loading, disabled, icon, arrow, full, style, accessibilityHint, testID }: ButtonProps) {
  const k = KIND[kind];
  const rtl = isRTL(useUiLang());
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: k.bg, borderColor: k.border },
        full && styles.full,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={k.fg} size="small" /> : icon}
        <Text variant={size === 'sm' ? 'label' : 'bodyStrong'} color={k.fg} numberOfLines={2} center>
          {label}
        </Text>
        {arrow && !loading ? <Icon name={rtl ? 'arrowLeft' : 'arrowRight'} size={18} color={k.fg} /> : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  md: { minHeight: 52, paddingHorizontal: space.lg, paddingVertical: space.sm },
  sm: { minHeight: 38, paddingHorizontal: space.lg, paddingVertical: space.xs },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
});
