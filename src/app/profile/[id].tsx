import { useState } from 'react';
import { Linking, Modal, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ProfileDetails } from '@/components/ProfileDetails';
import { Button } from '@/components/ui/Button';
import { Banner, confirm, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, Field, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { useMyProfile, useProfile, useRequestWith, useShortlistIds, useToggleShortlist } from '@/hooks/queries';
import { useOptions } from '@/hooks/useOptions';
import { backend } from '@/services';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

/** Profile details + shortlist, contact request status, report and block (PRD §10–12, §16). */
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data: profile, isLoading, error, refetch } = useProfile(id);
  const { data: me } = useMyProfile();
  const { data: req } = useRequestWith(id);
  const { data: shortIds } = useShortlistIds();
  const toggle = useToggleShortlist();
  const [reportOpen, setReportOpen] = useState(false);

  if (isLoading) return <Loading />;
  if (error || !profile)
    return (
      <Screen header={<Header title="" />}>
        <ErrorView error={error} onRetry={refetch} />
      </Screen>
    );

  const isOwn = me?.id === profile.id;
  const shortlisted = !!shortIds?.includes(profile.id);

  const block = async () => {
    const ok = await confirm({ title: t('profile.block'), body: t('profile.blockConfirm'), confirmLabel: t('profile.block'), danger: true });
    if (!ok) return;
    try {
      await backend.blockProfile(profile.id);
      qc.invalidateQueries();
      toast(t('profile.blocked'));
      router.back();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const status = req?.request.status;
  const action = (() => {
    if (isOwn) return <Banner icon="eye">{t('profile.ownPreview')}</Banner>;
    if (status === 'pending' && req?.direction === 'sent') return <Button label={t('profile.requestPending')} kind="secondary" disabled full />;
    if (status === 'pending' && req?.direction === 'received') return <Button label={t('profile.respond')} onPress={() => router.push('/requests')} full />;
    if (status === 'accepted') return <Button label={t('profile.requestAccepted')} kind="secondary" onPress={() => router.push('/requests')} full />;
    if (status === 'declined') return <Button label={t('profile.requestDeclined')} kind="secondary" disabled full />;
    return null; // sticky footer CTA handles the default case
  })();

  const contact = profile.contact ? (
    <Card style={{ gap: space.sm }}>
      <Row>
        <Icon name="shield" size={18} color={colors.success} />
        <Text variant="caption" color={colors.success}>
          {t('profile.contactShared')}
        </Text>
      </Row>
      <Text variant="h3" selectable>
        {profile.contact.countryCode} {profile.contact.phone}
      </Text>
      {Platform.OS !== 'web' ? <Button label={t('profile.phone')} size="sm" kind="secondary" icon={<Icon name="phone" size={16} />} onPress={() => Linking.openURL(`tel:${profile.contact!.countryCode}${profile.contact!.phone}`)} /> : null}
    </Card>
  ) : (
    <Banner icon="lock">{t('profile.contactLocked')}</Banner>
  );

  const canRequest = !isOwn && !req;
  // Why the viewer can't send yet (null = they can). Shown as guidance; the button stays tappable.
  const blocker: { msg: string; cta?: { label: string; go: () => void } } | null = !me
    ? { msg: t('profile.sendNeedsBiodata'), cta: { label: t('dashboard.createCta'), go: () => router.push('/biodata') } }
    : me.status === 'published'
      ? null
      : me.status === 'pending'
        ? { msg: t('profile.sendPending') }
        : me.status === 'paused'
          ? { msg: t('profile.sendPaused'), cta: { label: t('dashboard.resume'), go: () => router.push('/dashboard') } }
          : { msg: t('profile.sendNeedsPublish'), cta: { label: t('preview.publish'), go: () => router.push('/biodata/preview') } };
  const onSend = () => {
    if (!profile.acceptsRequests) return toast(t('err.not_accepting'), 'info');
    if (blocker) {
      if (blocker.cta) blocker.cta.go();
      else toast(blocker.msg, 'info');
      return;
    }
    router.push(`/request/${profile.id}`);
  };
  return (
    <Screen
      header={
        <Header
          title={profile.displayName}
          right={
            !isOwn ? (
              <Button label={shortlisted ? '♥' : '♡'} kind="ghost" size="sm" onPress={() => toggle.mutate(profile.id)} accessibilityHint={shortlisted ? t('card.shortlisted') : t('card.shortlist')} />
            ) : null
          }
        />
      }
      footer={
        canRequest ? (
          <Row gap={space.sm}>
            <Button
              label={shortlisted ? t('card.shortlisted') : t('card.shortlist')}
              kind="secondary"
              icon={<Icon name={shortlisted ? 'heartFilled' : 'heart'} size={18} color={shortlisted ? colors.gold : colors.emerald} />}
              onPress={() => toggle.mutate(profile.id)}
              style={{ flex: 1 }}
            />
            <Button
              label={profile.acceptsRequests ? t('profile.sendRequest') : t('profile.notAccepting')}
              onPress={onSend}
              style={{ flex: 1.4 }}
              disabled={!profile.acceptsRequests}
              testID="send-request"
            />
          </Row>
        ) : undefined
      }
    >
      <View style={{ gap: space.md, paddingTop: space.lg }}>
        {action}
        {canRequest && blocker && profile.acceptsRequests ? (
          <Banner tone="warning" icon="mail">
            <Text variant="caption" color={colors.goldDeep}>
              {blocker.msg}
            </Text>
            {blocker.cta ? <Button label={blocker.cta.label} size="sm" kind="secondary" onPress={blocker.cta.go} style={{ alignSelf: 'flex-start', marginTop: space.sm }} /> : null}
          </Banner>
        ) : null}
      </View>
      <View style={{ marginTop: space.md }}>
        <ProfileDetails profile={profile} contactSlot={contact} />
      </View>
      {!isOwn ? (
        <Row style={{ justifyContent: 'center', marginTop: space.xxl }} gap={space.lg}>
          <Button label={t('profile.report')} kind="ghost" size="sm" icon={<Icon name="flag" size={16} />} onPress={() => setReportOpen(true)} />
          <Button label={t('profile.block')} kind="ghost" size="sm" icon={<Icon name="ban" size={16} color={colors.danger} />} onPress={block} />
        </Row>
      ) : null}
      <ReportSheet open={reportOpen} profileId={profile.id} onClose={() => setReportOpen(false)} />
    </Screen>
  );
}

function ReportSheet({ open, profileId, onClose }: { open: boolean; profileId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { opts } = useOptions();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [reason, setReason] = useState<string | undefined>();
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!reason) return;
    setBusy(true);
    try {
      await backend.reportProfile(profileId, reason, details);
      toast(t('profile.reportSent'));
      onClose();
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text variant="h2" accessibilityRole="header">
            {t('profile.reportTitle')}
          </Text>
          <Field label={t('profile.reportReason')} required>
            <ChipGroup options={opts('report')} value={reason} onChange={setReason} />
          </Field>
          <Field label={t('profile.reportDetails')} optional>
            <TextField value={details} onChangeText={setDetails} multiline maxLength={1000} accessibilityLabel={t('profile.reportDetails')} />
          </Field>
          <Row gap={space.sm}>
            <Button label={t('common.cancel')} kind="secondary" onPress={onClose} style={{ flex: 1 }} />
            <Button label={t('common.send')} onPress={submit} loading={busy} disabled={!reason} style={{ flex: 1 }} />
          </Row>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.ivory, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.sm, width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
});
