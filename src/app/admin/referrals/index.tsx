import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { ChipGroup, TextField, ToggleRow } from '@/components/ui/forms';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import type { AdminReferralFilter, BoostMode, ReferralSettings } from '@/domain/referral';
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
                ['Families invited', o.referred],
                ['Waiting for you', o.toCheck],
                ['Approved', o.approved],
                ['Free Boosts given', o.rewardsIssued],
              ] as const
            ).map(([label, v]) => (
              <View key={label} style={styles.tile} testID={`admin-ref-${label}`}>
                <Text variant="h3">{String(v)}</Text>
                <Text variant="caption">{label}</Text>
              </View>
            ))}
          </View>
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

/** How members get a Boost (simplified 2026-11-02): pick Paid or Referral; Referral shows only its length and the check.
 *  The programme switch and the invited family's Boost stay on (owner: "both get benefits"); they are not shown here. */
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
      await backend.adminUpdateReferralSettings({ ...s, enabled: true, inviteeReward: true });
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
  const option = (mode: BoostMode, title: string, text: string) => {
    const on = s.mode === mode;
    return (
      <Pressable
        onPress={() => setS({ ...s, mode })}
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        aria-checked={on}
        style={[styles.option, on && styles.optionOn]}
        testID={`admin-ref-mode-${mode}`}
      >
        <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption">{text}</Text>
        </View>
      </Pressable>
    );
  };
  return (
    <Section title="How members get a Boost">
      <Card style={{ gap: space.md }}>
        {option('paid', 'Paid Boost', 'Members buy a Boost. Prices are in Pricing & boosts.')}
        {option('referral', 'Referral Boost', 'Members invite a family. When that family’s biodata is complete, both families get a free Boost.')}
        {s.mode === 'referral' ? (
          <>
            <Row style={{ justifyContent: 'space-between' }} gap={space.sm}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                Free Boost lasts
              </Text>
              <Row gap={space.xs}>
                <Button label="−" size="sm" kind="secondary" onPress={() => setS({ ...s, rewardDays: Math.max(1, s.rewardDays - 1) })} />
                <Text variant="bodyStrong" style={{ minWidth: 64, textAlign: 'center' }} testID="admin-ref-days">
                  {s.rewardDays} days
                </Text>
                <Button label="+" size="sm" kind="secondary" onPress={() => setS({ ...s, rewardDays: Math.min(90, s.rewardDays + 1) })} />
              </Row>
            </Row>
            <ToggleRow label="I approve each one first" hint="New referrals wait in the list below until you tap Approve." value={s.review} onChange={(v) => setS({ ...s, review: v })} testID="admin-ref-review" />
          </>
        ) : null}
        <Button label="Save" onPress={save} loading={busy} disabled={!dirty} full testID="admin-ref-save" />
        <Text variant="caption">Boosts members already have are never taken away.</Text>
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  optionOn: { borderColor: colors.emerald, borderWidth: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { borderColor: colors.emerald },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.emerald },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexGrow: 1, flexBasis: 140, padding: space.md, gap: 2, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  row: { padding: space.md, gap: 4 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.sage },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  pillOk: { backgroundColor: '#E5F2EA' },
  pillWait: { backgroundColor: colors.goldSoft },
  pillFlag: { backgroundColor: '#FBE9E7' },
});
