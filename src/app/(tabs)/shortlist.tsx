import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ProfileCard } from '@/components/ProfileCard';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { Text } from '@/components/ui/Text';
import type { PublicProfile } from '@/domain/types';
import { useShortlist, useToggleShortlist } from '@/hooks/queries';
import { colors, maxContentWidth, space } from '@/theme/tokens';

export default function ShortlistScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch, isRefetching } = useShortlist();
  const toggle = useToggleShortlist();
  const onOpen = useCallback((id: string) => router.push(`/profile/${id}`), []);
  const onToggle = useCallback((id: string) => toggle.mutate(id), [toggle]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.column}>
        <Text variant="h1" style={{ padding: space.lg }} accessibilityRole="header">
          {t('shortlist.title')}
        </Text>
      </View>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorView error={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.column, { paddingHorizontal: space.lg, paddingBottom: space.xxxl, gap: space.lg }]}
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
