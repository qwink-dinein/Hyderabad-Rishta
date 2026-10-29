import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PricingNotice } from '@/components/Checkout';
import { ProfilePhoto } from '@/components/ProfileCard';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { profileCompletion } from '@/domain/completion';
import { formatDate } from '@/domain/format';
import { pricingCopy } from '@/domain/pricing';
import { profileTypeOf } from '@/domain/privacy';
import type { PublicProfile } from '@/domain/types';
import { useDashboard, useInvalidateProfileState, useMyProfile, usePricing } from '@/hooks/queries';
import { useBoostStatus } from '@/hooks/useBoostStatus';
import { backend } from '@/services';
import { colors, radius, space } from '@/theme/tokens';

/**
 * Profile tab (owner PRD 2026-10-29): photo or bride/groom portrait, name + ID, real completion, Boost
 * entry that follows its state, then Edit biodata · Photos · Preferences · Privacy · Activity ·
 * Shortlist · Account settings. Metrics and payments live on /activity.
 */
export default function Dashboard() {
  const { t } = useTranslation();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const invalidate = useInvalidateProfileState();
  const { data: profile, isLoading } = useMyProfile();
  const { data: m } = useDashboard();
  const { data: pricing } = usePricing();
  const boost = useBoostStatus();

  if (isLoading) return <Loading />;

  const header = (
    <View style={{ paddingTop: space.xs }}>
      <LanguageSwitcher compact />
    </View>
  );

  if (!profile) {
    return (
      <Screen header={<TabHeader title={t('nav.profile')} settings />}>
        {header}
        <Card style={{ marginTop: space.xl, gap: space.md, alignItems: 'flex-start' }}>
          <Text variant="h2">{t('dashboard.createTitle')}</Text>
          <Text variant="body">{t('dashboard.createBody')}</Text>
          <Button label={t('dashboard.createCta')} onPress={() => router.push('/biodata')} testID="create-biodata" />
        </Card>
        {pricing ? (
          // No biodata yet, so we don't know their type: show brides' and grooms' prices if they differ.
          <View style={{ marginTop: space.lg, gap: space.sm }}>
            {JSON.stringify(pricingCopy(pricing, 'bride')) === JSON.stringify(pricingCopy(pricing, 'groom')) ? (
              <PricingNotice config={pricing} type="bride" />
            ) : (
              <>
                <Text variant="label">{t('pricing.forBrides')}</Text>
                <PricingNotice config={pricing} type="bride" />
                <Text variant="label">{t('pricing.forGrooms')}</Text>
                <PricingNotice config={pricing} type="groom" />
              </>
            )}
          </View>
        ) : null}
      </Screen>
    );
  }

  const st = profile.status;
  const completion = profileCompletion(profile.biodata);
  const togglePause = async () => {
    try {
      await backend.setPaused(st === 'published');
      invalidate();
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };
  const step = (n: number) => () => router.push({ pathname: '/biodata', params: { step: String(n) } });
  const avatar = { id: profile.id, profileType: profileTypeOf(profile), displayName: profile.biodata.basic.fullName, photos: profile.biodata.photos, photosHidden: false } as unknown as PublicProfile;

  // The Boost entry follows the real state and the admin's live prices.
  const boostLabel = boost.nudge === 'active' ? t('me.boostActive') : boost.expired ? t('me.boostAgain') : t('me.boostMy');
  const boostHint =
    boost.nudge === 'active'
      ? t('me.boostHintActive', { date: formatDate(boost.until) })
      : boost.nudge === 'not_published'
        ? t('me.boostHintNotLive')
        : boost.nudge === 'disabled'
          ? t('me.boostHintOff')
          : boost.free
            ? t('me.boostHintFree')
            : boost.fromPrice
              ? t('me.boostHintFrom', { price: boost.fromPrice })
              : '';

  return (
    <Screen header={<TabHeader title={t('nav.profile')} settings />}>
      {header}
      <Card style={{ marginTop: space.lg, gap: space.md }}>
        <Row gap={space.md}>
          <View style={styles.avatar}>
            <ProfilePhoto profile={avatar} height={64} rounded={false} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="h3" numberOfLines={1}>
              {profile.biodata.basic.fullName}
            </Text>
            <Text variant="caption">{profile.code}</Text>
            <Badge label={t(`opt.status.${st}`)} tone={st === 'published' ? 'success' : st === 'rejected' ? 'danger' : 'gold'} />
          </View>
        </Row>
        <Pressable onPress={step(completion.next?.step ?? 0)} accessibilityRole="button" accessibilityLabel={t('completion.a11y', { percent: completion.percent })} style={{ gap: 6 }} testID="profile-completion">
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="label">{t('completion.label')}</Text>
            <Text variant="label" color={colors.emerald}>{`${completion.percent}%`}</Text>
          </Row>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${completion.percent}%` }]} />
          </View>
        </Pressable>
        <Text variant="caption">{t(`preview.statusHelp.${st}`)}</Text>
        {profile.adminNote ? <Banner tone="danger" icon="flag">{`${t('dashboard.adminNote')}: ${profile.adminNote}`}</Banner> : null}
        <Row gap={space.sm} wrap>
          {st === 'draft' || st === 'rejected' ? (
            <Button label={profile.lastStep >= 7 ? t('preview.publish') : t('dashboard.continueCta')} size="sm" onPress={() => router.push(profile.lastStep >= 7 ? '/biodata/preview' : '/biodata')} />
          ) : null}
          <Button label={t('dashboard.viewAsOthers')} size="sm" kind="secondary" onPress={() => router.push('/biodata/preview')} />
          {st === 'published' || st === 'paused' ? (
            <Button label={st === 'published' ? t('dashboard.pause') : t('dashboard.resume')} size="sm" kind="ghost" onPress={togglePause} />
          ) : null}
        </Row>
      </Card>

      <View style={{ marginTop: space.lg, gap: space.md }}>
        <MenuRow icon="crown" title={boostLabel} hint={boostHint} onPress={() => router.push('/boost')} gold testID="open-boost" />
        <View style={styles.group}>
          <MenuRow icon="edit" title={t('dashboard.editBiodata')} hint={t('me.editHint')} onPress={step(0)} testID="me-edit" />
          <MenuRow icon="image" title={t('me.photos')} hint={t('me.photosHint')} onPress={step(0)} testID="me-photos" />
          <MenuRow icon="sliders" title={t('me.preferences')} hint={t('me.preferencesHint')} onPress={step(5)} testID="me-preferences" />
          <MenuRow icon="shield" title={t('me.privacy')} hint={t('me.privacyHint')} onPress={step(6)} testID="me-privacy" />
          <MenuRow icon="eye" title={t('me.activity')} hint={m ? `${t('stats.views')}: ${m.views} · ${t('stats.interests')}: ${m.requestsReceived}` : t('me.activityHint')} onPress={() => router.push('/activity')} testID="me-activity" last />
        </View>
        <View style={styles.group}>
          <MenuRow icon="heart" title={t('me.shortlisted')} hint={t('me.shortlistedHint')} onPress={() => router.push('/shortlist')} testID="me-shortlist" />
          <MenuRow icon="settings" title={t('me.account')} hint={t('me.accountHint')} onPress={() => router.push('/settings')} testID="me-settings" last />
        </View>
      </View>
    </Screen>
  );
}

function MenuRow({ icon, title, hint, onPress, gold, last, testID }: { icon: IconName; title: string; hint?: string; onPress: () => void; gold?: boolean; last?: boolean; testID?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={hint ? `${title}. ${hint}` : title} style={({ pressed }) => [gold ? styles.goldRow : styles.row, !gold && !last && styles.rowDivider, pressed && { opacity: 0.85 }]} testID={testID}>
      <View style={[styles.rowIcon, gold && { backgroundColor: colors.goldMuted }]}>
        <Icon name={icon} size={18} color={gold ? colors.white : colors.emerald} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        {hint ? <Text variant="caption">{hint}</Text> : null}
      </View>
      <Icon name="chevronRight" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', borderWidth: 2, borderColor: colors.gold },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.sage, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.emerald },
  group: { borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  goldRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
});
