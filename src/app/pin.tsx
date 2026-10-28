import { useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DomeArt } from '@/components/art/Illustrations';
import { Button } from '@/components/ui/Button';
import { CodeInput } from '@/components/ui/CodeInput';
import { Banner, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Field } from '@/components/ui/forms';
import { Header, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { cleanPin, PIN_LENGTH, pinProblem } from '@/domain/auth';
import { safeDeepLink } from '@/domain/security';
import { backend } from '@/services';
import { AppError } from '@/services/backend';
import { haptic, playSound } from '@/services/feedback';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

type Mode = 'create' | 'reset' | 'change';
type Step = 'current' | 'new' | 'confirm';

/**
 * Create (after registration OTP), reset (after Forgot PIN OTP) or change (with the current PIN).
 * The PIN is sent once to the backend, which keeps only a salted hash; nothing is stored on the phone.
 */
export default function PinSetup() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; next?: string }>();
  const mode: Mode = params.mode === 'reset' || params.mode === 'change' ? params.mode : 'create';
  const dest = safeDeepLink(params.next, '/home') as Href;
  const { user, setUser } = useSession();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [step, setStep] = useState<Step>(mode === 'change' ? 'current' : 'new');
  const [current, setCurrent] = useState('');
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<React.ComponentRef<typeof TextInput>>(null);

  if (!user) return <Redirect href="/login" />;

  const steps: Step[] = mode === 'change' ? ['current', 'new', 'confirm'] : ['new', 'confirm'];
  const value = step === 'current' ? current : step === 'new' ? first : second;
  const setValue = (v: string) => {
    if (error) setError(null);
    const c = cleanPin(v);
    if (step === 'current') setCurrent(c);
    else if (step === 'new') setFirst(c);
    else setSecond(c);
  };
  const go = (s: Step) => {
    setStep(s);
    setTimeout(() => ref.current?.focus(), 50);
  };

  const submit = async () => {
    setError(null);
    if (value.length !== PIN_LENGTH) return setError(t('pin.mustBe4'));
    if (step === 'current') return go('new');
    if (step === 'new') {
      const p = pinProblem(first);
      if (p) return setError(t(p));
      return go('confirm');
    }
    if (second !== first) {
      setFirst('');
      setSecond('');
      setError(t('pin.mismatch'));
      haptic('light');
      return go('new');
    }
    setBusy(true);
    try {
      const updated = await backend.setPin(first, mode === 'change' ? current : undefined);
      setUser({ ...updated, language: user.language });
      playSound('save');
      toast(mode === 'reset' ? t('pin.resetDone') : mode === 'change' ? t('pin.changed') : t('pin.saved'), 'success');
      router.replace(dest);
    } catch (e) {
      setFirst('');
      setSecond('');
      if (e instanceof AppError && e.code === 'invalid_pin' && mode === 'change') {
        setCurrent('');
        setError(t('auth.wrongPin', { n: e.details?.attemptsLeft as number }));
        go('current');
      } else if (e instanceof AppError && e.code === 'otp_required') {
        // The OTP window passed: verify again rather than leave the member stuck.
        router.replace({ pathname: '/login', params: { purpose: 'setup' } });
      } else {
        setError(errMsg(e));
        go(mode === 'change' && e instanceof AppError && e.code === 'pin_locked' ? 'current' : 'new');
      }
    } finally {
      setBusy(false);
    }
  };

  const title = step === 'current' ? t('pin.currentTitle') : step === 'confirm' ? t('pin.confirmTitle') : mode === 'create' ? t('pin.createTitle') : t('pin.newTitle');
  const sub = step === 'current' ? t('pin.currentSub') : step === 'confirm' ? t('pin.confirmSub') : t('pin.createSub');
  const idx = steps.indexOf(step);

  return (
    <Screen
      header={<Header title="" onBack={idx > 0 ? () => go(steps[idx - 1]) : mode === 'change' ? () => router.back() : undefined} back={idx > 0 || mode === 'change'} home={mode === 'change'} />}
      edges={['top', 'bottom']}
    >
      <View style={{ gap: space.lg, paddingTop: space.md }}>
        <View style={{ alignItems: 'center' }}>
          <DomeArt size={104} lantern={step === 'confirm'} />
        </View>
        <Text variant="caption" center color={colors.goldDeep} testID="pin-step">
          {t('pin.step', { n: idx + 1, total: steps.length })}
        </Text>
        <Text variant="h1" center accessibilityRole="header" testID="pin-title">
          {title}
        </Text>
        <Text variant="body" color={colors.muted} center testID="pin-sub">
          {sub}
        </Text>
        <Field label={t('auth.pinLabel')} error={error ?? undefined}>
          <CodeInput key={step} ref={ref} value={value} onChange={setValue} length={PIN_LENGTH} secure error={!!error} label={title} testID="pin-setup-input" autoFocus onSubmit={submit} />
        </Field>
        <Button
          label={step === 'confirm' ? t('pin.save') : t('pin.continue')}
          onPress={submit}
          loading={busy}
          disabled={value.length !== PIN_LENGTH}
          full
          arrow
          testID="pin-continue"
        />
        <Banner tone="info" icon="lock">
          <Text variant="caption" color={colors.emerald}>
            {t('pin.privacy')}
          </Text>
        </Banner>
      </View>
    </Screen>
  );
}
