import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

export default function AdminUsers() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data, isLoading } = useQuery({ queryKey: qk.admin('users'), queryFn: () => backend.adminListUsers() });
  return (
    <Screen header={<Header title="Users" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Text variant="caption">Phone numbers are masked even for admins.</Text>
        {isLoading ? (
          <Loading />
        ) : (
          data?.map((u) => (
            <Card key={u.id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <Text variant="label">
                  {u.countryCode} {u.phone}
                </Text>
                <Row gap={space.xs}>
                  {u.role === 'admin' ? <Badge label="admin" tone="emerald" /> : null}
                  {u.profileStatus ? <Badge label={u.profileStatus} tone="muted" /> : <Badge label="no profile" tone="muted" />}
                  {u.deactivatedAt ? <Badge label="deactivated" tone="danger" /> : null}
                </Row>
              </Row>
              <Text variant="caption">
                Joined {formatDate(u.createdAt)} · language {u.language}
              </Text>
              {u.role !== 'admin' ? (
                <Button
                  label={u.deactivatedAt ? 'Reactivate' : 'Deactivate'}
                  size="sm"
                  kind={u.deactivatedAt ? 'secondary' : 'danger'}
                  style={{ alignSelf: 'flex-start' }}
                  onPress={async () => {
                    try {
                      await backend.adminSetUserDeactivated(u.id, !u.deactivatedAt);
                      qc.invalidateQueries({ queryKey: ['admin'] });
                    } catch (e) {
                      toast(errMsg(e), 'danger');
                    }
                  }}
                />
              ) : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
