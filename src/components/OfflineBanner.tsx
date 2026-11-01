import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnline } from '@/hooks/useOnline';
import { useUiT } from '@/i18n/uiLang';
import { colors, radius, space } from '@/theme/tokens';
import { Icon } from './ui/Icon';
import { Text } from './ui/Text';

/**
 * App-wide connection notice: while offline it says so and that what is already loaded stays visible
 * (nothing goes blank); when the connection returns it briefly confirms and screens refresh themselves.
 */
export function OfflineBanner() {
  const t = useUiT();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const [prev, setPrev] = useState(online);
  const [back, setBack] = useState(false);
  if (prev !== online) {
    setPrev(online);
    setBack(online); // just reconnected → confirm briefly
  }
  useEffect(() => {
    if (!back) return;
    const timer = setTimeout(() => setBack(false), 2500);
    return () => clearTimeout(timer);
  }, [back]);
  if (online && !back) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + space.xs }]} accessibilityLiveRegion="polite" testID={online ? 'online-banner' : 'offline-banner'}>
      <View style={[styles.pill, online ? styles.ok : styles.off]}>
        <Icon name={online ? 'check' : 'globe'} size={16} color={colors.white} />
        <View style={{ flexShrink: 1 }}>
          <Text variant="label" color={colors.white}>
            {online ? t('net.back') : t('net.offlineTitle')}
          </Text>
          {!online ? (
            <Text variant="caption" color={colors.white}>
              {t('net.offlineBody')}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, alignItems: 'center', zIndex: 1000 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderRadius: radius.lg, maxWidth: 520 },
  off: { backgroundColor: colors.charcoal },
  ok: { backgroundColor: colors.success },
});
