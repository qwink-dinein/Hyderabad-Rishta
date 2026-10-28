import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, confirm, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';

/**
 * Account management. Rules (enforced on the server, mirrored here):
 * nobody can act on the master; only the master can act on sub-admins; no one can act on themselves.
 */
export default function AdminUsers() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const me = useSession((s) => s.user);
  const { data, isLoading } = useQuery({ queryKey: qk.admin('users'), queryFn: () => backend.adminListUsers() });
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      qc.invalidateQueries({ queryKey: ['admin'] });
      toast(msg);
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };

  return (
    <Screen header={<Header title="Users" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Text variant="caption">Phone numbers are masked even for admins. Suspended members cannot log back in until reactivated.</Text>
        {isLoading ? (
          <Loading />
        ) : (
          data?.map((u) => {
            const canManage = u.id !== me?.id && u.role !== 'master' && (u.role === 'user' || me?.role === 'master');
            return (
              <Card key={u.id} style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <Text variant="label">
                    {u.countryCode} {u.phone}
                    {u.id === me?.id ? ' (you)' : ''}
                  </Text>
                  <Row gap={space.xs} wrap>
                    {u.role === 'master' ? <Badge label="master" tone="gold" /> : u.role === 'admin' ? <Badge label="sub-admin" tone="emerald" /> : null}
                    {u.profileStatus ? <Badge label={u.profileStatus} tone="muted" /> : <Badge label="no profile" tone="muted" />}
                    {u.deactivatedAt ? <Badge label={u.deactivatedBy === u.id ? 'deactivated by member' : 'suspended'} tone="danger" /> : null}
                  </Row>
                </Row>
                <Text variant="caption">
                  Joined {formatDate(u.createdAt)} · language {u.language}
                </Text>
                {canManage ? (
                  <Row gap={space.sm} wrap style={{ marginTop: space.xs }}>
                    <Button
                      label={u.deactivatedAt ? 'Reactivate' : 'Suspend'}
                      size="sm"
                      kind="secondary"
                      onPress={() => run(() => backend.adminSetUserDeactivated(u.id, !u.deactivatedAt), u.deactivatedAt ? 'Account reactivated.' : 'Account suspended.')}
                    />
                    <Button
                      label="Delete account"
                      size="sm"
                      kind="danger"
                      onPress={async () => {
                        const ok = await confirm({
                          title: 'Delete this account?',
                          body: 'The member is signed out and their profile disappears immediately. It moves to Trash; the master admin can restore it within 30 days, after which it is erased.',
                          confirmLabel: 'Delete',
                          danger: true,
                        });
                        if (ok) run(() => backend.adminDeleteUser(u.id, 'Removed by admin'), 'Account moved to Trash.');
                      }}
                    />
                  </Row>
                ) : null}
              </Card>
            );
          })
        )}
      </View>
    </Screen>
  );
}
