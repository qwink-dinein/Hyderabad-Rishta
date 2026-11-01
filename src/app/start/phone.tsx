import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PhoneField } from '@/components/LoginFlow';
import { OnbScreen, T } from '@/components/onboarding/kit';
import { useSubject } from '@/components/onboarding/useSubject';
import { Button } from '@/components/ui/Button';
import { useErrorMessage } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { phoneSchema } from '@/domain/validation';
import { backend } from '@/services';
import { useOnboarding } from '@/state/onboarding';
import { colors, space } from '@/theme/tokens';

/** Step 4: one field — the mobile number — asked only after the visitor has seen matches. */
export default function Phone() {
  const { t } = useTranslation();
  const errMsg = useErrorMessage();
  const { reach } = useOnboarding();
  const { ctx } = useSubject();
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => reach('phone'), [reach]);
  const digits = phone.replace(/\D/g, '');
  const send = async () => {
    setError(null);
    if (!phoneSchema.safeParse(digits).success) return setError(t('v.phone'));
    setBusy(true);
    try {
      const r = await backend.requestOtp(cc, digits);
      router.push({ pathname: '/start/code', params: { cc, phone: digits, resendAt: r.resendAvailableAt, left: String(r.resendsLeft ?? '') } });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <OnbScreen
      step="phone"
      title={t('onb.phone.title', { context: ctx })}
      subtitle={t('onb.phone.sub')}
      testID="onb-phone"
      footer={
        <View style={{ gap: space.sm }}>
          <Button label={t('onb.phone.send')} onPress={send} loading={busy} disabled={digits.length < 6} full testID="onb-send-code" />
          <Text variant="caption" center style={{ fontSize: T.small }}>
            {t('onb.phone.noPassword')}
          </Text>
        </View>
      }
    >
      <PhoneField
        testID="onb-phone-input"
        cc={cc}
        onCc={setCc}
        phone={phone}
        onPhone={(v) => {
          setPhone(v);
          setError(null);
        }}
        onSubmit={send}
        error={error}
      />
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <Icon name="message" size={22} color={colors.success} />
        <Text variant="body" color={colors.muted} style={{ flex: 1, fontSize: T.label + 1 }}>
          {t('onb.phone.whatsapp')}
        </Text>
      </View>
    </OnbScreen>
  );
}
