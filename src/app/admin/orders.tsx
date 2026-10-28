import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, confirm, EmptyState, Loading, useErrorMessage, useToast } from '@/components/ui/feedback';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate, formatMoney } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

export default function AdminOrders() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.show);
  const errMsg = useErrorMessage();
  const { data, isLoading } = useQuery({ queryKey: qk.admin('orders'), queryFn: () => backend.adminListOrders() });
  return (
    <Screen header={<Header title="Orders & payments" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Banner tone="warning">Simulated orders are never counted as real revenue. Orders are financial records: pending ones can be cancelled, none can be deleted.</Banner>
        {isLoading ? (
          <Loading />
        ) : !data?.length ? (
          <EmptyState title="No orders yet" />
        ) : (
          data.map((o) => (
            <Card key={o.id} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="label">
                  {o.kind} · {o.amount ? formatMoney(o.amount, o.currency) : 'Free'}
                </Text>
                <Row gap={space.xs}>
                  {o.simulated ? <Badge label="simulated" tone="gold" /> : null}
                  <Badge label={o.status} tone={o.status === 'paid' || o.status === 'free' ? 'success' : o.status === 'failed' ? 'danger' : 'muted'} />
                </Row>
              </Row>
              <Text variant="caption">
                {formatDate(o.createdAt)} · profile {o.profileId} · pricing v{o.terms.pricingVersion}
                {o.terms.boostDays ? ` · ${o.terms.boostDays} days` : ''} · auto-renew: no
              </Text>
              {o.status === 'pending' ? (
                <Button
                  label="Cancel order"
                  size="sm"
                  kind="ghost"
                  style={{ alignSelf: 'flex-start' }}
                  onPress={async () => {
                    if (!(await confirm({ title: 'Cancel this pending order?', confirmLabel: 'Cancel order', danger: true }))) return;
                    try {
                      await backend.adminCancelOrder(o.id);
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
