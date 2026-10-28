import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DomeArt } from '@/components/art/Illustrations';
import { LanguageSwitcher, changeLanguage } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { Banner, useErrorMessage } from '@/components/ui/feedback';
import { Field, Select, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { COUNTRY_CODES } from '@/domain/options';
import { isAdminRole } from '@/domain/types';
import { otpSchema, phoneSchema } from '@/domain/validation';
import { backend, backendInfo } from '@/services';
import { AppError } from '@/services/backend';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

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
  const [now, setNow] = useState(() => Date.now());
  const otpRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [otpFocused, setOtpFocused] = useState(false);

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
      else router.replace(next === 'discover' ? '/discover' : '/home');
    } catch (e) {
      const left = e instanceof AppError ? (e.details?.attemptsLeft as number | undefined) : undefined;
      setError(left != null ? `${errMsg(e)} ${t('auth.attemptsLeft', { n: left })}` : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const isRegistering = next === 'biodata';
  const masked = digits.length > 4 ? `${cc} ${digits.slice(0, 2)}${'•'.repeat(Math.max(0, digits.length - 6))}${digits.slice(-4)}` : `${cc} ${digits}`;
  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  return (
    <Screen
      header={<Header title="" onBack={stage === 'otp' ? () => setStage('phone') : undefined} right={<LanguageSwitcher compact />} />}
      edges={['top', 'bottom']}
    >
      <View style={{ gap: space.lg, paddingTop: space.md }}>
        {stage === 'phone' ? (
          <View>
            <View style={styles.art}>
              <DomeArt size={120} />
            </View>
            <Text variant="h1" center accessibilityRole="header">
              {isRegistering ? t('auth.phoneTitle') : t('auth.welcomeBack')}
            </Text>
            <Text variant="body" color={colors.muted} center style={{ marginTop: space.xs, marginBottom: space.xl }}>
              {isRegistering ? t('auth.phoneSub') : t('auth.welcomeSub')}
            </Text>
            <Field label={t('auth.phone')} error={error ?? undefined}>
              <View style={styles.phoneRow}>
                <Select
                  label={t('auth.countryCode')}
                  options={COUNTRY_CODES.map((c) => ({ value: c.code, label: `${c.code}  ${c.country}` }))}
                  value={cc}
                  onChange={setCc}
                  displayValue={(v) => v[0]}
                  style={styles.cc}
                />
                <View style={{ flex: 1 }}>
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
                    style={{ fontSize: 17, letterSpacing: 0.5 }}
                  />
                </View>
              </View>
            </Field>
            <Button label={t('auth.sendOtp')} onPress={sendOtp} loading={busy} full arrow testID="send-otp" />
            <Row style={styles.reassure} gap={space.md}>
              <Icon name="lock" size={20} color={colors.goldMuted} />
              <Text variant="caption" style={{ flex: 1 }}>
                {t('auth.private')}
              </Text>
            </Row>
            {!isRegistering ? (
              <Text variant="body" color={colors.muted} center style={{ marginTop: space.lg }}>
                {t('auth.newHere')}{' '}
                <Text variant="bodyStrong" color={colors.emerald} onPress={() => router.replace({ pathname: '/login', params: { next: 'biodata' } })} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>
                  {t('landing.createBiodata')}
                </Text>
              </Text>
            ) : null}
          </View>
        ) : (
          <View>
            <View style={styles.art}>
              <DomeArt size={120} lantern />
            </View>
            <Text variant="h1" center accessibilityRole="header">
              {t('auth.otpTitle')}
            </Text>
            <Text variant="body" color={colors.muted} center style={{ marginTop: space.xs }}>
              {t('auth.otpSentTo')}
            </Text>
            <Text variant="bodyStrong" center style={{ marginBottom: space.xl, writingDirection: 'ltr' }}>
              {masked}
            </Text>
            <Field label={t('auth.otpLabel')} error={error ?? undefined}>
              {/* One real input (paste + SMS autofill) drawn as six boxes. */}
              <Pressable onPress={() => otpRef.current?.focus()} style={styles.otpWrap} accessible={false}>
                <View style={styles.boxes} pointerEvents="none">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const active = i === Math.min(code.length, 5) && otpFocused;
                    return (
                      <View key={i} style={[styles.box, code[i] ? styles.boxFilled : null, active && styles.boxActive, error ? styles.boxError : null]}>
                        <Text variant="bodyStrong" color={colors.charcoal} style={{ fontSize: 22, lineHeight: 28 }}>
                          {code[i] ?? ''}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <TextInput
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
                  onFocus={() => setOtpFocused(true)}
                  onBlur={() => setOtpFocused(false)}
                  caretHidden
                  style={styles.otpInput}
                />
              </Pressable>
            </Field>
            <Text variant="body" color={colors.muted} center style={{ marginBottom: space.lg }}>
              {secondsLeft > 0 ? t('auth.resendCountdown', { time: mmss }) : resendsLeft === 0 ? t('auth.noResends') : ' '}
            </Text>
            <Button label={t('auth.verify')} onPress={verify} loading={busy} full arrow testID="verify-otp" />
            <Row style={{ justifyContent: 'space-between', marginTop: space.md }} wrap>
              <Button label={t('auth.changeNumber')} kind="ghost" size="sm" onPress={() => setStage('phone')} />
              <Button label={t('auth.resend')} kind="ghost" size="sm" disabled={secondsLeft > 0 || resendsLeft === 0} onPress={sendOtp} />
            </Row>
            {resendsLeft != null ? (
              <Text variant="caption" center>
                {t('auth.resendsLeft', { n: resendsLeft })}
              </Text>
            ) : null}
          </View>
        )}
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
        <Text variant="caption" center>
          {t('auth.terms')}
        </Text>
        <Button label={t('auth.masterRecovery')} kind="ghost" size="sm" onPress={() => router.push('/recover')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', marginBottom: space.md },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  cc: { width: 104, paddingHorizontal: space.md },
  reassure: { marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: 'center' },
  otpWrap: { position: 'relative' },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, direction: 'ltr' },
  box: { flex: 1, maxWidth: 52, aspectRatio: 0.86, borderRadius: radius.md, borderWidth: 1.2, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  boxFilled: { borderColor: colors.goldMuted },
  boxActive: { borderColor: colors.emerald, borderWidth: 2 },
  boxError: { borderColor: colors.danger },
  // Transparent but focusable/clickable: keeps native paste, autofill and screen-reader input.
  otpInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent', fontSize: 16 }, // 16 avoids iOS focus zoom
});
