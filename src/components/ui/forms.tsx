import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, FlatList, Modal, Pressable, StyleSheet, Switch, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { haptic } from '@/services/feedback';
import { colors, maxContentWidth, motion, radius, space } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';
import { useSession } from '@/state/session';
import { isRTL } from '@/i18n';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface Option {
  value: string;
  label: string;
}

/** Wraps a control with its label, optional marker, hint and inline error (announced to screen readers). */
export function Field({ label, error, hint, optional, children, required }: { label: string; error?: string; hint?: string; optional?: boolean; required?: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.xs + 2, marginBottom: space.lg }}>
      <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'baseline' }}>
        <Text variant="label">
          {label}
          {required ? <Text variant="label" color={colors.danger}> *</Text> : null}
        </Text>
        {optional ? <Text variant="caption">· {t('common.optional')}</Text> : null}
      </View>
      {children}
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {t(error, { defaultValue: error })}
        </Text>
      ) : hint ? (
        <Text variant="caption">{hint}</Text>
      ) : null}
    </View>
  );
}

export const TextField = memo(function TextField({ error, multiline, style, ...props }: TextInputProps & { error?: boolean; ref?: React.Ref<React.ComponentRef<typeof TextInput>> }) {
  const lang = useSession((s) => s.lang);
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      {...props}
      multiline={multiline}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        styles.input,
        { fontFamily: fontFamily(lang, 'body'), textAlign: isRTL(lang) ? 'right' : 'left', writingDirection: isRTL(lang) ? 'rtl' : 'ltr' },
        multiline && styles.multiline,
        focused && styles.inputFocused,
        error && styles.inputError,
        style,
      ]}
    />
  );
});

/** Inline pill choices for short option lists (≤ ~6). Supports single or multiple selection. */
/** Segmented control (e.g. Received / Sent). Radio semantics for assistive tech. */
export function Segmented({ options, value, onChange, accessibilityLabel }: { options: Option[]; value: string; onChange: (v: any) => void; accessibilityLabel?: string }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (!on) haptic('select');
              onChange(o.value);
            }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            <Text variant="label" color={on ? colors.white : colors.emerald} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Single-choice list of large option cards (radio semantics), e.g. "I am creating biodata for". */
export function OptionList({ options, value, onChange, icons, accessibilityLabel }: {
  options: Option[];
  value: string | undefined;
  onChange: (v: any) => void;
  icons?: Partial<Record<string, IconName>>;
  accessibilityLabel?: string;
}) {
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              haptic('select');
              onChange(on ? undefined : o.value);
            }}
            style={({ pressed }) => [styles.optionCard, on && styles.optionCardOn, pressed && { transform: [{ scale: 0.99 }] }]}
          >
            <View style={[styles.optionIcon, on && { backgroundColor: colors.emerald }]}>
              <Icon name={icons?.[o.value] ?? 'user'} size={18} color={on ? colors.white : colors.emerald} />
            </View>
            <Text variant={on ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
              {o.label}
            </Text>
            <View style={[styles.optionCheck, on && styles.optionCheckOn]}>{on ? <Icon name="check" size={13} color={colors.white} strokeWidth={2.6} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Fades and slides a conditional field into place (~220 ms); instant when Reduce Motion is on. */
export function Reveal({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      v.setValue(1);
      return;
    }
    Animated.timing(v, { toValue: 1, duration: motion.fade, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [reduced, v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>{children}</Animated.View>;
}

export function ChipGroup({ options, value, onChange, multiple, accessibilityLabel }: {
  options: Option[];
  value: string | string[] | undefined;
  onChange: (v: any) => void;
  multiple?: boolean;
  accessibilityLabel?: string;
}) {
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <View style={styles.chips} accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={multiple ? { checked: on } : { selected: on }}
            accessibilityLabel={o.label}
            onPress={() => {
              if (multiple) {
                const next = new Set(selected);
                if (on) next.delete(o.value);
                else next.add(o.value);
                onChange([...next]);
              } else onChange(on ? undefined : o.value);
            }}
            style={[styles.chip, on && styles.chipOn]}
          >
            {on ? <Icon name="check" size={14} color={colors.white} strokeWidth={2.4} /> : null}
            <Text variant="label" color={on ? colors.white : colors.charcoal}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Searchable dropdown in a modal sheet. Works identically on iOS, Android and web.
 * `allowCustom` lets users type a value not in the list (PRD §6.3: manual location entry).
 */
export function Select({ options, value, onChange, placeholder, multiple, allowCustom, error, label, disabled, displayValue, style }: {
  options: Option[];
  value: string | string[] | undefined;
  onChange: (v: any) => void;
  placeholder?: string;
  multiple?: boolean;
  allowCustom?: boolean;
  error?: boolean;
  label: string;
  disabled?: boolean;
  /** Short text for the closed control (e.g. just "+91" in a compact slot); the sheet still shows full labels. */
  displayValue?: (values: string[]) => string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const insets = useSafeAreaInsets();
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const display = values.length && displayValue ? displayValue(values) : values.length === 0 ? placeholder ?? t('common.select') : multiple && values.length > 2 ? t('common.selected', { n: values.length }) : values.map(labelFor).join(', ');

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n) || o.value.toLowerCase().includes(n)) : options;
  }, [q, options]);
  const customCandidate = allowCustom && q.trim() && !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase()) ? q.trim() : null;

  const pick = (v: string) => {
    if (multiple) {
      onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
    } else {
      onChange(v);
      setOpen(false);
      setQ('');
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${values.length ? display : t('common.select')}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.input, styles.selectBtn, error && styles.inputError, disabled && { opacity: 0.5 }, style]}
      >
        <Text variant="body" color={values.length ? colors.charcoal : colors.muted} numberOfLines={1} style={{ flex: 1 }}>
          {display}
        </Text>
        <Icon name="chevronDown" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.sheetHead}>
            <Text variant="h3" style={{ flex: 1 }} accessibilityRole="header">
              {label}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setOpen(false)} hitSlop={12}>
              <Icon name="close" />
            </Pressable>
          </View>
          {options.length > 7 || allowCustom ? (
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
              <TextField value={q} onChangeText={setQ} placeholder={t('common.typeToSearch')} autoFocus={false} accessibilityLabel={t('common.search')} />
              {allowCustom && !q ? <Text variant="caption" style={{ marginTop: space.xs }}>{t('common.notListed')}</Text> : null}
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            ListHeaderComponent={
              customCandidate ? (
                <Pressable style={styles.option} onPress={() => pick(customCandidate)} accessibilityRole="button">
                  <Icon name="plus" size={18} />
                  <Text variant="bodyStrong" color={colors.emerald}>
                    {t('common.useCustom', { value: customCandidate })}
                  </Text>
                </Pressable>
              ) : undefined
            }
            renderItem={({ item }) => {
              const on = values.includes(item.value);
              return (
                <Pressable
                  style={[styles.option, on && { backgroundColor: colors.sage }]}
                  onPress={() => pick(item.value)}
                  accessibilityRole={multiple ? 'checkbox' : 'radio'}
                  accessibilityState={multiple ? { checked: on } : { selected: on }}
                >
                  <Text variant="body" style={{ flex: 1 }}>
                    {item.label}
                  </Text>
                  {on ? <Icon name="check" size={18} /> : null}
                </Pressable>
              );
            }}
          />
          {multiple ? (
            <View style={{ flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm }}>
              <Button label={t('common.clearAll')} kind="secondary" onPress={() => onChange([])} style={{ flex: 1 }} />
              <Button label={t('common.done')} onPress={() => setOpen(false)} style={{ flex: 1 }} />
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

export function ToggleRow({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{label}</Text>
        {hint ? <Text variant="caption">{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.emeraldSoft, false: colors.border }}
        thumbColor={colors.white}
        {...({ activeThumbColor: colors.white } as object) /* react-native-web otherwise uses its default teal */}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Pressable>
  );
}

/** Numeric min/max pair built from two Selects. */
export function RangeSelect({ label, options, min, max, onChange, error }: {
  label: string;
  options: Option[];
  min?: number;
  max?: number;
  onChange: (min?: number, max?: number) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  const withAny: Option[] = [{ value: '', label: t('common.any') }, ...options];
  return (
    <Field label={label} error={error} optional>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Select label={`${label} · ${t('f.min')}`} placeholder={t('f.min')} options={withAny} value={min != null ? String(min) : undefined} onChange={(v: string) => onChange(v ? Number(v) : undefined, max)} />
        </View>
        <View style={{ flex: 1 }}>
          <Select label={`${label} · ${t('f.max')}`} placeholder={t('f.max')} options={withAny} value={max != null ? String(max) : undefined} onChange={(v: string) => onChange(min, v ? Number(v) : undefined)} />
        </View>
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderWidth: 1.2,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm,
    fontSize: 15,
    color: colors.charcoal,
  },
  inputFocused: { borderColor: colors.emerald, borderWidth: 1.6 },
  inputError: { borderColor: colors.danger, backgroundColor: '#FFFBFA' },
  multiline: { minHeight: 110, textAlignVertical: 'top', paddingTop: space.md },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1.2,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  segmented: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  segmentOn: { backgroundColor: colors.emerald },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  optionCardOn: { borderColor: colors.emerald, borderWidth: 1.5, backgroundColor: '#FBFDFB' },
  optionIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  optionCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  optionCheckOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.ivory,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', padding: space.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingVertical: space.xs },
});
