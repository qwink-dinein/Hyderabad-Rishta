import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Banner, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Field, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { maskPhone, uid } from '@/domain/format';
import { useProfile, useSendRequest } from '@/hooks/queries';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

const CONTACT_PATTERN = /(\+?\d[\d\s-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/;
type Mode = 'intro' | 'offer';

/**
 * "How would you like to connect?" — Option A: introduction only (number stays private);
 * Option B: also offer my number (explicit consent; revealed only if they accept). Then a
 * confirmation step before anything is sent. One idempotency key per screen visit makes
 * double taps and retries safe.
 */
export default function Connect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const { data: profile, isLoading } = useProfile(id);
  const send = useSendRequest();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [mode, setMode] = useState<Mode | null>(null);
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const idempotencyKey = useMemo(() => uid('int_'), []);

  if (isLoading || !profile || !user) return <Loading />;
  const masked = maskPhone(user.phone);
  const hasContact = CONTACT_PATTERN.test(message);
  const canContinue = mode === 'intro' || (mode === 'offer' && consent);

  const submit = async () => {
    try {
      await send.mutateAsync({ to: profile.id, input: { message: message.trim() || undefined, offerPhone: mode === 'offer', consent: mode === 'offer' && consent, idempotencyKey } });
      toast(t('connect.sent'));
      router.back();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const option = (m: Mode, icon: 'mail' | 'phone', title: string, desc: string) => {
    const on = mode === m;
    return (
      <Pressable
        onPress={() => {
          setMode(m);
          setConfirming(false);
        }}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${title}. ${desc}`}
        style={[styles.option, on && styles.optionOn]}
        testID={`connect-${m}`}
      >
        <View style={[styles.optionIcon, on && { backgroundColor: colors.emerald }]}>
          <Icon name={icon} color={on ? colors.white : colors.emerald} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3">{title}</Text>
          <Text variant="caption">{desc}</Text>
        </View>
        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
      </Pressable>
    );
  };

  const footer = !mode ? undefined : confirming ? (
    <Row gap={space.sm}>
      <Button label={t('common.edit')} kind="secondary" onPress={() => setConfirming(false)} style={{ flex: 1 }} disabled={send.isPending} />
      <Button
        label={mode === 'offer' ? t('connect.sendWithNumber') : t('connect.sendInterest')}
        onPress={submit}
        loading={send.isPending}
        disabled={send.isPending}
        style={{ flex: 1.6 }}
        testID="confirm-send"
      />
    </Row>
  ) : (
    <Button label={t('common.preview')} onPress={() => setConfirming(true)} disabled={!canContinue} full testID="preview-request" />
  );

  return (
    <Screen header={<Header title={t('profile.expressInterest')} />} footer={footer}>
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <View style={{ gap: 4 }}>
          <Text variant="overline">{t('request.to', { name: profile.displayName })}</Text>
          <Text variant="h1" accessibilityRole="header">
            {t('connect.title')}
          </Text>
        </View>

        {!confirming ? (
          <>
            <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
              {option('intro', 'mail', t('connect.optA'), t('connect.optADesc'))}
              {option('offer', 'phone', t('connect.optB'), t('connect.optBDesc'))}
            </View>

            {mode ? (
              <>
                {mode === 'offer' ? (
                  <Card style={{ gap: space.sm }}>
                    <Row>
                      <Icon name="lock" size={18} />
                      <Text variant="bodyStrong">{t('connect.yourNumber', { masked: `${user.countryCode} ${masked}` })}</Text>
                    </Row>
                    <Pressable
                      onPress={() => setConsent((c) => !c)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: consent }}
                      accessibilityLabel={t('connect.consent')}
                      style={styles.checkRow}
                      testID="consent-checkbox"
                    >
                      <View style={[styles.checkbox, consent && styles.checkboxOn]}>{consent ? <Icon name="check" size={16} color={colors.white} strokeWidth={2.6} /> : null}</View>
                      <Text variant="body" style={{ flex: 1 }}>
                        {t('connect.consent')}
                      </Text>
                    </Pressable>
                    <Text variant="caption">{t('connect.screenshotNote')}</Text>
                  </Card>
                ) : null}
                <Field label={t('request.messageLabel')} optional hint={`${message.length}/800`}>
                  <TextField value={message} onChangeText={setMessage} multiline maxLength={800} placeholder={t('connect.placeholder')} accessibilityLabel={t('request.messageLabel')} testID="interest-message" />
                </Field>
                <Banner icon="shield" tone={hasContact ? 'warning' : 'info'}>
                  {hasContact ? t('request.containsContact') : t('request.privacyWarning')}
                </Banner>
              </>
            ) : (
              <Text variant="caption">{t('connect.choose')}</Text>
            )}
          </>
        ) : (
          <>
            <Text variant="h3">{t('connect.confirmTitle')}</Text>
            <Card style={{ gap: space.sm }}>
              <Text variant="label">{t('request.previewTitle')}</Text>
              <Text variant="body">{message.trim() || t('request.noMessage')}</Text>
            </Card>
            <Banner icon={mode === 'offer' ? 'phone' : 'lock'} tone={mode === 'offer' ? 'warning' : 'info'}>
              {mode === 'offer' ? t('connect.confirmWithNumber', { masked: `${user.countryCode} ${masked}` }) : t('connect.confirmNoNumber')}
            </Banner>
            {hasContact ? <Banner tone="warning" icon="shield">{t('request.containsContact')}</Banner> : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  optionOn: { borderColor: colors.emerald, backgroundColor: '#FBFDFB' },
  optionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.emerald },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.emerald },
  checkRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', paddingVertical: space.xs },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.emerald, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOn: { backgroundColor: colors.emerald },
});
