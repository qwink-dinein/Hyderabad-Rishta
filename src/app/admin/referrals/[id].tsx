import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Field, TextField } from '@/components/ui/forms';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { colors, space } from '@/theme/tokens';
import { FLAG_TEXT, STATUS_TEXT } from '@/components/referral/adminText';

/** Review one referral: who invited whom, the checks, history; approve / reject / revoke with an audited reason. */
export default function AdminReferral() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // The list call is the one source (search by the referral's code would also work); filtered here by id.
  const { data, isLoading } = useQuery({ queryKey: qk.admin('referrals', 'all', ''), queryFn: () => backend.adminListReferrals(undefined, '') });
  const r = data?.find((x) => x.id === id);
  const act = async (key: string, fn: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(done, 'success');
    } catch (e) {
      toast(errMsg(e), 'danger');
    } finally {
      setBusy(null);
    }
  };
  if (isLoading) return <Screen header={<Header title="Review referral" />}><Loading /></Screen>;
  if (!r) return <Screen header={<Header title="Review referral" />}><Text variant="body">This referral was not found.</Text></Screen>;
  const check = (ok: boolean, text: string) => (
    <Row gap={space.sm} key={text}>
      <Icon name={ok ? 'check' : 'flag'} size={16} color={ok ? colors.success : colors.danger} />
      <Text variant="body" color={ok ? colors.charcoal : colors.danger} style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
  return (
    <Screen header={<Header title="Review referral" />}>
      <Section title={STATUS_TEXT[r.status]}>
        <Card style={{ gap: space.md }}>
          <Row gap={space.lg} wrap style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
              <Text variant="caption">Invited by</Text>
              <Text variant="bodyStrong">{r.referrer.name ?? 'Member'}</Text>
              <Text variant="caption">{[r.referrer.profileCode, `code ${r.code}`].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 140, gap: 2 }}>
              <Text variant="caption">New family</Text>
              <Text variant="bodyStrong">{r.referred.name ?? 'No biodata yet'}</Text>
              <Text variant="caption">{[r.referred.profileCode, r.referred.profileStatus].filter(Boolean).join(' · ')}</Text>
            </View>
          </Row>
        </Card>
      </Section>
      <Section title="Checks">
        <Card style={{ gap: space.sm }}>
          {check(true, 'New number, never had an account (checked at sign-up)')}
          {check(true, 'Verified by one-time code')}
          {check(r.referred.full, r.referred.full ? 'Biodata 100% (checked by the server)' : 'Biodata not 100% yet')}
          {check(true, 'Not the same account as the referrer')}
          {r.flags.map((f) => check(false, FLAG_TEXT[f] ?? f))}
        </Card>
      </Section>
      <Section title="History">
        <Card style={{ gap: 4 }}>
          <Text variant="caption">{formatDate(r.createdAt)} · Registered with code {r.code}</Text>
          {r.qualifiedAt ? <Text variant="caption">{formatDate(r.qualifiedAt)} · 100% and live</Text> : null}
          {r.history.map((h, i) => (
            <Text key={i} variant="caption">
              {formatDate(h.at)} · {h.action.replace('referral.', '')}
              {h.meta && typeof h.meta.reason === 'string' ? ` — “${h.meta.reason}”` : ''}
            </Text>
          ))}
          {r.decidedAt ? <Text variant="caption">{formatDate(r.decidedAt)} · decided{r.decidedBy ? ` by ${r.decidedBy}` : ''}</Text> : null}
        </Card>
      </Section>
      {r.rewards.length ? (
        <Section title="Free Boosts given">
          <Card style={{ gap: space.md }}>
            {r.rewards.map((w) => (
              <Row key={w.id} style={{ justifyContent: 'space-between' }} gap={space.sm}>
                <Text variant="body" style={{ flex: 1 }}>
                  {w.role === 'referrer' ? 'Referrer' : 'Invited family'} · {w.days} days · {w.status}
                  {w.reason ? ` — “${w.reason}”` : ''}
                </Text>
                {w.status !== 'revoked' ? (
                  <Button
                    label="Revoke"
                    size="sm"
                    kind="danger"
                    loading={busy === w.id}
                    disabled={!reason.trim()}
                    onPress={() => act(w.id, () => backend.adminRevokeReferralReward(w.id, reason), 'Boost revoked')}
                    testID={`admin-ref-revoke-${w.role}`}
                  />
                ) : null}
              </Row>
            ))}
            <Text variant="caption">Revoking an unused Boost removes it; a running one ends now. Paid Boosts are never touched here. A reason is required.</Text>
          </Card>
        </Section>
      ) : null}
      <Section title="Decision">
        <Field label="Reason (saved in the audit log)" optional={r.status === 'review'}>
          <TextField value={reason} onChangeText={setReason} multiline maxLength={500} accessibilityLabel="Reason" testID="admin-ref-reason" />
        </Field>
        {r.status === 'review' ? (
          <Row gap={space.sm}>
            <View style={{ flex: 1 }}>
              <Button label="Approve · give Boosts" full loading={busy === 'approve'} onPress={() => act('approve', () => backend.adminDecideReferral(r.id, true, reason), 'Approved — Boosts given')} testID="admin-ref-approve" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Reject" kind="danger" full loading={busy === 'reject'} onPress={() => act('reject', () => backend.adminDecideReferral(r.id, false, reason), 'Rejected')} testID="admin-ref-reject" />
            </View>
          </Row>
        ) : (
          <Text variant="caption">Only referrals waiting for a check can be approved or rejected.</Text>
        )}
      </Section>
    </Screen>
  );
}
