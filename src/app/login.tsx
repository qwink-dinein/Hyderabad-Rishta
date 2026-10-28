import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher, changeLanguage } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { Banner, useErrorMessage } from '@/components/ui/feedback';
import { Field, Select, TextField } from '@/components/ui/forms';
import { Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { COUNTRY_CODES } from '@/domain/options';
import { isAdminRole } from '@/domain/types';
import { otpSchema, phoneSchema } from '@/domain/validation';
import { backend, backendInfo } from '@/services';
import { AppError } from '@/services/backend';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Mobile + OTP auth (PRD §3) with resend cooldown, attempt limits and clear demo labelling. */
export default function Login() {
  const { t } = useTranslation();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const qc = useQueryClient();
  const errMsg = useErrorMessage();
  const { setUser, lang } = useSession();
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [resendsLeft, setResendsLeft] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const otpRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (stage !== 'otp') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);

  const digits = phone.replace(/\D/g, '');
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const sendOtp = async () => {
    setError(null);
    if (!phoneSchema.safeParse(digits).success) return setError(t('v.phone'));
    setBusy(true);
    try {
      const r = await backend.requestOtp(cc, digits);
      setResendAt(new Date(r.resendAvailableAt).getTime());
      setResendsLeft(r.resendsLeft);
      setStage('otp');
      setCode('');
      setTimeout(() => otpRef.current?.focus(), 50);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    if (!otpSchema.safeParse(code).success) return setError(t('v.otp'));
    setBusy(true);
    try {
      const { user, isNew } = await backend.verifyOtp(cc, digits, code);
      qc.clear(); // never leak a previous user's cached data
      // Keep the language chosen before login; save it to the new account.
      if (user.language !== lang) await backend.setLanguage(lang);
      setUser({ ...user, language: lang });
      await changeLanguage(lang);
      if (isAdminRole(user.role)) router.replace('/admin');
      else if (isNew || next === 'biodata') router.replace('/biodata');
      else router.replace('/discover');
    } catch (e) {
      const left = e instanceof AppError ? (e.details?.attemptsLeft as number | undefined) : undefined;
      setError(left != null ? `${errMsg(e)} ${t('auth.attemptsLeft', { n: left })}` : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<Header title={t('auth.title')} right={null} />} edges={['top', 'bottom']}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <LanguageSwitcher />
        {backendInfo.kind === 'demo' ? (
          <Banner tone="warning" icon="sparkle">
            <Text variant="caption" color={colors.goldDeep}>
              {t('auth.demoNote')}
            </Text>
            <Text variant="caption" color={colors.goldDeep}>
              {t('auth.demoAccounts')}
            </Text>
          </Banner>
        ) : null}

        {stage === 'phone' ? (
          <View>
            <Text variant="h1" accessibilityRole="header">
              {t('auth.title')}
            </Text>
            <Text variant="caption" style={{ marginBottom: space.lg }}>
              {t('auth.sub')}
            </Text>
            <Field label={t('auth.countryCode')}>
              <Select label={t('auth.countryCode')} options={COUNTRY_CODES.map((c) => ({ value: c.code, label: `${c.code}  ${c.country}` }))} value={cc} onChange={setCc} />
            </Field>
            <Field label={t('auth.phone')} error={error ?? undefined}>
              <TextField
                testID="phone-input"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                inputMode="tel"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder={t('auth.phonePlaceholder')}
                accessibilityLabel={t('auth.phone')}
                onSubmitEditing={sendOtp}
                maxLength={16}
                error={!!error}
              />
            </Field>
            <Button label={t('auth.sendOtp')} onPress={sendOtp} loading={busy} full testID="send-otp" />
          </View>
        ) : (
          <View>
            <Text variant="h1" accessibilityRole="header">
              {t('auth.otpTitle')}
            </Text>
            <Text variant="caption" style={{ marginBottom: space.lg }}>
              {t('auth.otpSent', { phone: `${cc} ${digits}` })}
            </Text>
            <Field label={t('auth.otpLabel')} error={error ?? undefined}>
              <TextField
                testID="otp-input"
                ref={otpRef}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                inputMode="numeric"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                accessibilityLabel={t('auth.otpLabel')}
                onSubmitEditing={verify}
                style={{ fontSize: 24, letterSpacing: 8, textAlign: 'center' }}
                error={!!error}
              />
            </Field>
            <Button label={t('auth.verify')} onPress={verify} loading={busy} full testID="verify-otp" />
            <Row style={{ justifyContent: 'space-between', marginTop: space.lg }} wrap>
              <Button label={t('auth.changeNumber')} kind="ghost" size="sm" onPress={() => setStage('phone')} />
              <Button
                label={secondsLeft > 0 ? t('auth.resendIn', { s: secondsLeft }) : t('auth.resend')}
                kind="ghost"
                size="sm"
                disabled={secondsLeft > 0 || resendsLeft === 0}
                onPress={sendOtp}
              />
            </Row>
            {resendsLeft != null ? (
              <Text variant="caption" center>
                {t('auth.resendsLeft', { n: resendsLeft })}
              </Text>
            ) : null}
          </View>
        )}
        <Text variant="caption" center>
          {t('auth.terms')}
        </Text>
        <Button label={t('auth.masterRecovery')} kind="ghost" size="sm" onPress={() => router.push('/recover')} />
      </View>
    </Screen>
  );
}
