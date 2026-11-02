import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { OnbScreen, T } from '@/components/onboarding/kit';
import { enterSession, seedDraft } from '@/components/onboarding/signIn';
import { CodeInput } from '@/components/ui/CodeInput';
import { useErrorMessage, useToast } from '@/components/ui/feedback';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { isAdminRole } from '@/domain/types';
import { backend } from '@/services';
import { AppError } from '@/services/backend';
import { haptic } from '@/services/feedback';
import { useOnboarding } from '@/state/onboarding';
import { useAuthChannels } from '@/hooks/useAuthChannels';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** Step 5: the WhatsApp code. Fills itself from WhatsApp's "Copy code" and checks on the 6th digit. */
export default function Code() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errMsg = useErrorMessage();
  const toast = useToast((s) => s.show);
  const lang = useSession((s) => s.lang);
  const { reach, answers, finish } = useOnboarding();
  const p = useLocalSearchParams<{ cc?: string; phone?: string; resendAt?: string; left?: string }>();
  const cc = p.cc ?? '+91';
  const phone = p.phone ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(() => (p.resendAt ? new Date(p.resendAt).getTime() : Date.now() + 30_000));
  const [left, setLeft] = useState<number | null>(p.left ? Number(p.left) : null);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);
  useEffect(() => reach('code'), [reach]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const id = setTimeout(() => ref.current?.focus(), 350); // after the push transition
    return () => clearTimeout(id);
  }, []);
  const secs = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const verify = async (value: string) => {
    if (busy || value.length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      const { user, needsPin } = await backend.verifyOtp(cc, phone, value);
      haptic('success');
      await enterSession(user, lang, qc);
      if (isAdminRole(user.role)) {
        finish();
        return router.replace('/admin');
      }
      const profile = await seedDraft(answers);
      // Already a member with a live biodata: no onboarding again, straight in.
      const live = profile && profile.status !== 'draft' && profile.status !== 'rejected';
      if (live) {
        finish();
        toast(t('onb.code.welcomeBack'), 'success');
      }
      const next = live ? '/home' : '/start/about';
      if (!live) reach('about'); // signed up: a restart from here continues at the first question
      if (needsPin) router.replace({ pathname: '/pin', params: { mode: 'create', next } });
      else router.replace(next);
    } catch (e) {
      setCode('');
      const n = e instanceof AppError ? (e.details?.attemptsLeft as number | undefined) : undefined;
      setError(n != null ? `${errMsg(e)} ${t('auth.attemptsLeft', { n })}` : errMsg(e));
      setTimeout(() => ref.current?.focus(), 50);
    } finally {
      setBusy(false);
    }
  };

  const channels = useAuthChannels();
  const [bySms, setBySms] = useState(false);
  const resend = async (sms = bySms) => {
    setError(null);
    try {
      const r = sms ? await backend.requestSmsCode(cc, phone) : await backend.requestOtp(cc, phone);
      setBySms(sms);
      setResendAt(new Date(r.resendAvailableAt).getTime());
      setLeft(r.resendsLeft ?? null);
      toast(sms ? t('auth.otpSentSms') : t('auth.otpSentBanner'), 'success');
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <OnbScreen step="code" title={t('onb.code.title')} subtitle={t(bySms ? 'onb.code.subSms' : 'onb.code.sub', { number: `${cc} ${phone}` })} testID="onb-code">
      <CodeInput
        ref={ref}
        value={code}
        onChange={(v) => {
          const d = v.replace(/\D/g, '').slice(0, 6);
          setCode(d);
          if (error) setError(null);
          if (d.length === 6) void verify(d);
        }}
        length={6}
        error={!!error}
        label={t('auth.otpLabel')}
        testID="onb-otp-input"
        oneTimeCode
        onSubmit={() => verify(code)}
      />
      {error ? (
        <Text variant="body" color={colors.dangerText} accessibilityLiveRegion="polite" testID="onb-code-error">
          {error}
        </Text>
      ) : null}
      {busy ? (
        <Text variant="body" color={colors.muted} center>
          {t('onb.code.checking')}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space.sm }}>
        <Button label={t('auth.changeNumber')} kind="ghost" size="sm" onPress={() => router.back()} />
        {secs > 0 ? (
          <Text variant="body" color={colors.muted} style={{ fontSize: T.label }}>
            {t('onb.code.resendIn', { time: mmss })}
          </Text>
        ) : (
          <Button label={t('auth.resend')} kind="ghost" size="sm" onPress={() => resend()} disabled={left === 0} testID="onb-resend" />
        )}
      </View>
      {secs === 0 && channels.sms && !bySms && left !== 0 ? (
        <Button label={t('auth.sendBySms')} kind="secondary" onPress={() => resend(true)} full testID="onb-send-by-sms" />
      ) : null}
      <View style={{ padding: space.md, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border }}>
        <Text variant="body" style={{ fontSize: T.label + 1 }}>
          {t('onb.code.copyHint')}
        </Text>
      </View>
    </OnbScreen>
  );
}
