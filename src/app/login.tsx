import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DomeArt } from '@/components/art/Illustrations';
import { LanguageSwitcher, changeLanguage } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { Banner, Loading, useErrorMessage } from '@/components/ui/feedback';
import { Field, Select, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { cleanPin, PIN_LENGTH } from '@/domain/auth';
import { COUNTRY_CODES } from '@/domain/options';
import { isAdminRole, type User } from '@/domain/types';
import { otpSchema, phoneSchema } from '@/domain/validation';
import { backend, backendInfo } from '@/services';
import { AppError } from '@/services/backend';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Login (Mini PRD "OTP registration + 4-digit PIN login"):
 *  - returning user on a phone that verified the number before → number prefilled + PIN, no OTP;
 *  - new number / new phone → OTP, then create + confirm a PIN (/pin);
 *  - Forgot PIN → OTP to the registered number, then a new PIN; older accounts set a PIN the same way.
 * Resend cooldowns, attempt limits and lockouts are enforced by the backend, not this screen.
 */
type Stage = 'loading' | 'pin' | 'phone' | 'otp';
type Purpose = 'login' | 'reset' | 'setup';

export default function Login() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ next?: string; purpose?: string }>();
  const next = params.next;
  const qc = useQueryClient();
  const errMsg = useErrorMessage();
  const { setUser, lang, user: signedIn } = useSession();
  const [cc, setCc] = useState('+91');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [stage, setStage] = useState<Stage>('loading');
  const [purpose, setPurpose] = useState<Purpose>(params.purpose === 'setup' ? 'setup' : 'login');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [resendsLeft, setResendsLeft] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const otpRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const pinRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Prefill: the number last used on this phone, and PIN login if this phone may use it.
  useEffect(() => {
    let live = true;
    (async () => {
      if (params.purpose === 'setup' && signedIn) {
        setCc(signedIn.countryCode);
        setPhone(signedIn.phone);
        setStage('phone');
        return;
      }
      const hint = await backend.getLoginHint().catch(() => null);
      if (!live) return;
      if (hint) {
        setCc(hint.countryCode);
        setPhone(hint.phone);
      }
      setStage(hint?.canUsePin && next !== 'biodata' ? 'pin' : 'phone');
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** Signed in: keep the language chosen before login, then pick where to go. */
  const enter = async (user: User, isNew: boolean) => {
    qc.clear(); // never leak a previous user's cached data
    if (user.language !== lang) await backend.setLanguage(lang);
    setUser({ ...user, language: lang });
    await changeLanguage(lang);
    if (isAdminRole(user.role)) return '/admin';
    if (isNew || next === 'biodata') return '/biodata';
    return next === 'discover' ? '/discover' : '/home';
  };

  const verify = async () => {
    setError(null);
    if (!otpSchema.safeParse(code).success) return setError(t('v.otp'));
    setBusy(true);
    try {
      const { user, isNew, needsPin } = await backend.verifyOtp(cc, digits, code);
      const dest = await enter(user, isNew);
      if (purpose === 'setup') router.replace({ pathname: '/pin', params: { mode: 'create', next: '/settings' } });
      else if (purpose === 'reset' && !needsPin) router.replace({ pathname: '/pin', params: { mode: 'reset', next: dest } });
      else if (needsPin) router.replace({ pathname: '/pin', params: { mode: 'create', next: dest } });
      else router.replace(dest); // returning user on a new phone: straight in, no PIN or biodata again
    } catch (e) {
      const left = e instanceof AppError ? (e.details?.attemptsLeft as number | undefined) : undefined;
      setError(left != null ? `${errMsg(e)} ${t('auth.attemptsLeft', { n: left })}` : errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const pinLogin = async () => {
    setError(null);
    if (pin.length !== PIN_LENGTH) return setError(t('pin.mustBe4'));
    setBusy(true);
    try {
      const { user } = await backend.pinLogin(cc, digits, pin);
      const hasProfile = !!(await backend.getMyProfile().catch(() => null));
      router.replace(await enter(user, !hasProfile && !isAdminRole(user.role)));
    } catch (e) {
      setPin('');
      const err = e instanceof AppError ? e : null;
      if (err?.code === 'invalid_pin') setError(t('auth.wrongPin', { n: err.details?.attemptsLeft as number }));
      else if (err?.code === 'pin_locked' && err.details?.reset) setError(t('auth.lockedReset'));
      else if (err?.code === 'pin_locked') {
        const at = new Date(String(err.details?.retryAt));
        setError(t('auth.lockedUntil', { time: at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }));
      } else if (err?.code === 'device_not_trusted' || err?.code === 'pin_not_set') {
        // A new phone (or no PIN yet): verify by OTP once.
        setNotice(t('auth.verifyDevice'));
        setStage('phone');
        return;
      } else setError(errMsg(e));
      setTimeout(() => pinRef.current?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  const forgotPin = () => {
    setPurpose('reset');
    setNotice(null);
    setError(null);
    setPin('');
    setStage('phone');
  };

  const otherNumber = () => {
    setPurpose('login');
    setPhone('');
    setPin('');
    setError(null);
    setNotice(null);
    setStage('phone');
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
        {stage === 'loading' ? (
          <Loading />
        ) : stage === 'pin' ? (
          <View>
            <View style={styles.art}>
              <DomeArt size={120} />
            </View>
            <Text variant="h1" center accessibilityRole="header">
              {t('auth.pinTitle')}
            </Text>
            <Text variant="body" color={colors.muted} center style={{ marginTop: space.xs, marginBottom: space.xl }}>
              {t('auth.pinSub')}
            </Text>
            <Field label={t('auth.registeredNumber')}>
              <Row style={styles.numberRow} gap={space.md}>
                <Icon name="phone" size={18} color={colors.goldMuted} />
                <Text variant="bodyStrong" style={{ flex: 1, writingDirection: 'ltr' }} testID="pin-number">
                  {cc} {digits.replace(/(\d{5})(\d+)/, '$1 $2')}
                </Text>
                <Text variant="label" color={colors.emerald} onPress={otherNumber} accessibilityRole="link" style={{ textDecorationLine: 'underline' }}>
                  {t('auth.change')}
                </Text>
              </Row>
            </Field>
            <Field label={t('auth.pinLabel')} error={error ?? undefined}>
              <CodeInput
                ref={pinRef}
                value={pin}
                onChange={(v) => {
                  setPin(cleanPin(v));
                  if (error) setError(null);
                }}
                length={PIN_LENGTH}
                secure
                error={!!error}
                label={t('auth.pinLabel')}
                testID="pin-input"
                autoFocus
                onSubmit={pinLogin}
              />
            </Field>
            <Button label={busy ? t('auth.loggingIn') : t('auth.login')} onPress={pinLogin} loading={busy} disabled={pin.length !== PIN_LENGTH} full arrow testID="pin-login" style={{ marginTop: space.md }} />
            <Row style={{ justifyContent: 'space-between', marginTop: space.md }} wrap>
              <Button label={t('auth.forgotPin')} kind="ghost" size="sm" onPress={forgotPin} testID="forgot-pin" />
              <Button label={t('auth.useOtherNumber')} kind="ghost" size="sm" onPress={otherNumber} testID="other-number" />
            </Row>
          </View>
        ) : stage === 'phone' ? (
          <View>
            <View style={styles.art}>
              <DomeArt size={120} />
            </View>
            <Text variant="h1" center accessibilityRole="header">
              {purpose === 'reset' ? t('auth.resetTitle') : purpose === 'setup' ? t('auth.setupTitle') : isRegistering ? t('auth.phoneTitle') : t('auth.welcomeBack')}
            </Text>
            <Text variant="body" color={colors.muted} center style={{ marginTop: space.xs, marginBottom: notice ? space.md : space.xl }}>
              {purpose === 'reset' ? t('auth.resetSub') : purpose === 'setup' ? t('auth.setupSub') : isRegistering ? t('auth.phoneSub') : t('auth.welcomeSub')}
            </Text>
            {notice ? (
              <View style={{ marginBottom: space.lg }}>
                <Banner tone="info" icon="shield">
                  <Text variant="caption" color={colors.emerald} testID="login-notice">
                    {notice}
                  </Text>
                </Banner>
              </View>
            ) : null}
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
                    editable={purpose !== 'setup'}
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
            {purpose !== 'login' ? (
              <Button label={t('common.cancel')} kind="ghost" size="sm" onPress={() => (purpose === 'setup' ? router.back() : (setPurpose('login'), setStage('loading'), router.replace('/login')))} style={{ marginTop: space.md, alignSelf: 'center' }} />
            ) : null}
            {!isRegistering && purpose === 'login' ? (
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
            <View style={{ marginBottom: space.lg }}>
              <Banner tone="success" icon="check">
                <Text variant="caption" color={colors.success} testID="otp-sent">
                  {t('auth.otpSentBanner')}
                </Text>
              </Banner>
            </View>
            <Field label={t('auth.otpLabel')} error={error ?? undefined}>
              <CodeInput ref={otpRef} value={code} onChange={setCode} length={6} error={!!error} label={t('auth.otpLabel')} testID="otp-input" oneTimeCode onSubmit={verify} />
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
  numberRow: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center' },
});
