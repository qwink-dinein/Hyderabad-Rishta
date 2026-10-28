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

export default function AdminRequests() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data, isLoading } = useQuery({ queryKey: qk.admin('requests'), queryFn: () => backend.adminListRequests() });
  return (
    <Screen header={<Header title="Contact requests" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Text variant="caption">Deleting a request also removes any contact sharing that was granted through it.</Text>
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState icon="mail" title="No requests yet" />
        ) : (
          data.map((r) => (
            <Card key={r.id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <Row gap={space.xs} wrap>
                  <CodeLink code={r.fromCode} userId={r.fromUserId} />
                  <Text variant="label">{r.fromName} →</Text>
                  <CodeLink code={r.toCode} userId={r.toUserId} />
                  <Text variant="label">{r.toName}</Text>
                </Row>
                <Badge label={r.status} tone={r.status === 'accepted' ? 'success' : r.status === 'pending' ? 'gold' : 'muted'} />
              </Row>
              {r.message ? <Text variant="body">“{r.message}”</Text> : null}
              <Text variant="caption">Sent {formatDate(r.createdAt)}</Text>
              <Button
                label="Delete request"
                size="sm"
                kind="danger"
                style={{ alignSelf: 'flex-start', marginTop: space.xs }}
                onPress={async () => {
                  if (!(await confirm({ title: 'Delete this request?', body: 'Both members lose it and any shared contact details. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
                  try {
                    await backend.adminDeleteRequest(r.id);
                    qc.invalidateQueries({ queryKey: ['admin'] });
                    toast('Request deleted.');
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
