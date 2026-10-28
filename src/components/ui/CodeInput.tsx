import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, space } from '@/theme/tokens';
import { Text } from './Text';

/**
 * Separate digit cells (6 for OTP, 4 for PIN) drawn over ONE real input, so paste, SMS autofill,
 * the numeric keypad and screen readers all work. The highlighted cell moves along as digits are
 * typed (automatic focus progression). `secure` shows dots instead of digits (PINs).
 */
export const CodeInput = forwardRef<React.ComponentRef<typeof TextInput>, {
  value: string;
  onChange: (v: string) => void;
  length: number;
  secure?: boolean;
  error?: boolean;
  label: string;
  testID?: string;
  autoFocus?: boolean;
  oneTimeCode?: boolean;
  onSubmit?: () => void;
}>(function CodeInput({ value, onChange, length, secure, error, label, testID, autoFocus, oneTimeCode, onSubmit }, ref) {
  const [focused, setFocused] = useState(false);
  const pin = length <= 4;
  return (
    <Pressable onPress={() => (ref as React.RefObject<React.ComponentRef<typeof TextInput> | null>)?.current?.focus()} style={styles.wrap} accessible={false}>
      <View style={[styles.cells, pin && styles.cellsPin]} pointerEvents="none">
        {Array.from({ length }).map((_, i) => {
          const active = focused && i === Math.min(value.length, length - 1);
          const ch = value[i];
          return (
            <View key={i} style={[styles.cell, pin ? styles.cellPin : styles.cellOtp, ch ? styles.filled : null, active && styles.active, error ? styles.error : null]}>
              {ch ? secure ? <View style={styles.dot} /> : <Text variant="bodyStrong" color={colors.charcoal} style={{ fontSize: 22, lineHeight: 28 }}>{ch}</Text> : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        testID={testID}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete={oneTimeCode ? 'one-time-code' : 'off'}
        textContentType={oneTimeCode ? 'oneTimeCode' : 'none'}
        secureTextEntry={secure}
        importantForAutofill={oneTimeCode ? 'yes' : 'no'}
        maxLength={length + 8 /* room for pasted spaces/dashes, cleaned above */}
        accessibilityLabel={label}
        accessibilityHint={secure ? `${value.length} / ${length}` : undefined}
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        caretHidden
        contextMenuHidden={false}
        style={styles.input}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  cells: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, direction: 'ltr' },
  cellsPin: { justifyContent: 'center', gap: space.md },
  cell: { borderRadius: radius.md, borderWidth: 1.2, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  cellOtp: { flex: 1, maxWidth: 52, aspectRatio: 0.86 },
  cellPin: { width: 58, height: 64 },
  filled: { borderColor: colors.goldMuted },
  active: { borderColor: colors.emerald, borderWidth: 2 },
  error: { borderColor: colors.danger },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.emerald },
  // Transparent but focusable/clickable: keeps native paste, autofill and screen-reader input.
  input: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent', backgroundColor: 'transparent', borderWidth: 0, fontSize: 16 }, // 16 avoids iOS focus zoom
});
