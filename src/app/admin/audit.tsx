import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Loading } from '@/components/ui/feedback';
import { Card, Header, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

export default function AdminAudit() {
  const { data, isLoading } = useQuery({ queryKey: qk.admin('audit'), queryFn: () => backend.adminAuditLog() });
  return (
    <Screen header={<Header title="Audit log" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState icon="shield" title="No audited actions yet" />
        ) : (
          data.map((e) => (
            <Card key={e.id} style={{ gap: 2 }}>
              <Text variant="label">{e.action}</Text>
              <Text variant="caption">
                {new Date(e.at).toLocaleString('en-GB')} · actor {e.actorId}
                {e.target ? ` · target ${e.targetLabel ?? e.target}` : ''}
              </Text>
              {e.meta ? <Text variant="caption">{JSON.stringify(e.meta)}</Text> : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
