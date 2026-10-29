import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, confirm, EmptyState, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { useSession } from '@/state/session';
import { space } from '@/theme/tokens';

/** Soft-deleted users & profiles. Any admin can see; only the master restores or erases. */
export default function AdminTrash() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const isMaster = useSession((s) => s.user?.role === 'master');
  const { data, isLoading } = useQuery({ queryKey: qk.admin('trash'), queryFn: () => backend.adminListTrash() });
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
    <Screen header={<Header title="Trash" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Banner icon="shield">
          {isMaster
            ? 'Deleted items are kept for 30 days, then erased automatically. Restore puts them back exactly as they were.'
            : 'Deleted items are kept for 30 days. Only a master admin can restore or permanently erase them.'}
        </Banner>
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState icon="check" title="Trash is empty" />
        ) : (
          data.map((t) => (
            <Card key={`${t.kind}:${t.id}`} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }} wrap>
                <Text variant="label">{t.label}</Text>
                <Badge label={t.kind === 'user' ? 'account' : 'profile'} tone="muted" />
              </Row>
              <Text variant="caption">
                Deleted {formatDate(t.deletedAt, 'en')} by {t.deletedBy ?? '—'}
                {t.reason ? ` · ${t.reason}` : ''} · erased on {formatDate(t.purgeAt, 'en')}
              </Text>
              {isMaster ? (
                <Row gap={space.sm} style={{ marginTop: space.xs }}>
                  <Button label="Restore" size="sm" onPress={() => run(() => backend.masterRestore(t.kind, t.id), 'Restored.')} testID={`restore-${t.id}`} />
                  <Button
                    label="Erase now"
                    size="sm"
                    kind="danger"
                    onPress={async () => {
                      if (await confirm({ title: 'Erase permanently?', body: 'This cannot be undone. Payment records and the audit log are kept for legal reasons.', confirmLabel: 'Erase', danger: true }))
                        run(() => backend.masterPurge(t.kind, t.id), 'Erased permanently.');
                    }}
                  />
                </Row>
              ) : null}
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}
