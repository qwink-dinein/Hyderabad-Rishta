import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space } from '@/theme/tokens';
import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
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
  danger: { bg: colors.white, fg: colors.danger, border: colors.danger },
};

export const Button = memo(function Button({ label, onPress, kind = 'primary', size = 'md', loading, disabled, icon, full, style, accessibilityHint, testID }: ButtonProps) {
  const k = KIND[kind];
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
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  md: { minHeight: 50, paddingHorizontal: space.xl, paddingVertical: space.sm },
  sm: { minHeight: 38, paddingHorizontal: space.lg, paddingVertical: space.xs },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.5 },
});
