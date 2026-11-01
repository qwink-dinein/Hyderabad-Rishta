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
  /** The screen the member was on when the session ended — logging in again goes back there. */
  returnTo: string | null;
  setReturnTo: (path: string | null) => void;
}

/** Last screen shown (kept by the root layout), used when a session ends unexpectedly. */
export let lastPath = '/';
export const setLastPath = (p: string) => {
  lastPath = p;
};
const NO_RETURN = /^\/($|login|pin|language|recover)/;

export const useSession = create<SessionState>((set) => ({
  ready: false,
  user: null,
  lang: 'en',
  setReady: (ready) => set({ ready }),
  setUser: (user) => set({ user }),
  setLang: (lang) => set({ lang }),
  returnTo: null,
  setReturnTo: (path) => set({ returnTo: path && !NO_RETURN.test(path) ? path : null }),
}));

/** Reads and clears the screen to go back to after logging in again. */
export function takeReturnTo(): string | null {
  const r = useSession.getState().returnTo;
  if (r) useSession.getState().setReturnTo(null);
  return r;
}
