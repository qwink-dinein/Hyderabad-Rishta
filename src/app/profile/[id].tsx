import { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ContactActions } from '@/components/ContactActions';
import { HeartButton } from '@/components/ProfileCard';
import { ProfileDetails } from '@/components/ProfileDetails';
import { declinedRecently } from '@/domain/connections';
import { Button } from '@/components/ui/Button';
import { Banner, confirm, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, Field, TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { useMyProfile, useProfile, useRequestWith, useShortlistIds, useToggleShortlist } from '@/hooks/queries';
import { useOptions } from '@/hooks/useOptions';
import { backend } from '@/services';
import { haptic } from '@/services/feedback';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

/** Profile details + shortlist, contact request status, report and block (PRD §10–12, §16). */
export default function ProfileScreen() {
  const { id, report, express } = useLocalSearchParams<{ id: string; report?: string; express?: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data: profile, isLoading, error, refetch } = useProfile(id);
  const { data: me, isLoading: meLoading } = useMyProfile();
  const { data: req, isLoading: reqLoading } = useRequestWith(id);
  const { data: shortIds } = useShortlistIds();
  const toggle = useToggleShortlist();
  const [reportOpen, setReportOpen] = useState(report === '1'); // deep link from the requests inbox
  const expressHandled = useRef(false);

  // "Express Interest" tapped on a profile card: continue straight to the connect options when the
  // same checks this screen uses pass; otherwise stay here so the reason banner explains why.
  useEffect(() => {
    if (express !== '1' || expressHandled.current || !profile || meLoading || reqLoading) return;
    expressHandled.current = true;
    const st = req?.request.status;
    const busy = st === 'pending' || st === 'accepted' || st === 'blocked';
    if (me?.id !== profile.id && !busy && !declinedRecently(profile.relation) && profile.acceptsRequests && me?.status === 'published') router.push(`/request/${profile.id}`);
  }, [express, profile, me, meLoading, req, reqLoading]);

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
  // An "active" request holds the pair: show its status instead of allowing a duplicate (PRD §2).
  const active = req && (status === 'pending' || status === 'accepted' || status === 'blocked');
  const statusCard = (() => {
    if (isOwn) return <Banner icon="eye">{t('profile.ownPreview')}</Banner>;
    if (!req) return null;
    const label = t(`requests.status.${status}`);
    return (
      <Card style={{ gap: space.sm }}>
        <Text variant="bodyStrong">{req.direction === 'sent' ? t('profile.interestStatus', { status: label }) : `${t('profile.theirInterest')} · ${label}`}</Text>
        {active ? <Button label={t('profile.openRequest')} size="sm" kind="secondary" onPress={() => router.push('/requests')} style={{ alignSelf: 'flex-start' }} testID="open-request" /> : null}
      </Card>
    );
  })();

  const contact = profile.contact ? <ContactActions countryCode={profile.contact.countryCode} phone={profile.contact.phone} /> : <Banner icon="lock">{t('profile.contactLocked')}</Banner>;

  // They said no recently: don't offer a re-send, explain instead (server enforces the same cool-down).
  const theyDeclined = !isOwn && !active && declinedRecently(profile.relation);
  const canExpress = !isOwn && !active && !theyDeclined;
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
  const onExpress = () => {
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
              <HeartButton on={shortlisted} onToggle={() => toggle.mutate(profile.id)} tone="plain" />
            ) : null
          }
        />
      }
      footer={
        !isOwn ? (
          <View style={{ gap: space.xs }}>
            {canExpress ? (
              <Text variant="caption" center>
                {t('profile.expressInterestHelp')}
              </Text>
            ) : null}
            <Row gap={space.sm}>
              <Button
                label={shortlisted ? t('card.shortlisted') : t('card.shortlist')}
                accessibilityHint={shortlisted ? undefined : t('profile.addToShortlist')}
                kind="secondary"
                icon={<Icon name={shortlisted ? 'heartFilled' : 'heart'} size={18} color={shortlisted ? colors.goldMuted : colors.emerald} />}
                onPress={() => {
                  haptic('select');
                  toggle.mutate(profile.id);
                }}
                style={{ flex: 1 }}
                testID="shortlist-toggle"
              />
              {canExpress ? (
                <Button
                  label={profile.acceptsRequests ? t('profile.expressInterest') : t('profile.notAccepting')}
                  onPress={onExpress}
                  style={{ flex: 1.3 }}
                  disabled={!profile.acceptsRequests}
                  arrow
                  testID="express-interest"
                />
              ) : null}
            </Row>
          </View>
        ) : undefined
      }
    >
      <View style={{ gap: space.md, paddingTop: space.lg }}>
        {statusCard}
        {theyDeclined ? (
          <View testID="declined-no-resend">
            <Banner icon="mail">{t('profile.declinedNoResend')}</Banner>
          </View>
        ) : null}
        {canExpress && blocker && profile.acceptsRequests ? (
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
