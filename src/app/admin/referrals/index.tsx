import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Banner, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, TextField, ToggleRow } from '@/components/ui/forms';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import type { AdminReferralFilter, AdminReferralRow, BoostMode, ReferralSettings } from '@/domain/referral';
import { FLAG_TEXT, STATUS_TEXT } from '@/components/referral/adminText';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { colors, radius, space } from '@/theme/tokens';

/** Admin console is English-only (like the rest of /admin). */
const FILTERS: { value: AdminReferralFilter | 'all'; label: string }[] = [
  { value: 'review', label: 'To check' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'approved', label: 'Approved' },
  { value: 'progress', label: 'In progress' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];
/** Referrals (owner spec 2026-11-02): how members get a Boost, the numbers, and every referral to check. */
export default function AdminReferrals() {
  const [filter, setFilter] = useState<AdminReferralFilter | 'all'>('review');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);
  const overview = useQuery({ queryKey: qk.admin('referralOverview'), queryFn: () => backend.adminReferralOverview() });
  const list = useQuery({ queryKey: qk.admin('referrals', filter, query), queryFn: () => backend.adminListReferrals(filter === 'all' ? undefined : filter, query) });
  const o = overview.data;
  return (
    <Screen header={<Header title="Referrals & free Boosts" />}>
      {o ? <SettingsCard initial={o.settings} /> : <Loading />}
      {o ? (
        <Section title="Numbers">
          <View style={styles.tiles}>
            {(
              [
                ['Referred', o.referred],
                ['Approved', o.approved],
                ['To approved', o.referred ? `${Math.round((100 * o.approved) / o.referred)}%` : '—'],
                ['Free Boosts given / used', `${o.rewardsIssued} / ${o.rewardsUsed}`],
                ['Paid Boosts', o.paidBoosts],
                ['Link visits', o.visits],
                ['To check', o.toCheck],
                ['Flagged', o.flagged],
                ['Rejected / revoked', `${o.rejected} · ${o.rewardsRevoked} revoked`],
              ] as const
            ).map(([label, v]) => (
              <View key={label} style={styles.tile} testID={`admin-ref-${label}`}>
                <Text variant="h3">{String(v)}</Text>
                <Text variant="caption">{label}</Text>
              </View>
            ))}
          </View>
          <Text variant="caption">A link visit or sign-up is never counted as a referral — only approved families earn Boosts.</Text>
        </Section>
      ) : null}
      <Section title="Referrals">
        <TextField value={q} onChangeText={setQ} placeholder="Name, profile ID or code" accessibilityLabel="Search referrals" testID="admin-ref-search" />
        <ChipGroup options={FILTERS} value={filter} onChange={(v: AdminReferralFilter | 'all') => setFilter(v)} accessibilityLabel="Filter referrals" />
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.length ? (
          <Text variant="caption">No referrals here.</Text>
        ) : (
          <Card padded={false}>
            {list.data.map((r, i) => (
              <Pressable key={r.id} onPress={() => router.push(`/admin/referrals/${r.id}`)} accessibilityRole="button" style={[styles.row, i > 0 && styles.rowLine]} testID="admin-ref-row">
                <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
                  <Text variant="label" style={{ flex: 1 }}>
                    {r.referred.name ?? 'New family'} ← {r.referrer.name ?? 'member'}
                  </Text>
                  <View style={[styles.pill, r.flags.length ? styles.pillFlag : r.status === 'rewarded' ? styles.pillOk : styles.pillWait]}>
                    <Text variant="caption" style={{ fontSize: 12 }} color={r.flags.length && r.status === 'review' ? colors.danger : colors.charcoal}>
                      {r.flags.length && r.status === 'review' ? 'Flagged' : STATUS_TEXT[r.status]}
                    </Text>
                  </View>
                </Row>
                <Text variant="caption">
                  {[r.referred.profileCode, `code ${r.code}`, r.referred.full ? '100%' : 'not 100% yet', formatDate(r.createdAt)].filter(Boolean).join(' · ')}
                </Text>
                {r.flags.map((f) => (
                  <Text key={f} variant="caption" color={colors.danger}>
                    {FLAG_TEXT[f] ?? f}
                  </Text>
                ))}
              </Pressable>
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

/** How members get a Boost + the referral rules. Switching never touches Boosts already bought, earned or running. */
function SettingsCard({ initial }: { initial: ReferralSettings }) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [s, setS] = useState<ReferralSettings>(initial);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify({ ...s, updatedAt: undefined }) !== JSON.stringify({ ...initial, updatedAt: undefined });
  const save = async () => {
    setBusy(true);
    try {
      await backend.adminUpdateReferralSettings(s);
      qc.invalidateQueries({ queryKey: ['admin'] });
      qc.invalidateQueries({ queryKey: qk.referralSettings });
      qc.invalidateQueries({ queryKey: qk.myReferral });
      toast('Saved', 'success');
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title="How members get a Boost">
      <Card style={{ gap: space.md }}>
        <ChipGroup
          options={[
            { value: 'paid', label: 'Paid Boost' },
            { value: 'referral', label: 'Referral Boost' },
          ]}
          value={s.mode}
          onChange={(v: BoostMode) => setS({ ...s, mode: v })}
          accessibilityLabel="Boost acquisition mode"
        />
        <Text variant="caption">
          {s.mode === 'paid'
            ? 'Members see today’s paid Boost screen (plans and prices from Pricing & boosts).'
            : 'Paid plans are hidden (free plans stay). Members are shown how to earn free Boosts by inviting families.'}
        </Text>
        <ToggleRow label="Referral programme" hint="Codes, links and rewards. Off = no new rewards; earned Boosts stay." value={s.enabled} onChange={(v) => setS({ ...s, enabled: v })} testID="admin-ref-enabled" />
        <ToggleRow label="Welcome Boost for the invited family" hint="They also get a free Boost of the same length, at the same moment." value={s.inviteeReward} onChange={(v) => setS({ ...s, inviteeReward: v })} />
        <ToggleRow label="Team checks each referral" hint="A free Boost is given only after a one-tap check here. Flagged ones always wait for a check." value={s.review} onChange={(v) => setS({ ...s, review: v })} testID="admin-ref-review" />
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Free Boost length</Text>
            <Text variant="caption">Per approved referral. Applies to new rewards only.</Text>
          </View>
          <Row gap={space.xs}>
            <Button label="−" size="sm" kind="secondary" onPress={() => setS({ ...s, rewardDays: Math.max(1, s.rewardDays - 1) })} />
            <Text variant="bodyStrong" style={{ minWidth: 64, textAlign: 'center' }} testID="admin-ref-days">
              {s.rewardDays} days
            </Text>
            <Button label="+" size="sm" kind="secondary" onPress={() => setS({ ...s, rewardDays: Math.min(90, s.rewardDays + 1) })} />
          </Row>
        </Row>
        {dirty && s.mode !== initial.mode ? (
          <Banner icon="info">Switching never removes Boosts already running, bought or earned — members keep and can use them in either mode.</Banner>
        ) : null}
        <Button label="Save" onPress={save} loading={busy} disabled={!dirty} full testID="admin-ref-save" />
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexGrow: 1, flexBasis: 100, padding: space.md, gap: 2, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  row: { padding: space.md, gap: 4 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.sage },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  pillOk: { backgroundColor: '#E5F2EA' },
  pillWait: { backgroundColor: colors.goldSoft },
  pillFlag: { backgroundColor: '#FBE9E7' },
});
