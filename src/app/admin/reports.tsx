import { CodeLink } from '@/components/admin/CodeLink';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, confirm, EmptyState, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

export default function AdminReports() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data, isLoading } = useQuery({ queryKey: qk.admin('reports'), queryFn: () => backend.adminListReports() });
  const resolve = async (id: string, status: 'resolved' | 'dismissed', pause?: boolean) => {
    try {
      await backend.adminResolveReport(id, status, pause);
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) {
      toast(errMsg(e), 'danger');
    }
  };
  return (
    <Screen header={<Header title="Reports & safety" />}>
      <View style={{ gap: space.md, paddingTop: space.lg }}>
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState icon="shield" title="No reports" body="Reports submitted by members appear here." />
        ) : (
          data.map((r) => (
            <Card key={r.id} style={{ gap: space.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row gap={space.sm} wrap>
                  <CodeLink code={r.profileCode} userId={r.profileUserId} />
                  <Text variant="h3">{r.profileName}</Text>
                </Row>
                <Badge label={r.status} tone={r.status === 'open' ? 'danger' : 'muted'} />
              </Row>
              <Text variant="label">Reason: {r.reason}</Text>
              {r.details ? <Text variant="body">{r.details}</Text> : null}
              <Text variant="caption">Reported {formatDate(r.createdAt, 'en')}</Text>
              {r.status === 'open' ? (
                <Row gap={space.sm} wrap>
                  <Button label="Resolve & pause profile" size="sm" kind="danger" onPress={() => resolve(r.id, 'resolved', true)} />
                  <Button label="Resolve" size="sm" onPress={() => resolve(r.id, 'resolved')} />
                  <Button label="Dismiss" size="sm" kind="ghost" onPress={() => resolve(r.id, 'dismissed')} />
                </Row>
              ) : null}
              <Button
                label="Delete report"
                size="sm"
                kind="ghost"
                style={{ alignSelf: 'flex-start' }}
                onPress={async () => {
                  if (!(await confirm({ title: 'Delete this report?', confirmLabel: 'Delete', danger: true }))) return;
                  try {
                    await backend.adminDeleteReport(r.id);
                    qc.invalidateQueries({ queryKey: ['admin'] });
                  } catch (e) {
                    toast(errMsg(e), 'danger');
                  }
                }}
              />
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
