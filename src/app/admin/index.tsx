import { Pressable, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Banner, ErrorView, Loading } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatMoney } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { colors, radius, space } from '@/theme/tokens';

const NAV: { href: Href; icon: IconName; label: string; desc: string }[] = [
  { href: '/admin/profiles', icon: 'user', label: 'Profile review', desc: 'Approve, reject, request corrections, pause' },
  { href: '/admin/pricing', icon: 'chart', label: 'Pricing & boosts', desc: 'Publication / boost fees, duration, approval mode' },
  { href: '/admin/announcements', icon: 'bell', label: 'Announcements', desc: 'Compose, schedule, publish, readership analytics' },
  { href: '/admin/reports', icon: 'flag', label: 'Reports & safety', desc: 'Moderate reported profiles' },
  { href: '/admin/users', icon: 'users', label: 'Users', desc: 'Deactivate / reactivate accounts' },
  { href: '/admin/orders', icon: 'star', label: 'Orders & payments', desc: 'Order status (simulated in demo)' },
  { href: '/admin/audit', icon: 'shield', label: 'Audit log', desc: 'Sensitive admin actions' },
];

export default function AdminHome() {
  const qc = useQueryClient();
  const setUser = useSession((s) => s.setUser);
  const { data: s, isLoading, error, refetch } = useQuery({ queryKey: qk.admin('stats'), queryFn: () => backend.adminStats() });

  const metric = (label: string, value: string | number) => (
    <View style={styles.metric}>
      <Text variant="h2">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', paddingTop: space.lg }} wrap>
        <View>
          <Text variant="overline">Hyderabad Rishta</Text>
          <Text variant="h1">Admin dashboard</Text>
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
      <View style={{ marginTop: space.md }}>
        <Banner tone="warning" icon="shield">
          Every action here is authorised on the backend and sensitive actions are written to the audit log.
        </Banner>
      </View>

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
            {metric('Drafts', s.profiles.draft)}
            {metric('Brides / grooms', `${s.brides} / ${s.grooms}`)}
            {metric('Open reports', s.openReports)}
            {metric('Requests (accepted)', `${s.requests} (${s.acceptedRequests})`)}
            {metric('Revenue', formatMoney(s.revenue))}
            {metric('Simulated revenue', formatMoney(s.simulatedRevenue))}
          </View>
        ) : null}
      </Section>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  metric: { flexGrow: 1, flexBasis: '30%', minWidth: 140, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  navIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
});
