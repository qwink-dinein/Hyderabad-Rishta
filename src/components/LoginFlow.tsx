import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BrandMark, DomeArt } from '@/components/art/Illustrations';
import { LanguageSwitcher, changeLanguage } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { Banner, useErrorMessage } from '@/components/ui/feedback';
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
import { isMemberOnlyPath } from '@/hooks/useGoHome';
import { useAuthChannels } from '@/hooks/useAuthChannels';
import { takeReturnTo, useSession } from '@/state/session';
import { useFit } from '@/hooks/useFit';
import { useOnboarding } from '@/state/onboarding';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Login-first opening screen (owner request 2026-11-01), shown at / and /login:
 *  - mobile number (ALWAYS blank — typed every time, on any phone) + 4-digit PIN → Log in;
 *  - a phone that never verified this number gets a one-time WhatsApp code first (server decides), then PIN works;
 *  - Forgot PIN → WhatsApp code to the number, then a new PIN; "Log in with WhatsApp code" for accounts without a PIN;
 *  - new people: "Create an account" / "Find matches" (WhatsApp code → PIN → biodata).
 * Resend cooldowns, attempt limits and lockouts are enforced by the backend, not this screen.
 */
type Stage = 'login' | 'phone' | 'otp';
type Purpose = 'login' | 'reset' | 'setup';

export function LoginFlow() {
  const { t } = useTranslation();
  const fit = useFit();
  const params = useLocalSearchParams<{ next?: string; purpose?: string }>();
  const next = params.next;
  const qc = useQueryClient();
  const errMsg = useErrorMessage();
  const { setUser, lang, user: signedIn } = useSession();
  // PIN setup from Settings uses the signed-in member's own number; otherwise the number box always starts blank.
  const setup = params.purpose === 'setup' && signedIn ? signedIn : null;
  const [cc, setCc] = useState(setup?.countryCode ?? '+91');
  const [phone, setPhone] = useState(setup?.phone ?? '');
  const [code, setCode] = useState('');
  const [pinValue, setPin] = useState('');
  const pin = pinValue;
  const registering = params.next === 'biodata' || params.next === 'discover';
  const [stage, setStage] = useState<Stage>(params.purpose === 'setup' || registering ? 'phone' : 'login');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<Purpose>(params.purpose === 'setup' ? 'setup' : 'login');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [resendsLeft, setResendsLeft] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const otpRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const pinRef = useRef<React.ComponentRef<typeof TextInput>>(null);


  useEffect(() => {
    if (stage !== 'otp') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage]);

  const digits = phone.replace(/\D/g, '');
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const channels = useAuthChannels();
  const [sentBySms, setSentBySms] = useState(false);
  /** Sends a code on WhatsApp (or by SMS when `sms`, if the team has switched SMS on). */
  const sendOtp = async (sms = false) => {
    setError(null);
    if (!phoneSchema.safeParse(digits).success) return setError(t('v.phone'));
    setBusy(true);
    try {
      const r = sms ? await backend.requestSmsCode(cc, digits) : await backend.requestOtp(cc, digits);
      setSentBySms(sms);
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
    // Session ended mid-task: go back to that screen (guards on each screen still apply).
    const back = takeReturnTo();
    // Admins only ever go back to admin screens (never a member screen left from before).
    if (isAdminRole(user.role)) return back && !isMemberOnlyPath(back) ? (back as '/admin') : '/admin';
    if (back && !isNew) return back as '/home';
    // No biodata yet: the guided onboarding (pre-sign-up answers, if any, are already on this phone).
    if (isNew || next === 'biodata') {
      if (!useOnboarding.getState().active) useOnboarding.getState().start();
      return '/start/who';
    }
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

  const pinLogin = async (typed?: string) => {
    const pin = typed ?? pinValue;
    setError(null);
    setPhoneError(null);
    if (!phoneSchema.safeParse(digits).success) return setPhoneError(t('v.phone'));
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
        sendOtp(); // the number is already typed: send the one-time WhatsApp code straight away
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

  /** "Log in with WhatsApp code" — for accounts without a PIN (keeps the number already typed). */
  const whatsappLogin = () => {
    setPurpose('login');
    setNotice(null);
    setError(null);
    setPin('');
    setStage('phone');
  };

  /** Back to the login screen from the WhatsApp-code steps. */
  const backToLogin = () => {
    setPurpose('login');
    setNotice(null);
    setError(null);
    setCode('');
    setStage('login');
  };


  const isRegistering = registering;
  const masked = digits.length > 4 ? `${cc} ${digits.slice(0, 2)}${'•'.repeat(Math.max(0, digits.length - 6))}${digits.slice(-4)}` : `${cc} ${digits}`;
  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;

  const footerLinks = (
    <Row style={styles.links} gap={space.lg} wrap>
      <Text variant="caption" color={colors.emerald} onPress={() => router.push('/welcome')} accessibilityRole="link" style={styles.underline} testID="how-it-works">
        {t('auth.howItWorks')}
      </Text>
      <Text variant="caption" color={colors.emerald} onPress={() => router.push('/legal/privacy')} accessibilityRole="link" style={styles.underline}>
        {t('settings.privacyPolicy')}
      </Text>
      <Text variant="caption" color={colors.emerald} onPress={() => router.push('/legal/help')} accessibilityRole="link" style={styles.underline}>
        {t('settings.help')}
      </Text>
    </Row>
  );

  const extras = (
    <>
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
    </>
  );

  if (stage === 'login') {
    return (
      <Screen padded={false} edges={['top', 'bottom']}>
        <View style={[styles.inner, styles.body, { paddingTop: fit.sp(space.xl), gap: fit.sp(space.md) }]}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <BrandMark size={34} color={colors.goldMuted} />
            <Row gap={space.sm}>
              <LanguageSwitcher compact />
              <Button label={t('common.close')} kind="ghost" size="sm" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="login-close" />
            </Row>
          </Row>
          <View>
            <Text variant="h1" accessibilityRole="header" style={{ fontSize: 28 }}>
              {t('auth.welcomeBack')}
            </Text>
            {fit.tiny ? null : (
              <Text variant="body" color={colors.muted} style={{ marginTop: space.xs, fontSize: 16 }}>
                {t('onb.login.sub')}
              </Text>
            )}
          </View>
          <PhoneField
            testID="login-phone"
            cc={cc}
            onCc={setCc}
            phone={phone}
            onPhone={(v) => {
              setPhone(v);
              setPhoneError(null);
            }}
            onSubmit={() => pinRef.current?.focus()}
            error={phoneError}
          />
          <Field label={t('auth.pinLabel')} error={error ?? undefined}>
            <CodeInput
              ref={pinRef}
              value={pin}
              onChange={(v) => {
                const clean = cleanPin(v);
                setPin(clean);
                if (error) setError(null);
                // Logs in by itself on the 4th digit (no extra tap), once the number is there.
                if (clean.length === PIN_LENGTH && phoneSchema.safeParse(digits).success && !busy) void pinLogin(clean);
              }}
              length={PIN_LENGTH}
              secure
              error={!!error}
              label={t('auth.pinLabel')}
              testID="pin-input"
              onSubmit={() => pinLogin()}
            />
          </Field>
          <Button label={busy ? t('auth.loggingIn') : t('auth.login')} onPress={() => pinLogin()} loading={busy} disabled={pin.length !== PIN_LENGTH || !digits} full arrow testID="pin-login" />
          <Row style={{ justifyContent: 'space-between' }}>
            <Button label={t('auth.forgotPin')} kind="ghost" size="sm" onPress={forgotPin} testID="forgot-pin" />
            <Button label={t('auth.whatsappLogin')} kind="ghost" size="sm" onPress={whatsappLogin} testID="whatsapp-login" />
          </Row>
          <Row gap={space.sm} style={[styles.divider, fit.short && { marginTop: 0 }]}>
            <View style={styles.rule} />
            <Text variant="caption">{t('auth.newDivider')}</Text>
            <View style={styles.rule} />
          </Row>
          <Button
            label={t('onb.welcome.find')}
            kind="secondary"
            onPress={() => {
              if (!useOnboarding.getState().active) useOnboarding.getState().start();
              router.replace('/start/who');
            }}
            full
            arrow
            testID="cta-create"
          />
          {footerLinks}
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
          {/* Fine print kept small so the whole login card fits on one phone screen. */}
          <View style={styles.fine}>
            <Text variant="caption" center style={{ fontSize: 12 }}>
              {t('auth.terms')}
            </Text>
            <Pressable onPress={() => router.push('/recover')} hitSlop={12} accessibilityRole="link">
              <Text variant="caption" color={colors.emerald} center style={{ fontSize: 12 }}>
                {t('auth.masterRecovery')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      header={
        <Header
          title=""
          onBack={stage === 'otp' ? () => setStage('phone') : purpose === 'setup' ? undefined : isRegistering ? () => (router.canGoBack() ? router.back() : router.replace('/')) : backToLogin}
          right={<LanguageSwitcher compact />}
        />
      }
      edges={['top', 'bottom']}
    >
      <View style={{ gap: space.lg, paddingTop: space.md }}>
        {stage === 'phone' ? (

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
            <PhoneField
              testID="phone-input"
              cc={cc}
              onCc={setCc}
              phone={phone}
              onPhone={(v) => {
                setPhone(v);
                setError(null);
              }}
              onSubmit={() => sendOtp()}
              error={error}
              editable={purpose !== 'setup'}
            />
            <Button label={t('auth.sendOtp')} onPress={() => sendOtp()} loading={busy} full arrow testID="send-otp" />
            <Row style={styles.reassure} gap={space.md}>
              <Icon name="lock" size={20} color={colors.goldMuted} />
              <Text variant="caption" style={{ flex: 1 }}>
                {t('auth.private')}
              </Text>
            </Row>
            {purpose !== 'login' ? (
              <Button label={t('common.cancel')} kind="ghost" size="sm" onPress={() => (purpose === 'setup' ? router.back() : backToLogin())} style={{ marginTop: space.md, alignSelf: 'center' }} />
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
            {notice ? (
              <View style={{ marginBottom: space.md }}>
                <Banner tone="info" icon="shield">
                  <Text variant="caption" color={colors.emerald} testID="login-notice">
                    {notice}
                  </Text>
                </Banner>
              </View>
            ) : null}
            <View style={{ marginBottom: space.lg }}>
              <Banner tone="success" icon="check">
                <Text variant="caption" color={colors.success} testID="otp-sent">
                  {sentBySms ? t('auth.otpSentSms') : t('auth.otpSentBanner')}
                </Text>
              </Banner>
            </View>
            <Field label={t('auth.otpLabel')} error={error ?? undefined}>
              <CodeInput ref={otpRef} value={code} onChange={setCode} length={6} error={!!error} label={t('auth.otpLabel')} testID="otp-input" oneTimeCode onSubmit={verify} />
            </Field>
            <Text variant="body" color={colors.muted} center style={{ marginBottom: space.lg }}>
              {secondsLeft > 0 ? t('auth.resendCountdown', { time: mmss }) : resendsLeft === 0 ? t('auth.noResends') : ' '}
            </Text>
            {/* Once Resend unlocks: WhatsApp-only reminds people the number needs WhatsApp; with SMS on, offer it. */}
            {secondsLeft === 0 && !channels.sms ? (
              <Text variant="caption" color={colors.muted} center style={{ marginBottom: space.md }} testID="whatsapp-hint">
                {t('auth.whatsappHint')}
              </Text>
            ) : null}
            {secondsLeft === 0 && channels.sms && resendsLeft !== 0 && !sentBySms ? (
              <Button label={t('auth.sendBySms')} kind="secondary" size="sm" onPress={() => sendOtp(true)} style={{ alignSelf: 'center', marginBottom: space.md }} testID="send-by-sms" />
            ) : null}
            <Button label={t('auth.verify')} onPress={verify} loading={busy} full arrow testID="verify-otp" />
            <Row style={{ justifyContent: 'space-between', marginTop: space.md }} wrap>
              <Button label={t('auth.changeNumber')} kind="ghost" size="sm" onPress={() => setStage('phone')} />
              <Button label={t('auth.resend')} kind="ghost" size="sm" disabled={secondsLeft > 0 || resendsLeft === 0} onPress={() => sendOtp(sentBySms)} />
            </Row>
            {resendsLeft != null ? (
              <Text variant="caption" center>
                {t('auth.resendsLeft', { n: resendsLeft })}
              </Text>
            ) : null}
          </View>
        )}
        {extras}
      </View>
    </Screen>
  );
}

/** Country code + mobile number (left-to-right even in Urdu). */
export function PhoneField(p: { testID: string; cc: string; onCc: (v: string) => void; phone: string; onPhone: (v: string) => void; onSubmit: () => void; error: string | null; editable?: boolean }) {
  const { t } = useTranslation();
  return (
    <Field label={t('auth.phone')} error={p.error ?? undefined}>
      <View style={styles.phoneRow}>
        <Select
          label={t('auth.countryCode')}
          options={COUNTRY_CODES.map((c) => ({ value: c.code, label: `${c.code}  ${c.country}` }))}
          value={p.cc}
          onChange={p.onCc}
          displayValue={(v) => v[0]}
          style={styles.cc}
        />
        <View style={{ flex: 1 }}>
          <TextField
            testID={p.testID}
            value={p.phone}
            onChangeText={p.onPhone}
            keyboardType="phone-pad"
            inputMode="tel"
            autoComplete="tel"
            textContentType="telephoneNumber"
            placeholder={t('auth.phonePlaceholder')}
            accessibilityLabel={t('auth.phone')}
            onSubmitEditing={p.onSubmit}
            editable={p.editable ?? true}
            maxLength={16}
            error={!!p.error}
            style={{ fontSize: 17, letterSpacing: 0.5 }}
          />
        </View>
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', marginBottom: space.md },
  phoneRow: { flexDirection: 'row', gap: space.sm },
  cc: { width: 104, paddingHorizontal: space.md },
  reassure: { marginTop: space.lg, padding: space.md, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: 'center' },
  hero: { paddingBottom: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, overflow: 'hidden' },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { justifyContent: 'space-between', paddingHorizontal: space.lg, gap: space.sm },
  body: { paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.md },
  divider: { alignItems: 'center', marginTop: space.sm },
  rule: { flex: 1, height: 1, backgroundColor: colors.border },
  fine: { gap: space.xs, alignItems: 'center' },
  newActions: { gap: space.md },
  links: { justifyContent: 'center', paddingVertical: space.sm },
  underline: { textDecorationLine: 'underline' },
  numberRow: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: 'center' },
});
