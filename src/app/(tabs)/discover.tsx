import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ProfileCard, ProfileCardSkeleton } from '@/components/ProfileCard';
import { ShortlistButton, TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/Button';
import { Banner, EmptyState, ErrorView, Loading } from '@/components/ui/feedback';
import { ChipGroup } from '@/components/ui/forms';
import { Icon } from '@/components/ui/Icon';
import { Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { formatHeight } from '@/domain/format';
import { activeFilterCount, EMPTY_FILTERS, filtersFromPreferences, type SearchFilters } from '@/domain/search';
import type { PublicProfile } from '@/domain/types';
import { useFeatured, useMyProfile, useSearch, useShortlistIds, useToggleShortlist } from '@/hooks/queries';
import { useOptions } from '@/hooks/useOptions';
import { backendInfo } from '@/services';
import { useFilters } from '@/state/filters';
import { useSession } from '@/state/session';
import { isRTL } from '@/i18n';
import { fontFamily } from '@/theme/fonts';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Chip = { key: string; label: string; remove: () => void };

/** Discovery list with removable filter chips, counts and incremental loading (PRD §9). */
export default function Discover() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { filters, setFilters, patch } = useFilters();
  const { data: me } = useMyProfile();
  const search = useSearch(filters);
  const featured = useFeatured();
  const { data: shortIds } = useShortlistIds();
  const toggle = useToggleShortlist();
  const { label } = useOptions();
  const shortSet = useMemo(() => new Set(shortIds ?? []), [shortIds]);
  const lang = useSession((s) => s.lang);
  const [q, setQ] = useState(filters.keyword ?? '');
  const [syncedKw, setSyncedKw] = useState(filters.keyword);
  if (syncedKw !== filters.keyword) {
    // keyword changed elsewhere (chip removed, Home search) → reflect it in the box
    setSyncedKw(filters.keyword);
    setQ(filters.keyword ?? '');
  }

  const items = useMemo(() => search.data?.pages.flatMap((p) => p.items) ?? [], [search.data]);
  const total = search.data?.pages[0]?.total ?? 0;
  const columns = width >= 900 ? 2 : 1;

  const chips = useMemo<Chip[]>(() => {
    const out: Chip[] = [];
    const arr = (k: keyof SearchFilters, g?: Parameters<typeof label>[0]) =>
      (filters[k] as string[]).forEach((v) =>
        out.push({ key: `${k}:${v}`, label: g ? label(g, v) ?? v : v, remove: () => patch({ [k]: (filters[k] as string[]).filter((x) => x !== v) } as Partial<SearchFilters>) }),
      );
    if (filters.ageMin != null || filters.ageMax != null)
      out.push({ key: 'age', label: `${t('filters.ageRange')}: ${filters.ageMin ?? '…'}–${filters.ageMax ?? '…'}`, remove: () => patch({ ageMin: undefined, ageMax: undefined }) });
    if (filters.heightMin != null || filters.heightMax != null)
      out.push({
        key: 'height',
        label: `${filters.heightMin ? formatHeight(filters.heightMin, false) : '…'}–${filters.heightMax ? formatHeight(filters.heightMax, false) : '…'}`,
        remove: () => patch({ heightMin: undefined, heightMax: undefined }),
      });
    arr('maritalStatus', 'marital');
    arr('countries');
    arr('states');
    arr('districts');
    arr('cities');
    arr('motherTongues', 'tongue');
    arr('education', 'education');
    arr('profession', 'profession');
    arr('employmentType', 'employment');
    arr('maslak', 'maslak');
    arr('subMaslak', 'subMaslak');
    arr('familyType', 'familyType');
    arr('familyValues', 'familyValues');
    arr('relocation', 'relocate');
    if (filters.incomeMin) out.push({ key: 'income', label: `≥ ${label('income', filters.incomeMin)}`, remove: () => patch({ incomeMin: undefined }) });
    if (filters.keyword) out.push({ key: 'kw', label: `“${filters.keyword}”`, remove: () => patch({ keyword: undefined }) });
    if (filters.locality) out.push({ key: 'loc', label: filters.locality, remove: () => patch({ locality: undefined }) });
    if (filters.boostedOnly) out.push({ key: 'boost', label: t('filters.boostedOnly'), remove: () => patch({ boostedOnly: false }) });
    if (filters.recentDays) out.push({ key: 'recent', label: t('filters.recent'), remove: () => patch({ recentDays: undefined }) });
    if (filters.shortlistedOnly) out.push({ key: 'sl', label: t('filters.shortlistedOnly'), remove: () => patch({ shortlistedOnly: false }) });
    return out;
  }, [filters, label, patch, t]);

  const onOpen = useCallback((id: string) => router.push(`/profile/${id}`), []);
  const onToggle = useCallback((id: string) => toggle.mutate(id), [toggle]);
  const renderItem = useCallback(
    ({ item }: { item: PublicProfile }) => (
      <View style={{ flex: 1 / columns, padding: space.sm }}>
        <ProfileCard profile={item} shortlisted={shortSet.has(item.id)} onToggleShortlist={onToggle} onOpen={onOpen} />
      </View>
    ),
    [columns, shortSet, onToggle, onOpen],
  );

  const header = (
    <View style={{ paddingHorizontal: space.sm, gap: space.md, paddingBottom: space.sm }}>
      <Row gap={space.sm}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => patch({ keyword: q.trim() || undefined })}
            returnKeyType="search"
            placeholder={t('home.searchPlaceholder')}
            placeholderTextColor={colors.muted}
            accessibilityLabel={t('common.search')}
            style={[styles.searchInput, { fontFamily: fontFamily(lang, 'body'), textAlign: isRTL(lang) ? 'right' : 'left' }]}
            testID="discover-search"
          />
          {q ? (
            <Pressable
              onPress={() => {
                setQ('');
                patch({ keyword: undefined });
              }}
              accessibilityRole="button"
              accessibilityLabel={t('common.clearAll')}
              hitSlop={8}
            >
              <Icon name="close" size={16} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        {/* Same filter button as Home, right next to the search box. */}
        <Pressable
          onPress={() => router.push('/filters')}
          accessibilityRole="button"
          accessibilityLabel={activeFilterCount(filters) ? `${t('discover.filters')} (${activeFilterCount(filters)})` : t('discover.filters')}
          style={styles.filterBtn}
          testID="discover-filter-btn"
        >
          <Icon name="filter" size={20} color={colors.white} />
          {activeFilterCount(filters) ? (
            <View style={styles.filterCount}>
              <Text variant="caption" color={colors.emerald} style={{ fontSize: 11, lineHeight: 14 }}>
                {activeFilterCount(filters)}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Row>
      {backendInfo.kind === 'demo' ? <Banner tone="warning" icon="sparkle">{t('discover.demoData')}</Banner> : null}
      {featured.data?.length ? (
        // Shown to every eligible member whatever their filters or sort (paid placement, clearly labelled).
        <View style={{ gap: space.sm }} testID="featured-strip">
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="h3">★ {t('discover.featuredTitle')}</Text>
            <Text variant="caption">{t('discover.featuredLabel')}</Text>
          </Row>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingBottom: space.xs }}>
            {featured.data.map((p) => (
              <ProfileCard key={p.id} profile={p} variant="featured" shortlisted={shortSet.has(p.id)} onToggleShortlist={onToggle} onOpen={onOpen} />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {me?.status !== 'published' ? (
        <Banner icon="user">
          <Text variant="caption" color={colors.emerald}>
            {t('discover.needProfile')}
          </Text>
          <Button label={t('discover.completeBiodata')} size="sm" kind="secondary" onPress={() => router.push(me ? '/dashboard' : '/biodata')} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
        </Banner>
      ) : null}
      <Row gap={space.sm} wrap>
        <Button
          label={`${t('discover.filters')}${activeFilterCount(filters) ? ` (${activeFilterCount(filters)})` : ''}`}
          size="sm"
          icon={<Icon name="filter" size={16} color={colors.white} />}
          onPress={() => router.push('/filters')}
          testID="open-filters"
        />
        {me ? (
          <Button
            label={t('discover.usePrefs')}
            size="sm"
            kind="secondary"
            onPress={() => setFilters({ ...filtersFromPreferences(me.biodata.preferences), sort: filters.sort })}
          />
        ) : null}
      </Row>
      <ChipGroup
        options={[
          { value: 'recommended', label: t('discover.sortRecommended') },
          { value: 'recent', label: t('discover.sortRecent') },
        ]}
        value={filters.sort}
        onChange={(v) => v && patch({ sort: v })}
      />
      {chips.length ? (
        <View style={styles.chips}>
          {chips.map((c) => (
            <Pressable key={c.key} onPress={c.remove} accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${c.label}`} style={styles.chip}>
              <Text variant="caption" color={colors.emerald}>
                {c.label}
              </Text>
              <Icon name="close" size={12} />
            </Pressable>
          ))}
          <Pressable onPress={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} accessibilityRole="button" style={[styles.chip, { borderColor: 'transparent' }]}>
            <Text variant="caption" color={colors.danger}>
              {t('common.clearAll')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {search.data ? (
        <Text variant="label" color={colors.muted} accessibilityLiveRegion="polite">
          {t('discover.count', { count: total })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TabHeader title={t('discover.title')} settings right={<ShortlistButton />} />
      {search.isLoading ? (
        <View style={styles.column}>
          {header}
          <View style={{ padding: space.sm, gap: space.lg }}>
            <ProfileCardSkeleton />
            <ProfileCardSkeleton />
          </View>
        </View>
      ) : search.isError ? (
        <View style={styles.column}>
          {header}
          <ErrorView error={search.error} onRetry={() => search.refetch()} />
        </View>
      ) : (
        <FlatList
          key={columns}
          data={items}
          numColumns={columns}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.column, { padding: space.sm, paddingBottom: space.xxxl }]}
          onEndReached={() => search.hasNextPage && !search.isFetchingNextPage && search.fetchNextPage()}
          onEndReachedThreshold={0.6}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={search.isRefetching && !search.isFetchingNextPage} onRefresh={() => void search.refetch()} tintColor={colors.emerald} />}
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title={t('discover.empty')}
              body={t('discover.emptyHint')}
              action={chips.length ? <Button label={t('discover.clearFilters')} kind="secondary" size="sm" onPress={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} /> : undefined}
            />
          }
          ListFooterComponent={
            items.length ? (
              search.isFetchingNextPage ? (
                <Loading />
              ) : !search.hasNextPage ? (
                <View style={{ padding: space.xl, gap: space.xs }}>
                  <Text variant="caption" center>
                    {t('discover.endOfList')}
                  </Text>
                  <Text variant="caption" center>
                    {t('discover.boostedNote')}
                  </Text>
                </View>
              ) : undefined
            ) : undefined
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth + 280, alignSelf: 'center' },
  filterBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  filterCount: { position: 'absolute', top: -5, right: -5, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.gold, borderWidth: 2, borderColor: colors.ivory, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 16, color: colors.charcoal, paddingVertical: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.sage,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
