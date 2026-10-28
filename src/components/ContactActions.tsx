import { Linking, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, space } from '@/theme/tokens';
import { Button } from './ui/Button';
import { useToast } from './ui/feedback';
import { Icon } from './ui/Icon';
import { Card, Row } from './ui/layout';
import { Text } from './ui/Text';

/**
 * A number revealed by consent: selectable text + Call / Copy / SMS. Call and SMS hand off to the
 * phone's own apps (they may do nothing inside some web frames), so the number is always visible
 * as text too. There is no in-app chat and we never claim otherwise.
 */
export function ContactActions({ countryCode, phone }: { countryCode: string; phone: string }) {
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const full = `${countryCode}${phone}`;
  const copy = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(full);
      else throw new Error('no clipboard');
      toast(t('requests.copied'));
    } catch {
      toast(full, 'info'); // fallback: show it so it can be copied manually
    }
  };
  return (
    <Card style={{ gap: space.sm, borderColor: colors.success }}>
      <Row>
        <Icon name="shield" size={18} color={colors.success} />
        <Text variant="caption" color={colors.success}>
          {t('profile.contactShared')}
        </Text>
      </Row>
      <Text variant="bodyStrong" selectable testID="revealed-number" style={{ fontSize: 22, lineHeight: 30, letterSpacing: 0.5 }}>
        {countryCode} {phone}
      </Text>
      <Row gap={space.sm} wrap>
        <Button label={t('requests.call')} size="sm" icon={<Icon name="phone" size={16} color={colors.white} />} onPress={() => Linking.openURL(`tel:${full}`).catch(() => undefined)} />
        <Button label={t('requests.copy')} size="sm" kind="secondary" onPress={copy} />
        <Button label={t('requests.sms')} size="sm" kind="secondary" onPress={() => Linking.openURL(`sms:${full}`).catch(() => undefined)} />
      </Row>
      <View style={{ gap: 2 }}>
        <Text variant="caption">{t('requests.messagingNote')}</Text>
        <Text variant="caption">{t('connect.screenshotNote')}</Text>
      </View>
    </Card>
  );
}
