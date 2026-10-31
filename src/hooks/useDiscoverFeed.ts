import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedView } from '@/domain/feed';
import type { SearchFilters } from '@/domain/search';
import type { PublicProfile } from '@/domain/types';
import { backend } from '@/services';
import { useSession } from '@/state/session';

export const feedKey = (f: SearchFilters, view: FeedView) => ['discoverFeed', view, f] as const;

/**
 * Discover's persistent rotation (owner Mini PRD 2026-10-31): cursor pages of a server-stored feed.
 * Loaded cards never move; reopening continues past what was really seen. `refresh()` asks the server for
 * a rebuilt feed (new eligible profiles in, seen ones out) instead of reshuffling the same cards.
 */
export function useDiscoverFeed(filters: SearchFilters, view: FeedView) {
  const qc = useQueryClient();
  const authed = !!useSession((s) => s.user);
  const refreshNext = useRef(false);
  const queryKey = feedKey(filters, view);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => {
      const refresh = !pageParam && refreshNext.current;
      refreshNext.current = false;
      return backend.getDiscoverFeed(filters, { cursor: pageParam, refresh, view, pageSize: 10 });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: authed,
    // The order is stored server-side; refetching on focus would only re-serve it. Keep cards stable.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const keyStr = JSON.stringify(queryKey);
  const refresh = useCallback(async () => {
    refreshNext.current = true;
    await qc.resetQueries({ queryKey: JSON.parse(keyStr) as unknown[] });
  }, [qc, keyStr]);
  return { ...query, refresh };
}

const VIEWABILITY = { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 } as const;

/**
 * Records a card as seen only when it is at least half on screen for at least one second (FlatList
 * viewability), batched every couple of seconds and when the app goes to the background. Each card is sent
 * once per screen session; the server ignores repeats within 30 minutes anyway.
 */
export function useImpressions() {
  const pending = useRef(new Set<string>());
  const sent = useRef(new Set<string>());
  const flush = useCallback(() => {
    const ids = [...pending.current];
    pending.current.clear();
    if (!ids.length) return;
    ids.forEach((id) => sent.current.add(id));
    backend.recordImpressions(ids).catch(() => {
      // Network trouble: try these again with the next batch.
      ids.forEach((id) => {
        sent.current.delete(id);
        pending.current.add(id);
      });
    });
  }, []);
  useEffect(() => {
    const timer = setInterval(flush, 2000);
    const sub = AppState.addEventListener('change', (s) => s !== 'active' && flush());
    return () => {
      clearInterval(timer);
      sub.remove();
      flush();
    };
  }, [flush]);
  // FlatList requires a stable callback (no dependencies → the same function for the screen's lifetime).
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { item?: PublicProfile; isViewable: boolean }[] }) => {
    for (const v of viewableItems) {
      const id = v.item?.id;
      if (v.isViewable && id && !sent.current.has(id)) pending.current.add(id);
    }
  }, []);
  return { onViewableItemsChanged, viewabilityConfig: VIEWABILITY, flush };
}
