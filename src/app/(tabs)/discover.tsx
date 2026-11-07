import { useCallback, useMemo, useState } from 'react';
import { BoostSellBanner } from '@/components/BoostSell';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileCard, ProfileCardSkeleton } from '@/components/ProfileCard';
import { ShortlistButton, TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/Button';
import { Banner, EmptyState, ErrorView, Loading, SlowNotice } from '@/components/ui/feedback';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { rotationApplies } from '@/domain/feed';
import { formatHeight } from '@/domain/format';
import { activeFilterCount, EMPTY_FILTERS, filtersFromPreferences, type SearchFilters } from '@/domain/search';
import type { PublicProfile } from '@/domain/types';
import { useDiscoverSections, useMyProfile, useShortlistIds, useToggleShortlist } from '@/hooks/queries';
import { useDiscoverFeed, useImpressions } from '@/hooks/useDiscoverFeed';
import { useOptions } from '@/hooks/useOptions';
import { isRTL } from '@/i18n';
import { backendInfo } from '@/services';
import { useFilters, type DiscoverTab } from '@/state/filters';
import { useSession } from '@/state/session';
import { fontFamily } from '@/theme/fonts';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';

type Chip = { key: string; label: string; remove: () => void };
const TABS: { key: DiscoverTab; icon: IconName }[] = [
  { key: 'featured', icon: 'sparkle' },
  { key: 'new', icon: 'star' },
  { key: 'recommended', icon: 'heart' },
  { key: 'all', icon: 'users' },
];

/**
 * Discover (Design PRD "Discover Screen & Premium Matrimonial Profile Cards", 2026-11-01).
 * Header (shortlist, filters, bell) → search → category tabs:
 *  - Featured: active boosts that match the filters (fair rotation + per-viewer cap, from getDiscoverSections);
 *  - New: published since the last visit and not seen yet (the persistent feed's "new" list);
 *  - Recommended: the persistent feed run on the member's partner preferences (its own browsing position);
 *  - All Profiles: the persistent rotation feed with the member's filters and sort.
 * The selected tab survives opening a profile (it lives in the filters store). Cards on screen for ≥ 1 s
 * count as seen (impressions), so the rotation keeps moving past them.
 */
export default function Discover() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { filters, setFilters, patch, tab: storedTab, setTab } = useFilters();
  const { data: me } = useMyProfile();
  const lang = useSession((s) => s.lang);
  const { label } = useOptions();
  const params = useLocalSearchParams<{ view?: string; at?: string }>();

  // Featured (sections) and the main feed always load: opening Discover is a "visit" for new-since tracking.
  const sections = useDiscoverSections(filters, rotationApplies(filters));
  const featuredItems = useMemo(() => sections.data?.featured ?? [], [sections.data]);
  // First visit: start on Featured when there is something to feature, otherwise on All Profiles.
  const tab: DiscoverTab | null = storedTab ?? (sections.isLoading ? null : featuredItems.length ? 'featured' : 'all');
  // Opened from Home's "New since your last visit → View all" (the tab may already be mounted).
  const [openedAt, setOpenedAt] = useState(params.at);
  if (openedAt !== params.at) {
    setOpenedAt(params.at);
    if (params.view === 'new') setTab('new');
  }

  const prefs = me?.biodata.preferences;
  const recFilters = useMemo<SearchFilters>(() => (prefs ? { ...filtersFromPreferences(prefs, filters.show), sort: 'recommended' } : filters), [prefs, filters]);
  const hasPrefs = !!prefs && activeFilterCount(filtersFromPreferences(prefs)) > 0;
  const all = useDiscoverFeed(filters, 'all');
  const fresh = useDiscoverFeed(filters, 'new', tab === 'new');
  const rec = useDiscoverFeed(recFilters, 'all', tab === 'recommended');
  const feed = tab === 'new' ? fresh : tab === 'recommended' ? rec : all;
  const onFeedTab = tab !== 'featured' && tab !== null;
  const impressions = useImpressions();

  const { data: shortIds } = useShortlistIds();
  const toggle = useToggleShortlist();
  const shortSet = useMemo(() => new Set(shortIds ?? []), [shortIds]);
  const [q, setQ] = useState(filters.keyword ?? '');
  const [syncedKw, setSyncedKw] = useState(filters.keyword);
  if (syncedKw !== filters.keyword) {
    // keyword changed elsewhere (chip removed, Home search) → reflect it in the box
    setSyncedKw(filters.keyword);
    setQ(filters.keyword ?? '');
  }
  const submitSearch = () => {
    const keyword = q.trim() || undefined;
    patch({ keyword });
    if (keyword) setTab('all'); // an explicit search shows plain results in All Profiles
  };

  const feedItems = useMemo(() => {
    // Pages never repeat a profile; this guards against a retried request appending a page twice.
    const seen = new Set<string>();
    return (feed.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => !seen.has(p.id) && !!seen.add(p.id));
  }, [feed.data]);
  const items = tab === 'featured' ? featuredItems : feedItems;
  const firstPage = feed.data?.pages[0];
  // People already in touch stay listed (labelled) but are not "to discover".
  const inTouch = (p: { relation?: { status?: string } }) => p.relation?.status === 'pending' || p.relation?.status === 'accepted';
  const toDiscover = (firstPage?.items.filter((p) => !inTouch(p)).length ?? 0) + (firstPage?.remaining ?? 0);
  // "New (n)": the main feed knows how many arrived since the last visit; the New list knows its own size.
  const freshFirst = fresh.data?.pages[0];
  const newCount = freshFirst ? freshFirst.items.length + freshFirst.remaining : all.data?.pages[0]?.newSinceLastVisit ?? 0;
  const noMatches = firstPage?.total === 0;
  const columns = width >= 900 ? 2 : 1;
  const filterCount = activeFilterCount(filters);

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

  // Option C (owner choice 2026-11-01): Filters leads the row right above the cards, followed by the active
  // filters as one-tap removable chips — reachable and visible, not a small icon in the top corner.
  const filterButton = (
    <Pressable
      onPress={() => router.push('/filters')}
      accessibilityRole="button"
      accessibilityLabel={filterCount ? `${t('discover.filters')} (${filterCount})` : t('discover.filters')}
      hitSlop={4}
      style={({ pressed }) => [styles.filterChip, pressed && { opacity: 0.85 }]}
      testID="discover-filter-btn"
    >
      <Icon name="sliders" size={18} color={colors.white} />
      <Text variant="label" color={colors.white}>
        {t('discover.filters')}
      </Text>
      {filterCount ? (
        <View style={styles.countPill}>
          <Text variant="caption" color={colors.forest} style={styles.badgeText}>
            {filterCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
  const sortLabel = filters.sort === 'recent' ? t('discover.sortRecent') : t('discover.sortRecommended');

  const header = (
    <View style={{ paddingHorizontal: space.sm, gap: space.md, paddingBottom: space.sm }}>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={submitSearch}
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist" accessibilityLabel={t('discover.tabsA11y')}>
        {TABS.map(({ key, icon }) => {
          const on = tab === key;
          const text = key === 'new' && newCount ? `${t('discover.tabNew')} (${newCount})` : t(`discover.tab${key === 'all' ? 'All' : key[0].toUpperCase() + key.slice(1)}`);
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              style={[styles.tab, on && styles.tabOn]}
              testID={`discover-tab-${key}`}
            >
              <Icon name={icon} size={16} color={on ? colors.white : colors.emerald} />
              <Text variant="label" color={on ? colors.white : colors.emerald}>
                {text}
              </Text>
              {key === 'new' && newCount && !on ? <View style={styles.tabDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {backendInfo.kind === 'demo' ? <Banner tone="warning" icon="sparkle">{t('discover.demoData')}</Banner> : null}
      {me?.status !== 'published' ? (
        <Banner icon="user">
          <Text variant="caption" color={colors.emerald}>
            {t('discover.needProfile')}
          </Text>
          <Button label={t('discover.completeBiodata')} size="sm" kind="secondary" onPress={() => router.push(me ? '/dashboard' : '/biodata')} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
        </Banner>
      ) : null}

      {tab === 'featured' ? (
        <Text variant="caption" testID="featured-strip-note">
          {t('discover.featuredHint')} {t('discover.boostedNote')}
        </Text>
      ) : null}
      {tab === 'recommended' ? (
        <Banner icon="heart">
          <Text variant="caption" color={colors.emerald}>
            {hasPrefs ? t('discover.recHint') : t('discover.recHintEmpty')}
          </Text>
          {!hasPrefs && me ? (
            <Button label={t('discover.recSetPrefs')} size="sm" kind="secondary" onPress={() => router.push({ pathname: '/biodata', params: { step: '5' } })} style={{ alignSelf: 'flex-start', marginTop: space.sm }} />
          ) : null}
        </Banner>
      ) : null}
      {/* Row 1: Filters + the active filters (tap ✕ to remove one). */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} testID="discover-filter-row">
        {filterButton}
        {tab !== 'recommended'
          ? chips.map((c) => (
              <Pressable key={c.key} onPress={c.remove} accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${c.label}`} style={styles.chip}>
                <Text variant="label" color={colors.emerald} numberOfLines={1}>
                  {c.label}
                </Text>
                <Icon name="close" size={14} color={colors.emerald} />
              </Pressable>
            ))
          : null}
        {tab !== 'recommended' && chips.length ? (
          <Pressable onPress={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} accessibilityRole="button" style={[styles.chip, styles.clearChip]} testID="discover-clear-filters">
            <Text variant="label" color={colors.danger}>
              {t('common.clearAll')}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {/* Row 2: sort, count and refresh — right above the first card. */}
      {onFeedTab && feed.data ? (
        <Row style={{ justifyContent: 'space-between', alignItems: 'center' }} gap={space.sm}>
          {tab === 'all' ? (
            <Pressable
              onPress={() => patch({ sort: filters.sort === 'recent' ? 'recommended' : 'recent' })}
              accessibilityRole="button"
              accessibilityLabel={`${t('discover.sortBy')}: ${sortLabel}`}
              style={styles.sortChip}
              testID="discover-sort"
            >
              <Text variant="label" color={colors.emerald}>
                {sortLabel}
              </Text>
              <Icon name="chevronDown" size={14} color={colors.emerald} />
            </Pressable>
          ) : null}
          <Text variant="label" color={colors.muted} style={{ flex: 1, textAlign: tab === 'all' ? 'right' : 'left' }} accessibilityLiveRegion="polite" testID="discover-count" numberOfLines={1}>
            {t('discover.toDiscover', { count: toDiscover })}
          </Text>
          <Pressable onPress={() => void feed.refresh()} accessibilityRole="button" accessibilityLabel={t('discover.refresh')} hitSlop={6} style={styles.refreshBtn} testID="discover-refresh">
            <Icon name="refresh" size={18} color={colors.emerald} />
          </Pressable>
        </Row>
      ) : null}
      <BoostSellBanner testID="discover-boost-sell" />
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
      <Button label={t('discover.refresh')} size="sm" kind="secondary" icon={<Icon name="refresh" size={16} color={colors.emerald} />} onPress={() => void feed.refresh()} />
    </View>
  );
  const toAll = <Button label={t('discover.seeAll')} kind="secondary" size="sm" onPress={() => setTab('all')} />;
  const empty =
    tab === 'featured' ? (
      <EmptyState icon="sparkle" title={t('discover.featuredEmptyTitle')} body={t('discover.featuredEmptyBody')} action={toAll} />
    ) : tab === 'new' ? (
      <EmptyState icon="star" title={t('discover.newEmptyTitle')} body={t('discover.newEmptyBody')} action={toAll} />
    ) : noMatches ? (
      // Never a dead end: name the filters that can be loosened, and other places to look.
      <EmptyState
        icon="search"
        title={filters.keyword ? t('discover.noResultsFor', { q: filters.keyword }) : t('discover.empty')}
        body={filters.keyword ? t('discover.noResultsKeyword') : t('discover.emptyHint')}
        action={
          <View style={{ gap: space.sm, alignItems: 'center' }} testID="no-results-suggestions">
            {tab === 'all' && chips.length ? (
              <View style={[styles.chips, { justifyContent: 'center' }]}>
                {chips.slice(0, 3).map((c) => (
                  <Pressable key={c.key} onPress={c.remove} accessibilityRole="button" style={styles.chip}>
                    <Icon name="close" size={12} />
                    <Text variant="caption" color={colors.emerald}>
                      {t('discover.removeFilter', { name: c.label })}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Row gap={space.sm} wrap style={{ justifyContent: 'center' }}>
              {tab === 'all' && chips.length ? <Button label={t('discover.clearFilters')} kind="secondary" size="sm" onPress={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })} /> : null}
              {tab === 'recommended' ? <Button label={t('discover.seeAll')} kind="secondary" size="sm" onPress={() => setTab('all')} /> : null}
              {featuredItems.length ? <Button label={t('discover.tryFeatured')} kind="ghost" size="sm" onPress={() => setTab('featured')} /> : null}
            </Row>
          </View>
        }
      />
    ) : (
      caughtUp
    );

  const loading = tab === null || (tab === 'featured' ? sections.isLoading : feed.isLoading);
  const error = tab === 'featured' ? sections.error : feed.error;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TabHeader
        title={t('discover.title')}
        right={
          <>
            <ShortlistButton />
          </>
        }
      />
      {loading ? (
        <View style={styles.column}>
          {header}
          <View style={{ padding: space.sm, gap: space.lg }}>
            <SlowNotice active onRetry={() => (tab === 'featured' ? sections.refetch() : feed.refetch())} />
            <ProfileCardSkeleton layout="list" />
            <ProfileCardSkeleton layout="list" />
          </View>
        </View>
      ) : error ? (
        <View style={styles.column}>
          {header}
          <ErrorView error={error} onRetry={() => (tab === 'featured' ? sections.refetch() : feed.refetch())} />
        </View>
      ) : (
        <FlatList
          key={`${columns}-${tab}`}
          data={items}
          numColumns={columns}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.column, { padding: space.sm, paddingBottom: space.xxxl }]}
          onEndReached={() => onFeedTab && feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
          onEndReachedThreshold={0.6}
          initialNumToRender={4}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          onViewableItemsChanged={impressions.onViewableItemsChanged}
          viewabilityConfig={impressions.viewabilityConfig}
          refreshControl={
            <RefreshControl
              refreshing={tab === 'featured' ? sections.isRefetching : feed.isRefetching && !feed.isFetchingNextPage}
              onRefresh={() => void (tab === 'featured' ? sections.refetch() : feed.refresh())}
              tintColor={colors.emerald}
            />
          }
          testID={tab === 'featured' ? 'featured-strip' : `discover-list-${tab}`}
          ListEmptyComponent={empty}
          ListFooterComponent={
            items.length && onFeedTab ? (
              feed.isFetchingNextPage ? (
                <Loading />
              ) : !feed.hasNextPage ? (
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
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.ivory },
  badgeText: { fontSize: 10.5, lineHeight: 13, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 16, color: colors.charcoal, paddingVertical: space.sm },
  tabs: { gap: space.sm, paddingVertical: 2 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  tabOn: { backgroundColor: colors.emerald, borderColor: colors.emerald },
  tabDot: { position: 'absolute', top: 6, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  filterRow: { gap: space.sm, paddingVertical: 2, alignItems: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: space.lg, borderRadius: radius.pill, backgroundColor: colors.emerald },
  countPill: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  clearChip: { backgroundColor: 'transparent', borderColor: 'transparent' },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  refreshBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    minHeight: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
