import type React from 'react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/ui/Icon';
import { FadeIn, PressableScale, ProgressBar } from '@/components/ui/motion';
import { Text } from '@/components/ui/Text';
import { isRTL } from '@/i18n';
import { haptic } from '@/services/feedback';
import { STEP_PROGRESS, useOnboarding, type OnbStep } from '@/state/onboarding';
import { useSession } from '@/state/session';
import { useFit } from '@/hooks/useFit';
import { useKeyboardOverlap } from '@/hooks/useKeyboard';
import { KeyboardBar } from '@/components/ui/KeyboardBar';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

/** Larger type for the onboarding screens: elders read these on small phones (body 17, titles 28). */
export const T = { title: 28, body: 17, label: 15, small: 14 } as const;

/**
 * One onboarding screen: back, a progress bar that continues from the previous screen, a title, the
 * content (scrolls), and the main action pinned at the bottom within thumb reach.
 */
export function OnbScreen({
  step,
  title,
  subtitle,
  children,
  footer,
  right,
  onBack,
  testID,
  low,
  count,
  progress,
}: {
  step: OnbStep | 'live';
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  testID?: string;
  /** One question per screen: question + answer sit in the lower half, near the button and thumb. */
  low?: boolean;
  /** "3 of 8", shown at the top right. */
  count?: string;
  /** Overrides the step's bar position (questions move it a little per screen). */
  progress?: number;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(useSession((s) => s.lang));
  const target = progress ?? STEP_PROGRESS[step];
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const kbOverlap = useKeyboardOverlap(rootRef);
  const kbOpen = kbOverlap > 0;
  const [from] = useState(() => useOnboarding.getState().lastProgress);
  // Remember where the bar ended so the next screen glides on from here.
  useFocusEffect(useCallback(() => useOnboarding.getState().setLastProgress(target), [target]));
  const { sp } = useFit();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return (
    <View ref={rootRef} style={[styles.root, { paddingTop: insets.top, paddingBottom: kbOverlap }]} testID={testID}>
      <View style={styles.top}>
        <Pressable onPress={back} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.iconBtn} testID="onb-back">
          <Icon name={rtl ? 'chevronRight' : 'chevronLeft'} size={26} color={colors.charcoal} />
        </Pressable>
        <ProgressBar value={target} from={from} testID="onb-progress" />
        <View style={styles.right}>
          {right ?? (count ? <Text variant="caption" style={{ fontSize: T.small }} testID="onb-count">{count}</Text> : null)}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingBottom: sp(low ? space.lg : space.xxl) }, low && { flexGrow: 1, justifyContent: 'flex-end' }]}>
        <View style={styles.column}>
          <Text variant="h1" accessibilityRole="header" style={[styles.title, { marginTop: sp(space.md) }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" color={colors.muted} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
          <View style={[styles.body, { gap: sp(space.lg), marginTop: sp(space.xl) }]}>{children}</View>
        </View>
      </ScrollView>
      {footer || kbOpen ? (
        <View style={[styles.footer, { paddingTop: sp(space.md), paddingBottom: kbOpen ? space.sm : Math.max(insets.bottom, sp(space.lg)) }]}>
          {/* Keyboard open: the Next button rides on the keyboard, with "⌄ Hide" beside it. */}
          <View style={styles.column}>{kbOpen ? <KeyboardBar>{footer}</KeyboardBar> : footer}</View>
        </View>
      ) : null}
    </View>
  );
}

/** A big tappable choice. Selecting gives a selection tick (haptic) and the press dips to 97 %. */
export function ChoiceTile({ label, sub, icon, selected, onPress, testID, tall, compact }: { label: string; sub?: string; icon?: IconName; selected?: boolean; onPress: () => void; testID?: string; tall?: boolean; compact?: boolean }) {
  return (
    <PressableScale
      onPress={() => {
        haptic('select');
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected, checked: !!selected }}
      accessibilityLabel={label}
      testID={testID}
      style={[styles.tile, tall && styles.tileTall, compact && styles.tileCompact, selected && styles.tileOn]}
    >
      {icon ? <Icon name={icon} size={tall ? 28 : 22} color={colors.emerald} /> : null}
      <View style={tall || compact ? { alignItems: 'center', flex: compact ? 1 : undefined } : { flex: 1 }}>
        <Text variant="bodyStrong" style={{ fontSize: T.body + 1 }} center={tall || compact}>
          {label}
        </Text>
        {sub ? (
          <Text variant="caption" style={{ fontSize: T.small }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {!tall && !compact ? <View style={[styles.dot, selected && styles.dotOn]}>{selected ? <Icon name="check" size={14} color={colors.white} strokeWidth={2.6} /> : null}</View> : null}
    </PressableScale>
  );
}

/** Pill choices (single select). */
export function Chips<V extends string>({ options, value, onChange, label, testID }: { options: { value: V; label: string }[]; value?: V; onChange: (v: V) => void; label: string; testID?: string }) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <PressableScale
            key={o.value}
            onPress={() => {
              haptic('select');
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={o.label}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text variant="bodyStrong" color={on ? colors.white : colors.charcoal} style={{ fontSize: T.label + 1 }}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** A labelled group inside an onboarding screen. */
export function Group({ label, optional, children, hint }: { label: string; optional?: boolean; children: ReactNode; hint?: string }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="bodyStrong" style={{ fontSize: T.label + 1 }}>
        {label}
        {optional ? <Text variant="caption" style={{ fontSize: T.small }}>{`  ${t('common.optional')}`}</Text> : null}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" style={{ fontSize: T.small }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** − value + for small counts (children). */
export function Stepper({ value, onChange, min = 0, max = 15, label, testID }: { value?: number; onChange: (v: number) => void; min?: number; max?: number; label: string; testID?: string }) {
  const v = value ?? 0;
  const set = (n: number) => {
    const next = Math.max(min, Math.min(max, n));
    if (next !== value) haptic('select');
    onChange(next);
  };
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ now: v, min, max, text: String(v) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(v + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      testID={testID}
    >
      <PressableScale onPress={() => set(v - 1)} style={styles.stepBtn} accessibilityLabel="−" testID={testID ? `${testID}-minus` : undefined} disabled={v <= min}>
        <Text variant="h2" color={v <= min ? colors.border : colors.emerald}>
          −
        </Text>
      </PressableScale>
      <Text variant="h2" color={colors.charcoal} style={{ minWidth: 40, textAlign: 'center' }} testID={testID ? `${testID}-value` : undefined}>
        {value == null ? '–' : String(v)}
      </Text>
      <PressableScale onPress={() => set(value == null ? min : v + 1)} style={styles.stepBtn} accessibilityLabel="+" testID={testID ? `${testID}-plus` : undefined} disabled={v >= max}>
        <Text variant="h2" color={colors.emerald}>
          +
        </Text>
      </PressableScale>
    </View>
  );
}

const ROW = 48;
const VISIBLE = 5;

/**
 * A scroll wheel (like setting an alarm): rows snap into the highlighted band, a selection tick fires
 * as each row passes the band, and tapping a row selects it. Works with a screen reader as an
 * adjustable control (swipe up / down).
 */
export function Wheel({ items, value, onChange, label, width, grow, testID }: { items: { value: string; label: string; sub?: string }[]; value?: string; onChange: (v: string) => void; label: string; width?: number; grow?: boolean; testID?: string }) {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const idx = Math.max(0, items.findIndex((i) => i.value === value));
  const [shown, setShown] = useState(idx);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [startY] = useState(idx * ROW);
  // Start on the current value without animating (contentOffset for native, scrollTo once laid out for web).
  const place = () => ref.current?.scrollTo({ y: startY, animated: false });
  const commit = (i: number) => {
    const c = Math.max(0, Math.min(items.length - 1, i));
    if (items[c] && items[c].value !== value) onChange(items[c].value);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ROW);
    if (i !== shown && i >= 0 && i < items.length) {
      setShown(i);
      haptic('select');
    }
    // Web has no momentum-end event: settle shortly after scrolling stops.
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => commit(i), Platform.OS === 'web' ? 160 : 400);
  };
  const go = (i: number) => {
    const c = Math.max(0, Math.min(items.length - 1, i));
    ref.current?.scrollTo({ y: c * ROW, animated: true });
    setShown(c);
    // A tap is a deliberate choice, even of the row already in the band (confirms the default).
    if (items[c]) onChange(items[c].value);
  };
  return (
    <View
      style={[styles.wheel, width ? { width } : grow ? { flex: 1 } : { alignSelf: 'stretch' }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[shown]?.label }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => go(shown + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      testID={testID}
    >
      <View style={styles.band} pointerEvents="none" />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => commit(Math.round(e.nativeEvent.contentOffset.y / ROW))}
        contentOffset={{ x: 0, y: startY }}
        onLayout={place}
        contentContainerStyle={{ paddingVertical: ROW * ((VISIBLE - 1) / 2) }}
        nestedScrollEnabled
      >
        {items.map((it, i) => {
          const on = i === shown;
          return (
            <Pressable key={it.value} onPress={() => go(i)} style={styles.wheelRow} accessibilityLabel={it.label} testID={testID ? `${testID}-${it.value}` : undefined}>
              <Text variant={on ? 'bodyStrong' : 'body'} color={on ? colors.charcoal : '#A8999C'} style={{ fontSize: on ? 20 : 18 }}>
                {it.label}
              </Text>
              {it.sub ? (
                <Text variant="caption" color={on ? colors.muted : '#B9ADAF'} style={{ fontSize: 15 }}>
                  {it.sub}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A field that opens a bottom sheet holding a wheel (used for height). */
export function WheelField({
  label,
  placeholder,
  display,
  sheetTitle,
  items,
  value,
  onChange,
  toggle,
  testID,
}: {
  label: string;
  placeholder: string;
  display?: string;
  sheetTitle: string;
  items: { value: string; label: string; sub?: string }[];
  value?: string;
  onChange: (v: string) => void;
  toggle?: ReactNode;
  testID?: string;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | undefined>(value);
  const fallback = items[Math.floor(items.length / 2)]?.value;
  const picked = items.find((i) => i.value === (draft ?? fallback));
  return (
    <Group label={label}>
      <PressableScale
        onPress={() => {
          setDraft(value ?? fallback);
          setOpen(true);
        }}
        style={[styles.input, open && styles.inputFocus]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display ?? placeholder}`}
        testID={testID}
      >
        <Text variant="body" color={display ? colors.charcoal : '#8B7B7E'} style={{ fontSize: T.body + 1, flex: 1 }}>
          {display ?? placeholder}
        </Text>
        {display ? <Icon name="check" size={20} color={colors.success} strokeWidth={2.4} /> : <Icon name="chevronDown" size={20} color={colors.muted} />}
      </PressableScale>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={styles.scrim} onPress={() => setOpen(false)} accessibilityLabel={t('common.close')} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]} testID={testID ? `${testID}-sheet` : undefined}>
          <View style={styles.grab} />
          <View style={styles.sheetHead}>
            <Text variant="h2">{sheetTitle}</Text>
            {toggle}
          </View>
          <Wheel items={items} value={draft ?? fallback} onChange={setDraft} label={sheetTitle} testID={testID ? `${testID}-wheel` : undefined} />
          <PressableScale
            onPress={() => {
              haptic('light');
              if (draft ?? fallback) onChange((draft ?? fallback) as string);
              setOpen(false);
            }}
            style={styles.done}
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            testID={testID ? `${testID}-done` : undefined}
          >
            <Text variant="bodyStrong" color={colors.white} style={{ fontSize: T.body }}>
              {picked ? `${t('common.done')} · ${picked.label}` : t('common.done')}
            </Text>
          </PressableScale>
        </View>
      </Modal>
    </Group>
  );
}

/** Two-way unit switch (ft & in / cm). */
export function UnitToggle<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="radiogroup">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => {
            haptic('select');
            onChange(o.value);
          }}
          style={[styles.segItem, o.value === value && styles.segOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }}
        >
          <Text variant="label" color={o.value === value ? colors.charcoal : colors.muted}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A soft reveal for follow-up questions that appear only when they apply. */
export function FollowUp({ children }: { children: ReactNode }) {
  return (
    <FadeIn rise={8} duration={240}>
      <View style={styles.followUp}>{children}</View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  top: { height: 52, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  right: { minWidth: 44, alignItems: 'flex-end' },
  scroll: { paddingBottom: space.xxl },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: space.xl },
  title: { fontSize: T.title, marginTop: space.md },
  subtitle: { fontSize: T.body, marginTop: space.sm },
  body: { gap: space.lg, marginTop: space.xl },
  footer: { paddingTop: space.md, backgroundColor: colors.ivory },
  tile: { minHeight: 64, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  tileTall: { flexDirection: 'column', justifyContent: 'center', height: 104, paddingVertical: 0, gap: space.xs },
  tileCompact: { minHeight: 56, paddingHorizontal: space.sm, justifyContent: 'center' },
  tileOn: { borderColor: colors.emerald, borderWidth: 2, backgroundColor: colors.goldSoft },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dotOn: { borderColor: colors.emerald, backgroundColor: colors.emerald },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 48, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, height: 56 },
  stepBtn: { width: 64, height: 56, alignItems: 'center', justifyContent: 'center' },
  wheel: { height: ROW * VISIBLE, borderRadius: 18, backgroundColor: colors.white, overflow: 'hidden' },
  band: { position: 'absolute', left: 10, right: 10, top: ROW * ((VISIBLE - 1) / 2), height: ROW, borderRadius: 12, backgroundColor: colors.goldSoft },
  wheelRow: { height: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md },
  input: { minHeight: 56, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.sm },
  inputFocus: { borderColor: colors.emerald, borderWidth: 2 },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: space.xl, paddingTop: space.sm, gap: space.md, width: '100%', maxWidth: 560, alignSelf: 'center' },
  grab: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.beige, marginBottom: space.xs },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  done: { minHeight: 56, borderRadius: radius.pill, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: colors.sage, borderRadius: radius.pill, padding: 4 },
  segItem: { paddingHorizontal: space.md, height: 34, borderRadius: radius.pill, justifyContent: 'center' },
  segOn: { backgroundColor: colors.white },
  followUp: { borderStartWidth: 3, borderStartColor: colors.gold, paddingStart: space.md, gap: space.lg },
});
