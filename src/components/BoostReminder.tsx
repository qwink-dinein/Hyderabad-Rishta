import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useBoostNudge } from '@/hooks/useBoostNudge';
import { colors, radius, space } from '@/theme/tokens';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Row } from './ui/layout';
import { Text } from './ui/Text';

const KEY = 'hr.boost.reminderSnoozedAt';
const SNOOZE_MS = 3 * 86400000;

/** Home: a calm reminder while the member's live profile isn't boosted. "Not now" hides it for 3 days. */
export function BoostReminder() {
  const { t } = useTranslation();
  const nudge = useBoostNudge();
  const [snoozed, setSnoozed] = useState(true);
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setSnoozed(!!v && Date.now() - Number(v) < SNOOZE_MS))
      .catch(() => setSnoozed(false));
  }, []);
  if (nudge !== 'ready' || snoozed) return null;
  return (
    <View style={styles.card} testID="boost-reminder">
      <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
        <View style={styles.icon}>
          <Icon name="star" size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{t('boost.remindTitle')}</Text>
          <Text variant="caption">{t('boost.remindBody')}</Text>
        </View>
      </Row>
      <Row gap={space.sm}>
        <Button
          label={t('boost.notNow')}
          kind="ghost"
          size="sm"
          onPress={() => {
            setSnoozed(true);
            AsyncStorage.setItem(KEY, String(Date.now())).catch(() => undefined);
          }}
          style={{ flex: 1 }}
          testID="boost-reminder-later"
        />
        <Button label={t('boost.remindCta')} kind="gold" size="sm" arrow onPress={() => router.push('/boost')} style={{ flex: 1.4 }} testID="boost-reminder-cta" />
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md, padding: space.lg, gap: space.md, borderRadius: radius.lg, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.goldMuted, alignItems: 'center', justifyContent: 'center' },
});
