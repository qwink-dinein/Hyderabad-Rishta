import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, confirm, ErrorView, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate, formatMoney } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

type NavItem = { href: Href; icon: IconName; label: string; desc: string; masterOnly?: boolean };
const NAV: NavItem[] = [
  { href: '/admin/profiles', icon: 'user', label: 'Profiles', desc: 'Approve, reject, pause, resume, remove photos, delete' },
  { href: '/admin/users', icon: 'users', label: 'Users', desc: 'Suspend, reactivate, delete accounts' },
  { href: '/admin/requests', icon: 'mail', label: 'Contact requests', desc: 'Review and delete any request' },
  { href: '/admin/reports', icon: 'flag', label: 'Reports & safety', desc: 'Resolve, pause reported profiles, delete reports' },
  { href: '/admin/announcements', icon: 'bell', label: 'Announcements', desc: 'Compose, schedule, publish, delete, readership' },
  { href: '/admin/pricing', icon: 'chart', label: 'Pricing & boosts', desc: 'Fees per bride/groom, boost duration, history' },
  { href: '/admin/orders', icon: 'star', label: 'Orders & payments', desc: 'View and cancel pending orders' },
  { href: '/admin/trash', icon: 'ban', label: 'Trash', desc: 'Deleted profiles & users (30-day recovery window)' },
  { href: '/admin/team', icon: 'shield', label: 'Team & security', desc: 'Sub-admins, master transfer, lost-phone recovery' },
  { href: '/admin/audit', icon: 'eye', label: 'Audit log', desc: 'Every sensitive action, append-only' },
];

export default function AdminHome() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { user, setUser } = useSession();
  const isMaster = user?.role === 'master';
  const { data: s, isLoading, error, refetch } = useQuery({ queryKey: qk.admin('stats'), queryFn: () => backend.adminStats() });
  const { data: sec } = useQuery({ queryKey: qk.admin('security'), queryFn: () => backend.masterSecurityStatus() });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  // One-click switch between "admin approves every profile" and "publish directly".
  const toggleApproval = async (next: boolean) => {
    try {
      const r = await backend.adminSetRequireApproval(next);
      qc.invalidateQueries({ queryKey: qk.pricing });
      refresh();
      toast(next ? 'Manual approval is ON — new profiles wait for an admin.' : 'Direct publish is ON — new profiles go live immediately.');
      if (!next && r.pending > 0) {
        const ok = await confirm({ title: `Approve ${r.pending} waiting profile(s) too?`, body: 'Profiles already waiting stay pending unless you approve them now.', confirmLabel: 'Approve all' });
        if (ok) approveAll();
      }
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const approveAll = async () => {
    try {
      const n = await backend.adminApproveAllPending();
      refresh();
      toast(`${n} profile(s) approved and published.`);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  const metric = (label: string, value: string | number) => (
    <View style={styles.metric}>
      <Text variant="h2">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.lg }} wrap>
        <View style={{ gap: 4 }}>
          <Text variant="overline">Hyderabad Rishta</Text>
          <Text variant="h1">Admin dashboard</Text>
          <Badge label={isMaster ? 'Master admin' : 'Sub-admin'} tone={isMaster ? 'gold' : 'emerald'} />
        </View>
        <Button
          label="Log out"
          kind="secondary"
          size="sm"
          onPress={async () => {
            await backend.logout();
            qc.clear();
            setUser(null);
            router.replace('/');
          }}
        />
      </Row>

      {sec?.pendingRecovery ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="danger" icon="shield">
            <Text variant="bodyStrong" color={colors.danger}>
              Master recovery in progress
            </Text>
            <Text variant="caption" color={colors.danger}>
              Someone used a recovery code for {sec.pendingRecovery.phoneMasked}. The master role moves to that phone on {formatDate(sec.pendingRecovery.completesAt)} unless the master cancels it.
            </Text>
            <Button label="Review in Team & security" size="sm" kind="danger" onPress={() => router.push('/admin/team')} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
          </Banner>
        </View>
      ) : isMaster && sec && (sec.codesRemaining === 0 || !sec.backupPhoneMasked) ? (
        <View style={{ marginTop: space.md }}>
          <Banner tone="warning" icon="shield">
            <Text variant="caption" color={colors.goldDeep}>
              Protect the master account: {sec.codesRemaining === 0 ? 'generate recovery codes' : ''}
              {sec.codesRemaining === 0 && !sec.backupPhoneMasked ? ' and ' : ''}
              {!sec.backupPhoneMasked ? 'add a backup phone' : ''}. Without these, a lost phone means a slow manual recovery.
            </Text>
            <Button label="Set up recovery" size="sm" kind="secondary" onPress={() => router.push('/admin/team')} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
          </Banner>
        </View>
      ) : null}

      <Section title="Publishing">
        <Card style={{ gap: space.md }}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: !!s?.requireApproval }}
            accessibilityLabel="Require manual approval before profiles are published"
            onPress={() => s && toggleApproval(!s.requireApproval)}
            style={styles.toggle}
            testID="approval-toggle"
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3">Manual approval</Text>
              <Text variant="caption">
                {s?.requireApproval
                  ? 'ON — every new profile waits for an admin to approve it.'
                  : 'OFF — profiles are published directly when members submit them.'}
              </Text>
            </View>
            <Switch
              value={!!s?.requireApproval}
              onValueChange={toggleApproval}
              trackColor={{ true: colors.emeraldSoft, false: colors.border }}
              thumbColor={colors.white}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </Pressable>
          {s && s.profiles.pending > 0 ? (
            <Row style={{ justifyContent: 'space-between' }} wrap>
              <Text variant="label">{s.profiles.pending} profile(s) waiting for approval</Text>
              <Row gap={space.sm}>
                <Button label="Review" size="sm" kind="secondary" onPress={() => router.push('/admin/profiles')} />
                <Button label="Approve all" size="sm" onPress={approveAll} testID="approve-all" />
              </Row>
            </Row>
          ) : null}
        </Card>
      </Section>

      <Section title="Overview">
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : s ? (
          <View style={styles.grid}>
            {metric('Users (active)', `${s.users} (${s.activeUsers})`)}
            {metric('Published', s.profiles.published)}
            {metric('Pending review', s.profiles.pending)}
            {metric('Paused', s.profiles.paused)}
            {metric('Brides / grooms', `${s.brides} / ${s.grooms}`)}
            {metric('Open reports', s.openReports)}
            {metric('Requests (accepted)', `${s.requests} (${s.acceptedRequests})`)}
            {metric('In trash', s.trash)}
            {metric('Revenue', formatMoney(s.revenue))}
            {metric('Simulated revenue', formatMoney(s.simulatedRevenue))}
          </View>
        ) : null}
      </Section>

      {s ? (
        <Section title="Connections">
          <View style={styles.grid}>
            {metric('Interests sent', s.connections.interests)}
            {metric('Accepted', `${s.connections.accepted} (${Math.round(s.connections.acceptanceRate * 100)}%)`)}
            {metric('Numbers shared', `${s.connections.phoneShared} (${Math.round(s.connections.sharingRate * 100)}% of accepted)`)}
            {metric('Median response', s.connections.medianResponseHours != null ? `${s.connections.medianResponseHours} h` : '—')}
            {metric('Reminders → answered', `${s.connections.pokedThenAnswered}/${s.connections.pokes}`)}
            {metric('Declined / expired / blocked', `${s.connections.declined} / ${s.connections.expired} / ${s.connections.blocked}`)}
          </View>
          <Text variant="caption">Phone numbers are never shown to admins or stored in analytics. Sharing actions are in the audit log.</Text>
        </Section>
      ) : null}

      <Section title="Manage">
        <View style={{ gap: space.sm }}>
          {NAV.map((n) => (
            <Pressable key={n.label} onPress={() => router.push(n.href)} accessibilityRole="button" accessibilityLabel={n.label}>
              <Card style={styles.nav}>
                <View style={styles.navIcon}>
                  <Icon name={n.icon} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{n.label}</Text>
                  <Text variant="caption">{n.desc}</Text>
                </View>
                <Icon name="chevronRight" size={18} color={colors.muted} />
              </Card>
            </Pressable>
          ))}
        </View>
      </Section>
      <View style={{ marginTop: space.lg }}>
        <Banner icon="shield">Every action here is authorised on the server and written to the audit log. The audit log and payment records can never be deleted.</Banner>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: { flexGrow: 1, flexBasis: '30%', minWidth: 140, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  navIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
});
