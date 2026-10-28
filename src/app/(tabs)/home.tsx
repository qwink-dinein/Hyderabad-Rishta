import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/art/Illustrations';
import { ProfileCard, ProfileCardSkeleton } from '@/components/ProfileCard';
import { PushPrompt } from '@/components/PushSettings';
import { TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/Button';
import { Banner, EmptyState } from '@/components/ui/feedback';
import { Icon } from '@/components/ui/Icon';
import { Row } from '@/components/ui/layout';
import { Text } from '@/components/ui/Text';
import { EMPTY_FILTERS } from '@/domain/search';
import { isRTL } from '@/i18n';
import { useFeatured, useMyProfile, useRequests, useSearch, useShortlistIds, useToggleShortlist } from '@/hooks/queries';
import { backendInfo } from '@/services';
import { useFilters } from '@/state/filters';
import { useSession } from '@/state/session';
import { colors, maxContentWidth, radius, space } from '@/theme/tokens';
import { fontFamily } from '@/theme/fonts';

const RECENT = { ...EMPTY_FILTERS, sort: 'recent' as const };

/**
 * Home (Design PRD §10–11): where you stand, what needs your attention, featured and recent profiles.
 * Built entirely from existing queries — no new backend behaviour.
 */
export default function Home() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const lang = useSession((s) => s.lang);
  const { data: me } = useMyProfile();
  const { data: requests } = useRequests();
  const featured = useFeatured();
  const recent = useSearch(RECENT);
  const { data: shortIds } = useShortlistIds();
  const toggle = useToggleShortlist();
  const { setFilters, filters } = useFilters();
  const [q, setQ] = useState('');
  const shortSet = useMemo(() => new Set(shortIds ?? []), [shortIds]);
  const onOpen = useCallback((id: string) => router.push(`/profile/${id}`), []);
  const onToggle = useCallback((id: string) => toggle.mutate(id), [toggle]);

  const featuredItems = featured.data ?? [];
  const recentItems = (recent.data?.pages[0]?.items ?? []).slice(0, 4);
  const newInterests = requests?.filter((r) => r.direction === 'received' && r.request.status === 'pending').length ?? 0;
  const firstName = me?.biodata.basic.fullName.split(' ')[0];

  const search = () => {
    // Uses Discover's existing keyword filter (city, profession, education text).
    setFilters({ ...filters, keyword: q.trim() || undefined });
    router.push('/discover');
  };

  const status = me?.status;
  const statusCard = !me
    ? { title: t('home.startTitle'), body: t('home.startBody'), cta: t('dashboard.createCta'), go: () => router.push('/biodata') }
    : status === 'draft' || status === 'rejected'
      ? { title: t('home.finishTitle'), body: t(`preview.statusHelp.${status}`), cta: t('dashboard.continueCta'), go: () => router.push(me.lastStep >= 7 ? '/biodata/preview' : '/biodata') }
      : status === 'pending' || status === 'paused'
        ? { title: t(`opt.status.${status}`), body: t(`preview.statusHelp.${status}`), cta: t('nav.profile'), go: () => router.push('/dashboard') }
        : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <TabHeader brand />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxxl }} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <Text variant="h1" style={{ marginTop: space.xs }} accessibilityRole="header">
            {firstName ? t('home.greetingName', { name: firstName }) : t('home.greeting')}
          </Text>
          <Text variant="body" color={colors.muted}>
            {t('home.sub')}
          </Text>

          {/* Search: same keyword filter as Discover */}
          <Row style={styles.searchRow} gap={space.sm}>
            <View style={styles.search}>
              <Icon name="search" size={18} color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={setQ}
                onSubmitEditing={search}
                returnKeyType="search"
                placeholder={t('home.searchPlaceholder')}
                placeholderTextColor={colors.muted}
                accessibilityLabel={t('common.search')}
                style={[styles.searchInput, { fontFamily: fontFamily(lang, 'body'), textAlign: isRTL(lang) ? 'right' : 'left' }]}
                testID="home-search"
              />
            </View>
            <Pressable onPress={() => router.push('/filters')} accessibilityRole="button" accessibilityLabel={t('discover.filters')} style={styles.filterBtn}>
              <Icon name="filter" size={20} color={colors.white} />
            </Pressable>
          </Row>

          {backendInfo.kind === 'demo' ? (
            <View style={{ marginTop: space.md }}>
              <Banner tone="warning" icon="sparkle">
                {t('discover.demoData')}
              </Banner>
            </View>
          ) : null}

          {statusCard ? (
            <LinearGradient colors={[colors.forest, colors.emerald]} style={styles.status}>
              <View style={styles.statusMark} pointerEvents="none">
                <BrandMark size={120} />
              </View>
              <Text variant="h2" color={colors.ivory}>
                {statusCard.title}
              </Text>
              <Text variant="body" color={colors.sage}>
                {statusCard.body}
              </Text>
              <Button label={statusCard.cta} kind="gold" size="sm" arrow onPress={statusCard.go} style={{ alignSelf: 'flex-start', marginTop: space.sm }} testID="home-status-cta" />
            </LinearGradient>
          ) : null}

          <PushPrompt />

          {newInterests ? (
            <Pressable onPress={() => router.push('/requests')} accessibilityRole="button" style={styles.attention} testID="home-interests">
              <View style={styles.attentionIcon}>
                <Icon name="mail" size={20} color={colors.emerald} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{t('home.newInterests', { count: newInterests })}</Text>
                <Text variant="caption">{t('home.newInterestsHint')}</Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        {featuredItems.length || featured.isLoading ? (
          <>
            <SectionHead title={t('home.featured')} action={t('home.viewAll')} onAction={() => {
              setFilters({ ...EMPTY_FILTERS, boostedOnly: true });
              router.push('/discover');
            }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {featured.isLoading
                ? [0, 1].map((i) => (
                    <View key={i} style={{ width: 230 }}>
                      <ProfileCardSkeleton />
                    </View>
                  ))
                : featuredItems.map((p) => <ProfileCard key={p.id} profile={p} variant="featured" shortlisted={shortSet.has(p.id)} onToggleShortlist={onToggle} onOpen={onOpen} />)}
            </ScrollView>
            <View style={styles.column}>
              <Text variant="caption">{t('discover.boostedNote')}</Text>
            </View>
          </>
        ) : null}

        <SectionHead title={t('home.recent')} action={t('home.viewAll')} onAction={() => {
          setFilters({ ...EMPTY_FILTERS, sort: 'recent' });
          router.push('/discover');
        }} />
        <View style={[styles.column, { gap: space.lg }]}>
          {recent.isLoading ? (
            <ProfileCardSkeleton />
          ) : recentItems.length ? (
            recentItems.map((p) => <ProfileCard key={p.id} profile={p} shortlisted={shortSet.has(p.id)} onToggleShortlist={onToggle} onOpen={onOpen} />)
          ) : (
            <EmptyState icon="search" title={t('discover.empty')} body={t('discover.emptyHint')} />
          )}
          {recentItems.length ? <Button label={t('home.browseAll')} kind="secondary" arrow onPress={() => router.push('/discover')} /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionHead({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <Row style={[styles.column, { justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md }]}>
      <Text variant="h2" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="label" color={colors.emerald} onPress={onAction} accessibilityRole="link" style={{ paddingVertical: space.sm }}>
        {action}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ivory },
  column: { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center', paddingHorizontal: space.lg },
  searchRow: { marginTop: space.lg },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 50, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 16, color: colors.charcoal, paddingVertical: space.sm },
  filterBtn: { width: 50, height: 50, borderRadius: radius.md, backgroundColor: colors.emerald, alignItems: 'center', justifyContent: 'center' },
  status: { marginTop: space.lg, borderRadius: radius.lg, padding: space.xl, gap: space.xs, overflow: 'hidden' },
  statusMark: { position: 'absolute', right: -24, top: -24, opacity: 0.25 },
  attention: { marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gold },
  attentionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  rail: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.sm },
});
