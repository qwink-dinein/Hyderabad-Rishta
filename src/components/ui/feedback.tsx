import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { create } from 'zustand';
import { AppError, isNetworkFailure } from '@/services/backend';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, maxContentWidth, motion, radius, shadow, space } from '@/theme/tokens';
import { Button } from './Button';
import { Icon, StarMotif, type IconName } from './Icon';
import { Text } from './Text';
import { useUiT } from '@/i18n/uiLang';

/** Seconds since `active` became true (0 while inactive) — drives "taking longer than usual". */
export function useElapsed(active: boolean) {
  const [secs, setSecs] = useState(0);
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    setSecs(0);
  }
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setSecs((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return active ? secs : 0;
}

/** After a few seconds of waiting, say the connection is slow (and offer Retry) instead of a frozen spinner. */
export const SLOW_AFTER_S = 5;
export function SlowNotice({ active, onRetry }: { active: boolean; onRetry?: () => void }) {
  const t = useUiT();
  const secs = useElapsed(active);
  if (secs < SLOW_AFTER_S) return null;
  return (
    <View style={styles.slow} accessibilityLiveRegion="polite" testID="slow-notice">
      <Icon name="clock" size={18} color={colors.goldDeep} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">{t('net.slowTitle')}</Text>
        <Text variant="caption">{secs >= 15 ? t('net.slowStill', { secs }) : t('net.slowBody')}</Text>
      </View>
      {onRetry && secs >= 10 ? <Button label={t('common.retry')} kind="secondary" size="sm" onPress={onRetry} /> : null}
    </View>
  );
}

export function Loading({ label, onRetry }: { label?: string; onRetry?: () => void }) {
  const t = useUiT();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite" accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={colors.emerald} size="large" />
      <Text variant="caption">{label ?? t('common.loading')}</Text>
      <View style={{ alignSelf: 'stretch' }}>
        <SlowNotice active onRetry={onRetry} />
      </View>
    </View>
  );
}

/** Translates an error into user copy. Never shows stack traces or raw server messages. */
export function useErrorMessage() {
  const t = useUiT();
  return (e: unknown) => {
    if (isNetworkFailure(e)) return t('err.network');
    if (e instanceof AppError) {
      if (e.code === 'validation' && (e.message.startsWith('v.') || e.message.startsWith('pin.'))) return t(e.message);
      return t(`err.${e.code}`, { defaultValue: t('err.generic') });
    }
    return t('err.generic');
  };
}

/** How to fix it, per kind of failure (shown under the message). */
function errorHint(e: unknown): string {
  if (isNetworkFailure(e)) return 'errHint.network';
  const code = e instanceof AppError ? e.code : 'generic';
  if (code === 'rate_limited' || code === 'forbidden' || code === 'unauthenticated' || code === 'not_found') return `errHint.${code}`;
  return 'errHint.generic';
}

/** What went wrong (plain words) + how to fix it + Retry. Never a blank screen or raw server text. */
export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useUiT();
  const msg = useErrorMessage()(error);
  const offline = isNetworkFailure(error);
  return (
    <View style={styles.center} testID="error-view">
      <Icon name={offline ? 'globe' : 'info'} size={36} color={colors.goldDeep} />
      <Text variant="bodyStrong" center>
        {msg}
      </Text>
      <Text variant="caption" center style={{ maxWidth: 320 }}>
        {t(errorHint(error))}
      </Text>
      {onRetry ? <Button label={t('common.retry')} kind="secondary" size="sm" icon={<Icon name="refresh" size={16} color={colors.emerald} />} onPress={onRetry} testID="error-retry" /> : null}
    </View>
  );
}

export function EmptyState({ icon = 'sparkle', title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <StarMotif size={64} opacity={0.5} />
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.center0}>
            <Icon name={icon} size={26} />
          </View>
        </View>
      </View>
      <Text variant="h3" center>
        {title}
      </Text>
      {body ? (
        <Text variant="caption" center style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function Banner({ tone = 'info', children, icon }: { tone?: 'info' | 'warning' | 'success' | 'danger'; children: ReactNode; icon?: IconName }) {
  const bg = { info: colors.sage, warning: colors.warningBg, success: colors.successBg, danger: colors.dangerBg }[tone];
  const fg = { info: colors.emerald, warning: colors.goldDeep, success: colors.success, danger: colors.dangerText }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="summary">
      {icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Text variant="caption" color={fg}>{children}</Text> : children}</View>
    </View>
  );
}

export function Badge({ label, tone = 'gold' }: { label: string; tone?: 'gold' | 'emerald' | 'muted' | 'danger' | 'success' }) {
  const map = {
    gold: { bg: '#F4EBD8', fg: colors.goldDeep },
    emerald: { bg: colors.sage, fg: colors.emerald },
    muted: { bg: '#EFEDE6', fg: colors.muted },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    success: { bg: colors.successBg, fg: colors.success },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text variant="caption" color={map.fg} style={{ fontSize: 11.5 }}>
        {label}
      </Text>
    </View>
  );
}

// ---------- Toasts ----------
interface ToastState {
  message: string | null;
  tone: 'success' | 'danger' | 'info';
  show: (message: string, tone?: 'success' | 'danger' | 'info') => void;
  hide: () => void;
}
export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'success',
  show: (message, tone = 'success') => set({ message, tone }),
  hide: () => set({ message: null }),
}));

export function ToastHost() {
  const { message, tone, hide } = useToast();
  const reduced = useReducedMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!message) return;
    v.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(v, { toValue: 1, duration: motion.success, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    const id = setTimeout(hide, 3200);
    return () => clearTimeout(id);
  }, [message, hide, reduced, v]);
  if (!message) return null;
  const bg = { success: colors.emerald, danger: colors.danger, info: colors.charcoal }[tone];
  const icon: IconName = tone === 'success' ? 'check' : tone === 'danger' ? 'info' : 'info';
  return (
    <View pointerEvents="box-none" style={styles.toastWrap}>
      <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
        <Pressable onPress={hide} style={[styles.toast, { backgroundColor: bg }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
          <Animated.View style={[styles.toastIcon, { transform: [{ scale: v }] }]}>
            <Icon name={icon} size={14} color={bg} strokeWidth={2.6} />
          </Animated.View>
          <Text variant="label" color={colors.white} style={{ flexShrink: 1 }}>
            {message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ---------- Confirm dialog (Alert.alert has no multi-button support on web) ----------
interface ConfirmState {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve?: (ok: boolean) => void;
}
const useConfirmStore = create<ConfirmState>(() => ({ open: false, title: '' }));

export function confirm(opts: { title: string; body?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ ...opts, open: true, resolve }));
}

export function ConfirmHost() {
  const t = useUiT();
  const s = useConfirmStore();
  const close = (ok: boolean) => {
    s.resolve?.(ok);
    useConfirmStore.setState({ open: false, resolve: undefined });
  };
  return (
    <Modal visible={s.open} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={styles.dialogBackdrop}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <Text variant="h3" accessibilityRole="header">
            {s.title}
          </Text>
          {s.body ? <Text variant="body">{s.body}</Text> : null}
          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <Button label={t('common.cancel')} kind="secondary" onPress={() => close(false)} style={{ flex: 1 }} />
            <Button label={s.confirmLabel ?? t('common.confirm')} kind={s.danger ? 'danger' : 'primary'} onPress={() => close(true)} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl, minHeight: 240 },
  slow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, marginTop: space.sm, borderRadius: radius.md, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  center0: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successBadge: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  successCheck: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: { width: 64, height: 64 },
  banner: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', paddingHorizontal: space.lg },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: radius.pill, maxWidth: 480, ...shadow.card },
  toastIcon: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dialogBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  dialog: { backgroundColor: colors.ivory, borderRadius: radius.lg, padding: space.xl, gap: space.md, width: '100%', maxWidth: Math.min(maxContentWidth, 440) },
});

/**
 * Success moments (publishing, interest sent, boost activated): confirm in plain words, a short
 * celebration (animated check; still with Reduce Motion), then the obvious next step.
 */
interface SuccessAction {
  label: string;
  go: () => void;
}
interface SuccessState {
  open: boolean;
  title: string;
  body?: string;
  primary?: SuccessAction;
  secondary?: SuccessAction;
}
const useSuccessStore = create<SuccessState>(() => ({ open: false, title: '' }));
export function showSuccess(s: Omit<SuccessState, 'open'>) {
  useSuccessStore.setState({ ...s, open: true });
}

export function SuccessHost() {
  const t = useUiT();
  const s = useSuccessStore();
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!s.open || reduced) return;
    scale.setValue(0.4);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [s.open, reduced, scale]);
  const close = () => useSuccessStore.setState({ open: false });
  const run = (a?: SuccessAction) => {
    close();
    a?.go();
  };
  return (
    <Modal visible={s.open} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.dialogBackdrop}>
        <View style={[styles.dialog, { alignItems: 'center' }]} accessibilityViewIsModal testID="success-sheet">
          <View style={styles.successBadge}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={styles.center0}>
                <StarMotif size={92} opacity={0.35} />
              </View>
            </View>
            <Animated.View style={[styles.successCheck, { transform: [{ scale }] }]}>
              <Icon name="check" size={34} color={colors.white} strokeWidth={2.6} />
            </Animated.View>
          </View>
          <Text variant="h2" center accessibilityRole="header">
            {s.title}
          </Text>
          {s.body ? (
            <Text variant="body" center color={colors.muted}>
              {s.body}
            </Text>
          ) : null}
          <View style={{ alignSelf: 'stretch', gap: space.sm, marginTop: space.md }}>
            <Button label={s.primary?.label ?? t('common.done')} onPress={() => run(s.primary)} full testID="success-primary" />
            {s.secondary ? <Button label={s.secondary.label} kind="secondary" onPress={() => run(s.secondary)} full testID="success-secondary" /> : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
