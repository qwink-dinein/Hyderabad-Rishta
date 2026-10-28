import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ProfileCard } from '@/components/ProfileCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { Header } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import type { PublicProfile } from '@/domain/types';
import { useShortlist, useToggleShortlist } from '@/hooks/queries';
import { useSession } from '@/state/session';
import { colors, maxContentWidth, space } from '@/theme/tokens';

/** Saved profiles. Opened from Discover's heart button and Home (no longer a tab: Boost took its place). */
export default function ShortlistScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch, isRefetching } = useShortlist();
  const toggle = useToggleShortlist();
  const onOpen = useCallback((id: string) => router.push(`/profile/${id}`), []);
  const onToggle = useCallback((id: string) => toggle.mutate(id), [toggle]);
  const user = useSession((s) => s.user);
  if (!user) return <Redirect href="/login" />;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header title={t('shortlist.title')} />
      {data?.length ? (
        <Text variant="caption" center style={{ marginTop: space.xs }} testID="shortlist-count">
          {t('shortlist.count', { count: data.length })}
        </Text>
      ) : null}
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorView error={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.column, { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xxxl + insets.bottom, gap: space.lg }]}
          renderItem={({ item }: { item: PublicProfile }) => <ProfileCard profile={item} shortlisted onToggleShortlist={onToggle} onOpen={onOpen} />}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={<EmptyState icon="heart" title={t('shortlist.empty')} body={t('shortlist.emptyHint')} action={<Button label={t('shortlist.browse')} size="sm" onPress={() => router.push('/discover')} />} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' },
});
