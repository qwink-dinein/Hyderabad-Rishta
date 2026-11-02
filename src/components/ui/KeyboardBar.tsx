import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius, space } from '@/theme/tokens';
import { useFieldNav } from './fieldNav';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * Bar that sits right on top of the keyboard (approved design 2026-11-02): "⌄ Hide" closes the keyboard,
 * ↑ ↓ jump between text boxes on long forms, and `children` (the screen's own Next / Save button)
 * stays in reach instead of hiding behind the keyboard.
 */
export function KeyboardBar({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const nav = useFieldNav();
  const many = (nav?.count ?? 0) > 1;
  return (
    <View style={styles.bar} testID="keyboard-bar">
      <Pressable onPress={() => Keyboard.dismiss()} accessibilityRole="button" accessibilityLabel={t('common.hideKeyboard')} hitSlop={6} style={styles.hide} testID="keyboard-hide">
        <Icon name="chevronDown" size={18} color={colors.emerald} />
        <Text variant="label" color={colors.emerald}>
          {t('common.hideKeyboard')}
        </Text>
      </Pressable>
      {many ? (
        <>
          <Pressable onPress={() => nav?.move(-1)} accessibilityRole="button" accessibilityLabel={t('common.prevField')} hitSlop={4} style={styles.arrow} testID="keyboard-prev">
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Icon name="chevronDown" size={18} color={colors.emerald} />
            </View>
          </Pressable>
          <Pressable onPress={() => nav?.move(1)} accessibilityRole="button" accessibilityLabel={t('common.nextField')} hitSlop={4} style={styles.arrow} testID="keyboard-next">
            <Icon name="chevronDown" size={18} color={colors.emerald} />
          </Pressable>
          {nav && nav.index >= 0 && !children ? (
            <Text variant="caption" style={{ marginStart: space.xs }}>
              {t('common.fieldOf', { n: nav.index + 1, total: nav.count })}
            </Text>
          ) : null}
        </>
      ) : null}
      {children ? <View style={{ flex: 1 }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  hide: { height: 44, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
