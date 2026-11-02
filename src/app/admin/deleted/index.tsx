import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Banner, EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

/**
 * Members who permanently deleted their own account (owner decision 2026-11-02): who it was, and the full
 * profile for 30 days, then erased automatically with the photos. Any admin can view; opening one is logged.
 */
export default function AdminDeletedAccounts() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: qk.admin('deleted'), queryFn: () => backend.adminListDeletedAccounts() });
  return (
    <Screen header={<Header title="Deleted accounts" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Banner icon="shield">Members who deleted their own account. A copy of the profile is kept for 30 days for safety checks, then erased automatically with the photos. Opening one is written to the audit log.</Banner>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : !data?.length ? (
          <EmptyState icon="check" title="No deleted accounts in the last 30 days" />
        ) : (
          data.map((d) => (
            <Pressable key={d.id} onPress={() => router.push({ pathname: '/admin/deleted/[id]', params: { id: d.id } })} accessibilityRole="button" accessibilityLabel={`${d.fullName ?? d.code ?? 'Deleted account'}, deleted ${formatDate(d.deletedAt, 'en')}`} testID={`deleted-${d.id}`}>
              <Card style={{ gap: 4 }}>
                <Row style={{ justifyContent: 'space-between' }} wrap>
                  <Text variant="label">{[d.fullName ?? 'No biodata', d.code].filter(Boolean).join(' · ')}</Text>
                  {d.profileType ? <Badge label={d.profileType} tone="muted" /> : null}
                </Row>
                <Text variant="caption">
                  {[d.phoneMasked, `deleted ${formatDate(d.deletedAt, 'en')}`, `erased on ${formatDate(d.purgeAt, 'en')}`].filter(Boolean).join(' · ')}
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}
