import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Banner, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Field, TextField } from '@/components/ui/forms';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { useProfile, useSendRequest } from '@/hooks/queries';
import { space } from '@/theme/tokens';

const CONTACT_PATTERN = /(\+?\d[\d\s-]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)/;

/** Compose → preview → send, with explicit privacy guidance (PRD §12). */
export default function SendRequest() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { data: profile, isLoading } = useProfile(id);
  const send = useSendRequest();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [message, setMessage] = useState('');
  const [previewing, setPreviewing] = useState(false);

  if (isLoading || !profile) return <Loading />;
  const hasContact = CONTACT_PATTERN.test(message);

  const submit = async () => {
    try {
      await send.mutateAsync({ to: profile.id, message: message.trim() || undefined });
      toast(t('request.sent'));
      router.back();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  return (
    <Screen
      header={<Header title={t('request.title')} />}
      footer={
        previewing ? (
          <Row gap={space.sm}>
            <Button label={t('common.edit')} kind="secondary" onPress={() => setPreviewing(false)} style={{ flex: 1 }} />
            <Button label={t('request.send')} onPress={submit} loading={send.isPending} style={{ flex: 1.4 }} testID="confirm-send" />
          </Row>
        ) : (
          <Button label={t('common.preview')} onPress={() => setPreviewing(true)} full testID="preview-request" />
        )
      }
    >
      <View style={{ gap: space.lg, paddingTop: space.lg }}>
        <Text variant="label">{t('request.to', { name: profile.displayName })}</Text>
        {!previewing ? (
          <>
            <Text variant="body">{t('request.helper')}</Text>
            <Field label={t('request.messageLabel')} optional hint={`${message.length}/800`}>
              <TextField value={message} onChangeText={setMessage} multiline maxLength={800} accessibilityLabel={t('request.messageLabel')} />
            </Field>
            <Banner icon="shield" tone={hasContact ? 'warning' : 'info'}>
              {hasContact ? t('request.containsContact') : t('request.privacyWarning')}
            </Banner>
          </>
        ) : (
          <>
            <Text variant="h3">{t('request.previewTitle')}</Text>
            <Card>
              <Text variant="body">{message.trim() || t('request.noMessage')}</Text>
            </Card>
            {hasContact ? <Banner tone="warning" icon="shield">{t('request.containsContact')}</Banner> : null}
          </>
        )}
      </View>
    </Screen>
  );
}
