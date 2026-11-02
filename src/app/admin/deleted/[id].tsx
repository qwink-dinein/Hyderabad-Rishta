import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ProfileDetails } from '@/components/ProfileDetails';
import { Badge, Banner, ErrorView, Loading } from '@/components/ui/feedback';
import { Card, Header, Row, Screen, Section } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatDate } from '@/domain/format';
import { FULL_ACCESS, projectProfile } from '@/domain/privacy';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { space } from '@/theme/tokens';

/** One deleted account: who, when, and the full profile as it was (read-only; kept 30 days). */
export default function AdminDeletedAccount() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, isLoading, error, refetch } = useQuery({ queryKey: qk.admin('deleted', id), queryFn: () => backend.adminGetDeletedAccount(id) });
  if (isLoading) return <Loading />;
  if (error || !d)
    return (
      <Screen header={<Header title="Deleted account" />}>
        <ErrorView error={error} onRetry={refetch} />
      </Screen>
    );
  return (
    <Screen header={<Header title={d.code ?? 'Deleted account'} />}>
      <Card style={{ gap: space.sm, marginTop: space.lg }}>
        <Text variant="overline">Deleted their own account</Text>
        <Text variant="h2">{d.fullName ?? 'No biodata'}</Text>
        <Text variant="caption">
          {[d.code, d.profileType, d.phoneMasked, d.joinedAt ? `joined ${formatDate(d.joinedAt, 'en')}` : null].filter(Boolean).join(' · ')}
        </Text>
        <Row gap={space.xs} wrap>
          <Badge label={`deleted ${formatDate(d.deletedAt, 'en')}`} tone="danger" />
          {d.profileStatus ? <Badge label={`was ${d.profileStatus}`} tone="muted" /> : null}
          <Badge label={`erased on ${formatDate(d.purgeAt, 'en')}`} tone="gold" />
        </Row>
      </Card>
      <View style={{ marginTop: space.md }}>
        <Banner icon="lock">{`Read-only copy for safety checks. It cannot be restored, and it is erased automatically with the photos on ${formatDate(d.purgeAt, 'en')}.`}</Banner>
      </View>
      {d.profile ? (
        <Section title="Full profile">
          <ProfileDetails profile={projectProfile(d.profile, FULL_ACCESS)} />
        </Section>
      ) : (
        <View style={{ marginTop: space.md }}>
          <Text variant="body">This member had not started a biodata.</Text>
        </View>
      )}
    </Screen>
  );
}
