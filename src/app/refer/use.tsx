import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Banner, Loading, showSuccess, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { useDashboard, useInvalidateProfileState, useMyProfile, useMyReferral } from '@/hooks/queries';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

/** Use a free Boost (approved design 4): what it is, when it starts and ends, and how many are left. */
export default function UseFreeBoost() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const invalidate = useInvalidateProfileState();
  const { data: me, isLoading } = useMyReferral();
  const { data: m } = useDashboard();
  const { data: profile } = useMyProfile();
  const [busy, setBusy] = useState(false);
  const [openedAt] = useState(() => Date.now());
  if (!user) return <Redirect href="/login" />;

  const next = me?.rewards.filter((w) => w.status === 'available').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const running = !!m?.boostActive;
  const live = profile?.status === 'published';
  const start = async () => {
    if (!next || busy) return;
    setBusy(true);
    try {
      await backend.useReferralBoost();
      invalidate();
      showSuccess({
        title: t('success.boostTitle'),
        body: t('success.boostBody', { count: next.days }),
        primary: { label: t('success.seeMyBoost'), go: () => router.replace('/boost') },
        secondary: { label: t('success.explore'), go: () => router.replace('/discover') },
      });
    } catch (e) {
      toast(errMsg(e), 'danger');
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const history = (me?.rewards ?? []).filter((w) => w.status !== 'available');
  return (
    <Screen header={<Header title={t('referral.useTitle')} />}>
      {isLoading || !me ? (
        <Loading />
      ) : (
        <View style={{ gap: space.lg, paddingVertical: space.lg }}>
          {next ? (
            <Card style={{ gap: space.md }}>
              <Row gap={space.md}>
                <View style={styles.icon}>
                  <Icon name="crown" size={24} color={colors.goldDeep} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h2" color={colors.charcoal}>
                    {t('referral.freeDays', { days: next.days })}
                  </Text>
                  <Text variant="caption">{next.role === 'invitee' ? t('referral.fromWelcome') : t('referral.fromReferral')}</Text>
                </View>
              </Row>
              <View style={styles.dates}>
                <View style={styles.date}>
                  <Text variant="caption">{t('referral.starts')}</Text>
                  <Text variant="bodyStrong">{t('referral.today', { date: formatDate(new Date(openedAt).toISOString()) })}</Text>
                </View>
                <View style={styles.date}>
                  <Text variant="caption">{t('referral.ends')}</Text>
                  <Text variant="bodyStrong" testID="referral-use-ends">
                    {formatDate(new Date(openedAt + next.days * 86400000).toISOString())}
                  </Text>
                </View>
              </View>
              <Text variant="body">{t('referral.usesOne', { count: me.stats.available, left: me.stats.available - 1 })}</Text>
              {[t('referral.benefitSame'), t('myBoost.benefitRotation'), t('referral.benefitFree')].map((line) => (
                <Row key={line} gap={space.sm}>
                  <Icon name="check" size={16} color={colors.success} />
                  <Text variant="body" style={{ flex: 1 }}>
                    {line}
                  </Text>
                </Row>
              ))}
              {running ? (
                <Banner icon="clock">{t('referral.useAfter', { date: formatDate(m?.boostUntil) })}</Banner>
              ) : !live ? (
                <Banner icon="info">{t('boost.notPublishedBody')}</Banner>
              ) : null}
              <Button label={t('referral.start')} kind="gold" full onPress={start} loading={busy} disabled={running || !live} testID="referral-start" />
              <Button label={t('referral.later')} kind="ghost" full onPress={() => router.back()} />
            </Card>
          ) : (
            <Card style={{ gap: space.sm }}>
              <Text variant="body">{t('referral.noneYet')}</Text>
              <Button label={t('referral.inviteCta')} onPress={() => router.replace('/refer')} />
            </Card>
          )}
          <View style={styles.note}>
            <Icon name="info" size={18} color={colors.emerald} />
            <Text variant="caption" style={{ flex: 1 }}>
              {t('referral.oneAtATime')}
            </Text>
          </View>
          {history.length ? (
            <Card style={{ gap: space.sm }}>
              <Text variant="h3">{t('referral.historyTitle')}</Text>
              {history.map((w) => (
                <Text key={w.id} variant="caption">
                  {w.status === 'used' ? t('referral.historyUsed', { days: w.days, date: formatDate(w.usedAt) }) : t('referral.historyRevoked', { days: w.days })}
                </Text>
              ))}
            </Card>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  dates: { flexDirection: 'row', gap: space.sm },
  date: { flex: 1, minWidth: 0, padding: space.md, borderRadius: radius.md, backgroundColor: colors.ivory, gap: 2 },
  note: { flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.sage },
});
