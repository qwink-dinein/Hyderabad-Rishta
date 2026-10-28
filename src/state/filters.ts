import { create } from 'zustand';
import { EMPTY_FILTERS, type SearchFilters } from '@/domain/search';

/** Discovery filters live outside the screen so they survive opening a profile and coming back. */
interface FiltersState {
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  patch: (p: Partial<SearchFilters>) => void;
  reset: () => void;
}

export const useFilters = create<FiltersState>((set) => ({
  filters: EMPTY_FILTERS,
  setFilters: (filters) => set({ filters }),
  patch: (p) => set((s) => ({ filters: { ...s.filters, ...p } })),
  reset: () => set({ filters: EMPTY_FILTERS }),
}));
