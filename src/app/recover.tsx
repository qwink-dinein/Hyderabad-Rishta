import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Banner, useErrorMessage } from '@/components/ui/feedback';
import { Field, Select, TextField } from '@/components/ui/forms';
import { Header, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { COUNTRY_CODES } from '@/domain/options';
import { backend } from '@/services';
import { colors, space } from '@/theme/tokens';

/**
 * Master-admin lost-phone recovery (logged out). Needs two things: a one-time recovery code AND an
 * OTP proving the phone in hand. Backup phone → immediate; any other phone → 72-hour time-lock.
 */
export default function Recover() {
  const errMsg = useErrorMessage();
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: 'completed' | 'pending'; completesAt?: string } | null>(null);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      await backend.requestOtp(cc, phone);
      setSent(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      setResult(await backend.recoverMaster(cc, phone, otp, code));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header title="Master admin recovery" />} edges={['top', 'bottom']}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        {result ? (
          result.status === 'completed' ? (
            <>
              <Banner tone="success" icon="shield">
                Recovery complete. This phone is now the master admin. Log in with it, then generate new recovery codes and set a new backup phone straight away.
              </Banner>
              <Button label="Go to login" onPress={() => router.replace('/login')} full />
            </>
          ) : (
            <>
              <Banner tone="warning" icon="lock">
                Recovery started. For your safety the master role moves to this phone on {formatDate(result.completesAt)} (72 hours). The current master is alerted and can cancel it if this wasn’t them. After that time, just log in with this phone.
              </Banner>
              <Button label="Back to login" kind="secondary" onPress={() => router.replace('/login')} full />
            </>
          )
        ) : (
          <>
            <Text variant="body">For the master admin only. You need one of your saved recovery codes and the phone you have now.</Text>
            <Field label="Country code">
              <Select label="Country code" options={COUNTRY_CODES.map((c) => ({ value: c.code, label: `${c.code}  ${c.country}` }))} value={cc} onChange={setCc} />
            </Field>
            <Field label="Phone you have now" hint="Your registered backup phone recovers immediately; any other phone waits 72 hours.">
              <TextField value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ''))} keyboardType="phone-pad" accessibilityLabel="Phone you have now" testID="recover-phone" editable={!sent} />
            </Field>
            {!sent ? (
              <Button label="Send code to this phone" onPress={send} loading={busy} disabled={phone.length < 6} full testID="recover-send" />
            ) : (
              <>
                <Field label="6-digit code sent to this phone">
                  <TextField value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" accessibilityLabel="SMS code" testID="recover-otp" />
                </Field>
                <Field label="Recovery code" hint="Format XXXX-XXXX. Each code works once.">
                  <TextField value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Recovery code" testID="recover-code" />
                </Field>
                <Button label="Recover master access" onPress={submit} loading={busy} disabled={otp.length !== 6 || code.replace(/[^A-Z0-9]/gi, '').length !== 8} full testID="recover-submit" />
              </>
            )}
            {error ? (
              <Text variant="caption" color={colors.danger} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Text variant="caption">Lost both your phone and your recovery codes? Contact the app owner’s technical team: a verified manual recovery is done directly on the server and is fully audited.</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
