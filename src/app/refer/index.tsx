import { Linking, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FreeBoostBalance } from '@/components/referral/ReferralCards';
import { Button } from '@/components/ui/Button';
import { Banner, Loading, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { referralLink, type MyReferral, type ReferralStage } from '@/domain/referral';
import { useDashboard, useMyReferral } from '@/hooks/queries';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

/** The website address for links (set once the domain is live). Without it, the code itself is shared. */
const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL;

const STAGE_TONE: Record<ReferralStage, { fg: string; bg: string }> = {
  registered: { fg: colors.muted, bg: colors.sage },
  incomplete: { fg: colors.muted, bg: colors.sage },
  pending: { fg: colors.goldDeep, bg: colors.goldSoft },
  rewarded: { fg: colors.success, bg: '#E5F2EA' },
  rejected: { fg: colors.danger, bg: '#FBE9E7' },
};

/** Refer & Earn (approved design 2): code, link, share, counts and the invited families (initial + stage only). */
export default function Refer() {
  const { t } = useTranslation();
  const user = useSession((s) => s.user);
  const toast = useToast((s) => s.show);
  const { data: me, isLoading } = useMyReferral();
  const { data: m } = useDashboard();
  if (!user) return <Redirect href="/login" />;

  const link = me ? referralLink(me.code, SITE_URL) : undefined;
  const message = (r: MyReferral) =>
    [link ? t('referral.shareMessage', { link, code: r.code }) : t('referral.shareMessageNoLink', { code: r.code }), r.inviteeReward ? t('referral.shareBonus', { days: r.rewardDays }) : '']
      .filter(Boolean)
      .join('\n\n');

  const copy = async (text: string) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
      else throw new Error('no clipboard');
      toast(t('referral.copied'), 'success');
    } catch {
      toast(text, 'info'); // shown so it can be copied by hand
    }
  };
  const whatsapp = (r: MyReferral) => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message(r))}`).catch(() => copy(message(r)));
  const share = async (r: MyReferral) => {
    try {
      await Share.share({ message: message(r) });
    } catch {
      await copy(message(r));
    }
  };

  return (
    <Screen header={<Header title={t('referral.navTitle')} />}>
      {isLoading || !me ? (
        <Loading />
      ) : (
        <View style={{ gap: space.lg, paddingVertical: space.lg }}>
          {!me.enabled ? <Banner icon="info">{t('referral.closed')}</Banner> : null}
          <Card style={{ gap: space.md }}>
            <Text variant="body" color={colors.muted}>
              {t('referral.intro')}
            </Text>
            <View style={styles.codeBox}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="overline">{t('referral.yourCode')}</Text>
                <Text variant="h1" selectable style={{ letterSpacing: 3 }} testID="referral-code">
                  {me.code}
                </Text>
              </View>
              <Button label={t('referral.copy')} kind="secondary" size="sm" onPress={() => copy(me.code)} testID="referral-copy-code" />
            </View>
            {link ? (
              <Row style={styles.linkRow}>
                <Text variant="body" selectable numberOfLines={1} style={{ flex: 1 }} testID="referral-link">
                  {link}
                </Text>
                <Pressable onPress={() => copy(link)} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text variant="label" color={colors.emerald}>
                    {t('referral.copyLink')}
                  </Text>
                </Pressable>
              </Row>
            ) : (
              <Text variant="caption">{t('referral.noLink')}</Text>
            )}
            {me.enabled ? (
              <View style={styles.shareRow}>
                <View style={{ flex: 1 }}>
                  <Button label={t('referral.whatsapp')} full onPress={() => whatsapp(me)} icon={<Icon name="message" size={18} color={colors.white} />} testID="referral-whatsapp" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label={t('referral.share')} kind="secondary" full onPress={() => share(me)} testID="referral-share" />
                </View>
              </View>
            ) : null}
            <Text variant="caption">{t('referral.shareNote')}</Text>
          </Card>

          <View style={styles.tiles} accessibilityLabel={t('referral.title')}>
            {(
              [
                [me.stats.referred, t('referral.statReferred'), 'referred'],
                [me.stats.approved, t('referral.statApproved'), 'approved'],
                [me.stats.earned, t('referral.statEarned'), 'earned'],
              ] as const
            ).map(([n, label, id]) => (
              <View key={id} style={styles.tile} accessible accessibilityLabel={`${label}: ${n}`} testID={`referral-stat-${id}`}>
                <Text variant="h2" color={colors.charcoal}>
                  {n}
                </Text>
                <Text variant="caption" numberOfLines={2}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
          <FreeBoostBalance me={me} boostActiveUntil={m?.boostActive ? m.boostUntil : undefined} />

          <View style={{ gap: space.sm }}>
            <Text variant="h3" accessibilityRole="header">
              {t('referral.listTitle')}
            </Text>
            {me.referrals.length === 0 ? (
              <Text variant="caption">{t('referral.empty')}</Text>
            ) : (
              <Card padded={false}>
                {me.referrals.map((r, i) => (
                  <View key={r.id} style={[styles.refRow, i > 0 && styles.refRowLine]} testID="referral-row">
                    <View style={styles.initial}>
                      <Text variant="label" color={colors.emerald}>
                        {r.initial || '·'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label">
                        {[r.initial ? t('referral.family', { initial: r.initial }) : t('referral.familyAnon'), r.side ? t(`opt.lookingFor.${r.side}`) : ''].filter(Boolean).join(' · ')}
                      </Text>
                      <Text variant="caption">{t('referral.joined', { date: formatDate(r.joinedAt) })}</Text>
                    </View>
                    <View style={[styles.stage, { backgroundColor: STAGE_TONE[r.stage].bg }]}>
                      <Text variant="caption" color={STAGE_TONE[r.stage].fg} style={{ fontSize: 12 }} testID={`referral-stage-${r.stage}`}>
                        {t(`referral.stage.${r.stage}`)}
                      </Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}
            <Text variant="caption">{t('referral.privacy')}</Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  codeBox: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gold, backgroundColor: colors.goldSoft },
  linkRow: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, gap: space.sm },
  shareRow: { flexDirection: 'row', gap: space.sm },
  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, minWidth: 0, padding: space.md, gap: 2, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md },
  refRowLine: { borderTopWidth: 1, borderTopColor: colors.sage },
  initial: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  stage: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 3, maxWidth: 150 },
});
