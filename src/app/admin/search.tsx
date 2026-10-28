import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { TextField } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Card, Header, Row, Screen } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { qk } from '@/hooks/queries';
import { backend } from '@/services';
import { colors, space } from '@/theme/tokens';

/**
 * Find any member by profile ID (HR-10023), name, city or phone digits. Runs on submit (not per
 * keystroke) because phone look-ups are written to the audit log.
 */
export default function AdminSearch() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const { data, isFetching, error, refetch } = useQuery({ queryKey: qk.admin('search', q), queryFn: () => backend.adminSearch(q), enabled: q.trim().length >= 2 });
  const submit = () => setQ(text.trim());

  return (
    <Screen header={<Header title="Find a member" />}>
      <View style={{ gap: space.sm, paddingTop: space.lg }}>
        <Row gap={space.sm}>
          <View style={{ flex: 1 }}>
            <TextField
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              returnKeyType="search"
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="HR-10023, name, city or phone"
              accessibilityLabel="Search members"
              testID="admin-search-input"
            />
          </View>
          <Button label="Search" onPress={submit} testID="admin-search-go" />
        </Row>
        <Text variant="caption">Phone searches are recorded in the audit log. Numbers are always shown masked.</Text>
      </View>
      <View style={{ gap: space.sm, marginTop: space.lg }}>
        {q.length < 2 ? null : isFetching ? (
          <Loading />
        ) : error ? (
          <ErrorView error={error} onRetry={refetch} />
        ) : !data?.length ? (
          <EmptyState icon="search" title="No members found" body="Check the profile ID, or try part of the name or the last 4 digits of the phone." />
        ) : (
          data.map((m) => (
            <Pressable key={m.userId} accessibilityRole="button" accessibilityLabel={`Open ${m.code ?? ''} ${m.name ?? m.phoneMasked}`} onPress={() => router.push(`/admin/member/${m.userId}`)} testID={`result-${m.code ?? m.userId}`}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Row gap={space.sm} wrap>
                    <Text variant="label" color={colors.emerald}>
                      {m.code ?? 'No profile'}
                    </Text>
                    <Text variant="h3">{m.name ?? '—'}</Text>
                  </Row>
                  <Text variant="caption">
                    {[m.city, m.phoneMasked].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Row gap={space.xs} wrap>
                  {m.role !== 'user' ? <Badge label={m.role === 'master' ? 'master' : 'sub-admin'} tone="gold" /> : null}
                  {m.deactivatedAt ? <Badge label="suspended" tone="danger" /> : null}
                  {m.profileStatus ? <Badge label={m.profileStatus} tone={m.profileStatus === 'published' ? 'success' : 'muted'} /> : null}
                </Row>
                <Icon name="chevronRight" size={18} color={colors.muted} />
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}
