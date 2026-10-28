import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SearchFilters } from '@/domain/search';
import type { Biodata, ConsentScopes, ProfileStatus } from '@/domain/types';
import { backend, type SendInterestInput } from '@/services';
import { useSession } from '@/state/session';

/** Query keys in one place so invalidation stays consistent. */
export const qk = {
  me: ['me'] as const,
  myProfile: ['myProfile'] as const,
  dashboard: ['dashboard'] as const,
  pricing: ['pricing'] as const,
  search: (f: SearchFilters) => ['search', f] as const,
  profile: (id: string) => ['profile', id] as const,
  shortlistIds: ['shortlistIds'] as const,
  shortlist: ['shortlist'] as const,
  requests: ['requests'] as const,
  requestWith: (id: string) => ['requestWith', id] as const,
  notifications: ['notifications'] as const,
  orders: ['orders'] as const,
  blocked: ['blocked'] as const,
  admin: (k: string, ...rest: unknown[]) => ['admin', k, ...rest] as const,
  featured: ['featured'] as const,
  pushSettings: ['pushSettings'] as const,
};

const useAuthed = () => !!useSession((s) => s.user);

export function useMyProfile() {
  return useQuery({ queryKey: qk.myProfile, queryFn: () => backend.getMyProfile(), enabled: useAuthed() });
}
export function useDashboard() {
  return useQuery({ queryKey: qk.dashboard, queryFn: () => backend.getDashboard(), enabled: useAuthed() });
}
export function usePricing() {
  return useQuery({ queryKey: qk.pricing, queryFn: () => backend.getPricing(), staleTime: 60_000 });
}

export function useSearch(filters: SearchFilters) {
  return useInfiniteQuery({
    queryKey: qk.search(filters),
    queryFn: ({ pageParam }) => backend.searchProfiles(filters, pageParam, 10),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: useAuthed(),
    staleTime: 30_000,
  });
}

/** Boosted profiles every eligible viewer sees, independent of their filters (see domain/featured). */
export function useFeatured() {
  return useQuery({ queryKey: qk.featured, queryFn: () => backend.getFeatured(12), enabled: useAuthed(), staleTime: 60_000 });
}
export function usePushSettings() {
  return useQuery({ queryKey: qk.pushSettings, queryFn: () => backend.getPushSettings(), enabled: useAuthed() });
}

export function useProfile(id: string) {
  return useQuery({ queryKey: qk.profile(id), queryFn: () => backend.getProfile(id), enabled: useAuthed() && !!id });
}
export function useShortlistIds() {
  return useQuery({ queryKey: qk.shortlistIds, queryFn: () => backend.getShortlistIds(), enabled: useAuthed() });
}
export function useShortlist() {
  return useQuery({ queryKey: qk.shortlist, queryFn: () => backend.getShortlist(), enabled: useAuthed() });
}

/** Optimistic shortlist toggle — the heart flips instantly, rolls back on error. */
export function useToggleShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backend.toggleShortlist(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.shortlistIds });
      const prev = qc.getQueryData<string[]>(qk.shortlistIds) ?? [];
      qc.setQueryData(qk.shortlistIds, prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx && qc.setQueryData(qk.shortlistIds, ctx.prev),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.shortlistIds });
      qc.invalidateQueries({ queryKey: qk.shortlist });
    },
  });
}

export function useRequests() {
  return useQuery({ queryKey: qk.requests, queryFn: () => backend.getRequests(), enabled: useAuthed() });
}
export function useRequestWith(profileId: string) {
  return useQuery({ queryKey: qk.requestWith(profileId), queryFn: () => backend.getRequestStatusWith(profileId), enabled: useAuthed() && !!profileId });
}

function useInvalidateRequests() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.requests });
    qc.invalidateQueries({ queryKey: ['requestWith'] });
    qc.invalidateQueries({ queryKey: ['profile'] });
    qc.invalidateQueries({ queryKey: qk.notifications });
    qc.invalidateQueries({ queryKey: qk.dashboard });
  };
}

export function useSendRequest() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (v: { to: string; input: SendInterestInput }) => backend.sendRequest(v.to, v.input), onSuccess: inv });
}
export function useOfferPhone() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (v: { requestId: string; idempotencyKey: string }) => backend.offerPhone(v.requestId, true, v.idempotencyKey), onSuccess: inv });
}
export function useRespondPhoneOffer() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (v: { id: string; decision: 'accepted' | 'declined' }) => backend.respondToPhoneOffer(v.id, v.decision), onSuccess: inv });
}
export function useWithdrawPhoneOffer() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (id: string) => backend.withdrawPhoneOffer(id), onSuccess: inv });
}
export function usePokeRequest() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (id: string) => backend.pokeRequest(id), onSuccess: inv });
}
export function useRespondRequest() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (v: { id: string; decision: 'accepted' | 'declined' }) => backend.respondToRequest(v.id, v.decision), onSuccess: inv });
}
export function useWithdrawRequest() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (id: string) => backend.withdrawRequest(id), onSuccess: inv });
}
export function useSetConsent() {
  const inv = useInvalidateRequests();
  return useMutation({ mutationFn: (v: { id: string; scopes: ConsentScopes }) => backend.setConsent(v.id, v.scopes), onSuccess: inv });
}

export function useNotifications() {
  return useQuery({ queryKey: qk.notifications, queryFn: () => backend.getNotifications(), enabled: useAuthed(), refetchInterval: 60_000 });
}
export function useUnreadCount() {
  const { data } = useNotifications();
  return data?.filter((n) => !n.readAt).length ?? 0;
}

export function useSaveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { biodata: Biodata; step: number }) => backend.saveDraft(v.biodata, v.step),
    onSuccess: (p) => {
      qc.setQueryData(qk.myProfile, p);
      qc.invalidateQueries({ queryKey: qk.dashboard });
    },
  });
}

export function useInvalidateProfileState() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.myProfile });
    qc.invalidateQueries({ queryKey: qk.dashboard });
    qc.invalidateQueries({ queryKey: qk.orders });
    qc.invalidateQueries({ queryKey: qk.notifications });
    qc.invalidateQueries({ queryKey: ['search'] });
    qc.invalidateQueries({ queryKey: qk.featured });
  };
}

export function useOrders() {
  return useQuery({ queryKey: qk.orders, queryFn: () => backend.getMyOrders(), enabled: useAuthed() });
}
export function useBlocked() {
  return useQuery({ queryKey: qk.blocked, queryFn: () => backend.getBlockedIds(), enabled: useAuthed() });
}

export function useAdminProfiles(status?: ProfileStatus) {
  return useQuery({ queryKey: qk.admin('profiles', status), queryFn: () => backend.adminListProfiles(status) });
}
