import { create } from 'zustand';
import type { Lang, User } from '@/domain/types';

/** Client session state. Server state (profiles, requests…) lives in TanStack Query. */
interface SessionState {
  ready: boolean;
  user: User | null;
  lang: Lang;
  setReady: (ready: boolean) => void;
  setUser: (user: User | null) => void;
  setLang: (lang: Lang) => void;
}

export const useSession = create<SessionState>((set) => ({
  ready: false,
  user: null,
  lang: 'en',
  setReady: (ready) => set({ ready }),
  setUser: (user) => set({ user }),
  setLang: (lang) => set({ lang }),
}));
