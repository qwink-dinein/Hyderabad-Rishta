import { create } from 'zustand';
import { EMPTY_FILTERS, type SearchFilters } from '@/domain/search';

/** Discovery filters live outside the screen so they survive opening a profile and coming back. */
export type DiscoverTab = 'featured' | 'new' | 'recommended' | 'all';

interface FiltersState {
  filters: SearchFilters;
  /** Discover's category tab — kept when opening a profile and coming back. null = not chosen yet. */
  tab: DiscoverTab | null;
  setTab: (t: DiscoverTab) => void;
  setFilters: (f: SearchFilters) => void;
  patch: (p: Partial<SearchFilters>) => void;
  reset: () => void;
}

export const useFilters = create<FiltersState>((set) => ({
  filters: EMPTY_FILTERS,
  tab: null,
  setTab: (tab) => set({ tab }),
  setFilters: (filters) => set({ filters }),
  patch: (p) => set((s) => ({ filters: { ...s.filters, ...p } })),
  reset: () => set({ filters: EMPTY_FILTERS }),
}));
