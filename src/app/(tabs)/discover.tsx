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
import type { FeedView } from '@/domain/feed';
import type { PublicProfile } from '@/domain/types';
import { useFeatured, useMyProfile, useShortlistIds, useToggleShortlist } from '@/hooks/queries';
import { useDiscoverFeed, useImpressions } from '@/hooks/useDiscoverFeed';
import { useOptions } from '@/hooks/useOptions';
import { backendInfo } from '@/services';
import { useFilters } from '@/state/filters';
import { useSession } from '@/state/session';
import { isRTL } from '@/i18n';
import { fontFamily } from '@/theme/fonts';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Chip = { key: string; label: string; remove: () => void };

/**
 * Discovery list with removable filter chips and incremental loading (PRD §9), on the persistent rotation
 * feed (owner Mini PRD 2026-10-31): continues past what was really seen, never moves loaded cards, offers the
 * profiles new since the last visit, and says so when everything has been seen.
 */
export default function Discover() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { filters, setFilters, patch } = useFilters();
  const { data: me } = useMyProfile();
  const [view, setView] = useState<FeedView>('all');
  const search = useDiscoverFeed(filters, view);
  const impressions = useImpressions();
  // Changing filters starts that filter set's own feed (and leaves the "new" list).
  const filtersSig = JSON.stringify(filters);
  const [viewSig, setViewSig] = useState(filtersSig);
  if (viewSig !== filtersSig) {
    setViewSig(filtersSig);
    setView('all');
  }
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

  const items = useMemo(() => {
    // Pages never repeat a profile; this guards against a retried request appending a page twice.
    const seen = new Set<string>();
    return (search.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => !seen.has(p.id) && !!seen.add(p.id));
  }, [search.data]);
  const firstPage = search.data?.pages[0];
  const toDiscover = (firstPage?.items.length ?? 0) + (firstPage?.remaining ?? 0);
  const newCount = view === 'all' ? firstPage?.newSinceLastVisit ?? 0 : 0;
  const noMatches = firstPage?.total === 0;
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
      <View style={{ flex: 1 / columns, padding: space.sm }} testID={`discover-card-${item.id}`}>
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
      {view === 'new' ? (
        <Banner icon="sparkle">
          <Text variant="caption" color={colors.emerald}>
            {t('discover.viewingNew')}
          </Text>
          <Button label={t('discover.backToAll')} size="sm" kind="secondary" onPress={() => setView('all')} style={{ alignSelf: 'flex-start', marginTop: space.sm }} testID="discover-back-all" />
        </Banner>
      ) : newCount ? (
        <Pressable onPress={() => setView('new')} accessibilityRole="button" style={styles.newChip} testID="discover-new-chip">
          <Icon name="sparkle" size={16} color={colors.emerald} />
          <Text variant="label" color={colors.emerald}>
            {t('discover.newSince', { count: newCount })}
          </Text>
          <Icon name={isRTL(lang) ? 'chevronLeft' : 'chevronRight'} size={16} color={colors.emerald} />
        </Pressable>
      ) : null}
      {search.data ? (
        <Row style={{ justifyContent: 'space-between' }} wrap>
          <Text variant="label" color={colors.muted} accessibilityLiveRegion="polite" testID="discover-count">
            {t('discover.toDiscover', { count: toDiscover })}
          </Text>
          <Button label={t('discover.refresh')} size="sm" kind="ghost" icon={<Icon name="refresh" size={16} color={colors.emerald} />} onPress={() => void search.refresh()} testID="discover-refresh" />
        </Row>
      ) : null}
    </View>
  );

  const caughtUp = (
    <View style={{ padding: space.xl, gap: space.sm, alignItems: 'center' }} testID="discover-caught-up">
      <Icon name="check" size={28} color={colors.emerald} />
      <Text variant="h3" center>
        {t('discover.caughtUpTitle')}
      </Text>
      <Text variant="caption" center>
        {t('discover.caughtUpBody')}
      </Text>
      <Button label={t('discover.refresh')} size="sm" kind="secondary" icon={<Icon name="refresh" size={16} color={colors.emerald} />} onPress={() => void search.refresh()} />
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
          onViewableItemsChanged={impressions.onViewableItemsChanged}
          viewabilityConfig={impressions.viewabilityConfig}
          refreshControl={<RefreshControl refreshing={search.isRefetching && !search.isFetchingNextPage} onRefresh={() => void search.refresh()} tintColor={colors.emerald} />}
          ListEmptyComponent={
            noMatches ? (
              <EmptyState
                icon="search"
                title={t('discover.empty')}
                body={t('discover.emptyHint')}
                action={chips.length ? <Button label={t('discover.clearFilters')} kind="secondary" size="sm" onPress={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} /> : undefined}
              />
            ) : (
              caughtUp
            )
          }
          ListFooterComponent={
            items.length ? (
              search.isFetchingNextPage ? (
                <Loading />
              ) : !search.hasNextPage ? (
                <View>
                  {caughtUp}
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
  newChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.sage,
    borderWidth: 1,
    borderColor: colors.emerald,
  },
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
