import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CodeLink } from '@/components/admin/CodeLink';
import { ProfileDetails } from '@/components/ProfileDetails';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, confirm, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/forms';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate, formatMoney } from '@/domain/format';
import { FULL_ACCESS, profileTypeOf, projectProfile } from '@/domain/privacy';
import type { ProfileStatus } from '@/domain/types';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, space } from '@/theme/tokens';

/** One member, every admin action in one place: profile, account, interests, reports, payments. */
export default function AdminMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const me = useSession((s) => s.user);
  const [note, setNote] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.admin('member', id), queryFn: () => backend.adminGetMember(id) });

  if (isLoading) return <Loading />;
  if (error || !data)
    return (
      <Screen header={<Header title="Member" />}>
        <ErrorView error={error} onRetry={refetch} />
      </Screen>
    );

  const { member: m, user: u, profile: p } = data;
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(msg);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };
  const setStatus = (next: ProfileStatus, needsNote = false) => {
    if (!p) return;
    if (needsNote && !note.trim()) return toast('Add a note explaining what needs to change.', 'danger');
    return run(() => backend.adminSetProfileStatus(p.id, next, note.trim() || undefined), `Profile ${next === 'published' ? 'published' : next === 'rejected' ? 'sent back for changes' : next}.`);
  };
  // Same rule the server enforces: nobody manages the master; only the master manages sub-admins.
  const canManageAccount = u.id !== me?.id && u.role !== 'master' && (u.role === 'user' || me?.role === 'master');
  const deleted = !!u.deletedAt || !!p?.deletedAt;

  return (
    <Screen header={<Header title={m.code ?? 'Member'} />}>
      <Card style={{ gap: space.sm, marginTop: space.lg }}>
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <View style={{ gap: 2, flex: 1, minWidth: 180 }}>
            <Text variant="overline">Profile ID {m.code ?? '— (no profile yet)'}</Text>
            <Text variant="h2">{m.name ?? 'No profile'}</Text>
            <Text variant="caption">
              {[p ? profileTypeOf(p) : null, m.city, m.phoneMasked, `joined ${formatDate(u.createdAt, 'en')}`].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Row gap={space.xs} wrap>
            {u.role !== 'user' ? <Badge label={u.role === 'master' ? 'master' : 'sub-admin'} tone="gold" /> : null}
            {m.profileStatus ? <Badge label={m.profileStatus} tone={m.profileStatus === 'published' ? 'success' : m.profileStatus === 'rejected' ? 'danger' : 'gold'} /> : null}
            {u.deactivatedAt ? <Badge label="suspended" tone="danger" /> : null}
            {deleted ? <Badge label="in trash" tone="danger" /> : null}
          </Row>
        </Row>
        {p?.adminNote ? <Text variant="caption">Last admin note: {p.adminNote}</Text> : null}
      </Card>

      {deleted ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warning" icon="ban">
            This member is in Trash. The master admin can restore it from Trash within 30 days.
          </Banner>
        </View>
      ) : null}

      {p && !deleted ? (
        <Section title="Profile actions">
          <Card style={{ gap: space.sm }}>
            <Row gap={space.sm} wrap>
              {p.status !== 'published' ? <Button label="Approve & publish" size="sm" onPress={() => setStatus('published')} testID="member-approve" /> : null}
              {p.status === 'published' ? <Button label="Pause" size="sm" kind="secondary" onPress={() => setStatus('paused')} testID="member-pause" /> : null}
              <Button label="Request changes" size="sm" kind="secondary" onPress={() => setStatus('rejected', true)} />
              <Button
                label="Delete profile"
                size="sm"
                kind="danger"
                onPress={async () => {
                  if (await confirm({ title: `Delete ${m.code}?`, body: 'It disappears from the app immediately and moves to Trash (30-day recovery).', confirmLabel: 'Delete', danger: true }))
                    run(() => backend.adminDeleteProfile(p.id, note.trim() || 'Removed by admin'), 'Profile moved to Trash.');
                }}
              />
            </Row>
            <TextField value={note} onChangeText={setNote} placeholder="Note to member / reason (required to request changes)" multiline accessibilityLabel="Admin note" />
            <Button label={showProfile ? 'Hide full profile' : 'View full profile'} size="sm" kind="ghost" onPress={() => setShowProfile(!showProfile)} style={{ alignSelf: 'flex-start' }} />
            {showProfile ? <ProfileDetails profile={projectProfile(p, FULL_ACCESS)} /> : null}
          </Card>
        </Section>
      ) : null}

      {!deleted ? (
        <Section title="Account">
          <Card style={{ gap: space.sm }}>
            {canManageAccount ? (
              <Row gap={space.sm} wrap>
                <Button
                  label={u.deactivatedAt ? 'Reactivate account' : 'Suspend account'}
                  size="sm"
                  kind="secondary"
                  onPress={() => run(() => backend.adminSetUserDeactivated(u.id, !u.deactivatedAt), u.deactivatedAt ? 'Account reactivated.' : 'Account suspended.')}
                  testID="member-suspend"
                />
                <Button
                  label="Delete account"
                  size="sm"
                  kind="danger"
                  onPress={async () => {
                    if (await confirm({ title: 'Delete this account?', body: 'The account and its profile move to Trash (30-day recovery).', confirmLabel: 'Delete', danger: true }))
                      run(() => backend.adminDeleteUser(u.id, note.trim() || 'Removed by admin'), 'Account moved to Trash.');
                  }}
                />
              </Row>
            ) : (
              <Text variant="caption">{u.id === me?.id ? 'This is your own account.' : u.role === 'master' ? 'The master account cannot be managed here.' : 'Only the master admin can manage sub-admin accounts.'}</Text>
            )}
          </Card>
        </Section>
      ) : null}

      <Section title={`Interests (${data.requests.length})`}>
        {data.requests.length ? (
          data.requests.map((r) => (
            <Card key={r.id} style={{ gap: 4 }}>
              <Row gap={space.xs} wrap style={{ justifyContent: 'space-between' }}>
                <Row gap={space.xs} wrap>
                  <CodeLink code={r.fromCode} userId={r.fromUserId} />
                  <Text variant="label">→</Text>
                  <CodeLink code={r.toCode} userId={r.toUserId} />
                </Row>
                <Badge label={r.status} tone={r.status === 'accepted' ? 'success' : r.status === 'pending' ? 'gold' : 'muted'} />
              </Row>
              <Text variant="caption">
                {r.fromName} → {r.toName} · {formatDate(r.createdAt, 'en')}
              </Text>
              <Button
                label="Delete request"
                size="sm"
                kind="ghost"
                onPress={async () => {
                  if (await confirm({ title: 'Delete this request?', body: 'Both members lose it from their inbox.', confirmLabel: 'Delete', danger: true })) run(() => backend.adminDeleteRequest(r.id), 'Request deleted.');
                }}
                style={{ alignSelf: 'flex-start' }}
              />
            </Card>
          ))
        ) : (
          <Text variant="caption">No interests sent or received.</Text>
        )}
      </Section>

      <Section title={`Reports about this member (${data.reportsAbout.length})`}>
        {data.reportsAbout.length ? (
          data.reportsAbout.map((r) => (
            <Card key={r.id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label">Reason: {r.reason}</Text>
                <Badge label={r.status} tone={r.status === 'open' ? 'danger' : 'muted'} />
              </Row>
              {r.details ? <Text variant="body">{r.details}</Text> : null}
              <Text variant="caption">Reported {formatDate(r.createdAt, 'en')}</Text>
              {r.status === 'open' ? (
                <Row gap={space.sm} wrap>
                  <Button label="Resolve & pause profile" size="sm" kind="danger" onPress={() => run(() => backend.adminResolveReport(r.id, 'resolved', true), 'Resolved — profile paused.')} />
                  <Button label="Resolve" size="sm" kind="secondary" onPress={() => run(() => backend.adminResolveReport(r.id, 'resolved'), 'Report resolved.')} />
                  <Button label="Dismiss" size="sm" kind="ghost" onPress={() => run(() => backend.adminResolveReport(r.id, 'dismissed'), 'Report dismissed.')} />
                </Row>
              ) : null}
            </Card>
          ))
        ) : (
          <Text variant="caption">No reports.</Text>
        )}
        {data.reportsBy.length ? <Text variant="caption">This member has filed {data.reportsBy.length} report(s) about others.</Text> : null}
      </Section>

      <Section title={`Payments (${data.orders.length})`}>
        {data.orders.length ? (
          data.orders.map((o) => (
            <Card key={o.id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label">
                  {o.kind} · {o.amount ? formatMoney(o.amount, o.currency) : 'Free'}
                </Text>
                <Badge label={o.status} tone={o.status === 'paid' || o.status === 'free' ? 'success' : o.status === 'failed' ? 'danger' : 'muted'} />
              </Row>
              <Text variant="caption">
                {formatDate(o.createdAt, 'en')}
                {o.simulated ? ' · simulated' : ''}
              </Text>
              {o.status === 'pending' ? <Button label="Cancel order" size="sm" kind="ghost" onPress={() => run(() => backend.adminCancelOrder(o.id), 'Order cancelled.')} style={{ alignSelf: 'flex-start' }} /> : null}
            </Card>
          ))
        ) : (
          <Text variant="caption">No payments.</Text>
        )}
      </Section>

      <View style={{ marginTop: space.xl }}>
        <Button label="Search another member" kind="secondary" onPress={() => router.push('/admin/search')} />
      </View>
      <Text variant="caption" center style={{ marginTop: space.md, color: colors.muted }}>
        Every action is authorised on the server and recorded in the audit log.
      </Text>
    </Screen>
  );
}
