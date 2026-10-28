import { memo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, maxContentWidth, radius, shadow, space } from '@/theme/tokens';
import { useSession } from '@/state/session';
import { isRTL } from '@/i18n';
import { Icon } from './Icon';
import { Text } from './Text';

/** Page container: safe areas, ivory background, centred max-width column on web/tablet. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  footer,
  header,
  contentStyle,
  scrollProps,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: ReactNode;
  header?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scrollProps?: ScrollViewProps;
  edges?: ('top' | 'bottom')[];
}) {
  const insets = useSafeAreaInsets();
  const inner = <View style={[styles.column, padded && styles.padded, contentStyle]}>{children}</View>;
  return (
    <View style={[styles.root, { paddingTop: edges.includes('top') ? insets.top : 0 }]}>
      {header}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: (edges.includes('bottom') ? insets.bottom : 0) + space.xxxl }}
          {...scrollProps}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) }]}>{footer}</View> : null}
    </View>
  );
}

/** Stack header with back button and optional right action. Mirrors in RTL. */
export function Header({ title, right, onBack, back = true }: { title: string; right?: ReactNode; onBack?: () => void; back?: boolean }) {
  const { t } = useTranslation();
  const rtl = isRTL(useSession((s) => s.lang));
  return (
    <View style={styles.header}>
      <View style={styles.headerInner}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={12}
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
            style={styles.headerBtn}
          >
            <Icon name={rtl ? 'chevronRight' : 'chevronLeft'} />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text variant="h3" numberOfLines={1} style={styles.headerTitle} center accessibilityRole="header">
          {title}
        </Text>
        <View style={[styles.headerBtn, { alignItems: 'flex-end' }]}>{right}</View>
      </View>
    </View>
  );
}

export const Card = memo(function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.card, padded && { padding: space.lg }, style]}>{children}</View>;
});

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ gap: space.md, marginTop: space.xl }}>
      <View style={styles.sectionHead}>
        <Text variant="overline" accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ children, gap = space.sm, style, wrap }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space.md }} />;
}

/** Label/value pair used in profile details. Hidden when value is empty. */
export function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.infoRow}>
      <Text variant="caption" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="label" style={{ flex: 1.4 }}>
        {String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
  padded: { paddingHorizontal: space.lg },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  header: { backgroundColor: colors.ivory, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerInner: {
    width: '100%',
    maxWidth: maxContentWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    minHeight: 54,
  },
  headerBtn: { width: 64, minHeight: 44, justifyContent: 'center' },
  headerTitle: { flex: 1 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoRow: { flexDirection: 'row', gap: space.md, paddingVertical: space.xs + 2 },
});
