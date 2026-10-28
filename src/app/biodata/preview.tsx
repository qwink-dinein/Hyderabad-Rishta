import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckoutSheet, PricingNotice } from '@/components/Checkout';
import { ProfileDetails } from '@/components/ProfileDetails';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { NO_CONSENT, profileTypeOf, projectProfile } from '@/domain/privacy';
import type { Order } from '@/domain/types';
import { firstInvalidStep, STEP_KEYS } from '@/domain/validation';
import { useInvalidateProfileState, useMyProfile, usePricing } from '@/hooks/queries';
import { backend } from '@/services';
import { celebrate, playSound } from '@/services/feedback';
import { space } from '@/theme/tokens';

/** Full preview exactly as others will see it (privacy applied), then publish (PRD §7). */
export default function Preview() {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useMyProfile();
  const { data: pricing } = usePricing();
  const invalidate = useInvalidateProfileState();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading || !pricing) return <Loading />;
  if (!profile) return <Redirect href="/biodata" />;

  const invalidStep = firstInvalidStep(profile.biodata);
  const publicView = projectProfile(profile, NO_CONSENT);
  const type = profileTypeOf(profile);
  const canSubmit = profile.status === 'draft' || profile.status === 'rejected';

  const publish = async () => {
    setBusy(true);
    try {
      const res = await backend.submitForPublication();
      if (res.order) setOrder(res.order);
      else done(res.profile.status);
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const done = (status: string) => {
    invalidate();
    if (status === 'published') celebrate('published');
    else playSound('save');
    toast(status === 'published' ? t('preview.published') : t('preview.submitted'));
    router.replace('/dashboard');
  };

  return (
    <Screen
      header={<Header title={t('preview.title')} />}
      footer={
        canSubmit ? (
          <Button
            label={profile.status === 'rejected' ? t('preview.resubmit') : t('preview.publish')}
            onPress={publish}
            loading={busy}
            disabled={invalidStep !== -1}
            full
            testID="publish"
          />
        ) : (
          <Button label={t('dashboard.editBiodata')} kind="secondary" onPress={() => router.push('/biodata')} full />
        )
      }
    >
      <View style={{ gap: space.md, paddingVertical: space.lg }}>
        <Row wrap>
          <Text variant="label">{t('dashboard.status')}:</Text>
          <Badge label={t(`opt.status.${profile.status}`)} tone={profile.status === 'published' ? 'success' : profile.status === 'rejected' ? 'danger' : 'gold'} />
        </Row>
        <Text variant="caption">{t(`preview.statusHelp.${profile.status}`)}</Text>
        {profile.adminNote ? (
          <Banner tone="danger" icon="flag">
            {`${t('dashboard.adminNote')}: ${profile.adminNote}`}
          </Banner>
        ) : null}
        {invalidStep !== -1 ? (
          <Banner tone="warning" icon="flag">
            <Text variant="caption">{t('preview.incomplete')}</Text>
            <Button label={`${t('preview.goFix')} · ${t(`wizard.steps.${STEP_KEYS[invalidStep]}`)}`} size="sm" kind="secondary" onPress={() => router.push({ pathname: '/biodata', params: { step: String(invalidStep) } })} style={{ marginTop: space.sm, alignSelf: 'flex-start' }} />
          </Banner>
        ) : null}
        {canSubmit ? <PricingNotice config={pricing} type={type} /> : null}
        <Text variant="caption">{t('preview.sub')}</Text>
      </View>
      <ProfileDetails profile={publicView} />
      <View style={{ marginTop: space.xl }}>
        <Button label={t('dashboard.editBiodata')} kind="ghost" onPress={() => router.push({ pathname: '/biodata', params: { step: '0' } })} />
      </View>
      <CheckoutSheet
        order={order}
        onClose={() => setOrder(null)}
        onDone={(ok) => {
          setOrder(null);
          if (ok) backend.getMyProfile().then((p) => done(p?.status ?? 'pending'));
          else invalidate();
        }}
      />
    </Screen>
  );
}
