import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { AppError } from '@/services/backend';
import { colors, maxContentWidth, radius, shadow, space } from '@/theme/tokens';
import { Button } from './Button';
import { Icon, StarMotif, type IconName } from './Icon';
import { Text } from './Text';

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite" accessibilityLabel={label ?? t('common.loading')}>
      <ActivityIndicator color={colors.emerald} size="large" />
      <Text variant="caption">{label ?? t('common.loading')}</Text>
    </View>
  );
}

/** Translates an error into user copy. Never shows stack traces or raw server messages. */
export function useErrorMessage() {
  const { t } = useTranslation();
  return (e: unknown) => {
    if (e instanceof AppError) {
      if (e.code === 'validation' && e.message.startsWith('v.')) return t(e.message);
      return t(`err.${e.code}`, { defaultValue: t('err.generic') });
    }
    return t('err.generic');
  };
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const msg = useErrorMessage()(error);
  return (
    <View style={styles.center}>
      <Icon name="shield" size={36} color={colors.goldDeep} />
      <Text variant="bodyStrong" center>
        {msg}
      </Text>
      {onRetry ? <Button label={t('common.retry')} kind="secondary" size="sm" onPress={onRetry} /> : null}
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
  const fg = { info: colors.emerald, warning: colors.goldDeep, success: colors.success, danger: colors.danger }[tone];
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
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(hide, 3200);
    return () => clearTimeout(id);
  }, [message, hide]);
  if (!message) return null;
  const bg = { success: colors.emerald, danger: colors.danger, info: colors.charcoal }[tone];
  return (
    <View pointerEvents="box-none" style={styles.toastWrap}>
      <Pressable onPress={hide} style={[styles.toast, { backgroundColor: bg }]} accessibilityLiveRegion="assertive" accessibilityRole="alert">
        <Text variant="label" color={colors.white} center>
          {message}
        </Text>
      </Pressable>
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
  const { t } = useTranslation();
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
  center0: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxxl, paddingHorizontal: space.xl },
  emptyIcon: { width: 64, height: 64 },
  banner: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.md },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center', paddingHorizontal: space.lg },
  toast: { paddingVertical: space.md, paddingHorizontal: space.xl, borderRadius: radius.pill, maxWidth: 480, ...shadow.card },
  dialogBackdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  dialog: { backgroundColor: colors.ivory, borderRadius: radius.lg, padding: space.xl, gap: space.md, width: '100%', maxWidth: Math.min(maxContentWidth, 440) },
});
