import { create } from 'zustand';
import type { OnboardingAnswers, QKey } from '@/domain/onboarding';
import { asyncStorageKV } from '@/services/storage';

/**
 * New-member onboarding state. The pre-sign-up answers live on this phone only (nothing is sent until
 * the number is verified); after sign-up every answer is saved to the biodata as it is given. `step` is
 * the last onboarding screen reached, so reopening the app continues exactly there.
 */
/** 'about' | 'more' | 'work' are the old 3-screen steps (kept so a saved older step still resumes). */
export type OnbStep = 'who' | 'side' | 'wants' | 'matches' | 'phone' | 'code' | 'about' | 'more' | 'work' | QKey;
const KEY = 'hr.onboarding.v1';

/** How far each screen is through the journey (drives the progress bar; early steps move fast). */
export const STEP_PROGRESS: Record<OnbStep | 'live', number> = {
  who: 0.08, side: 0.13, wants: 0.18, matches: 0.3, phone: 0.42, code: 0.5, about: 0.55, more: 0.75, work: 0.9, live: 1,
  // One question per screen after sign-up: 0.55 → 0.95.
  name: 0.55, dob: 0.6, height: 0.65, marital: 0.7, children: 0.74, tongue: 0.78, city: 0.83, education: 0.88, profession: 0.94,
};

interface OnbState {
  loaded: boolean;
  active: boolean;
  step: OnbStep;
  answers: OnboardingAnswers;
  /** Progress shown on the previous screen, so the bar continues instead of restarting. */
  lastProgress: number;
  load: () => Promise<void>;
  start: () => void;
  answer: (patch: Partial<OnboardingAnswers>) => void;
  reach: (step: OnbStep) => void;
  setLastProgress: (v: number) => void;
  finish: () => void;
  reset: () => void;
}

function save(s: Pick<OnbState, 'active' | 'step' | 'answers'>) {
  void asyncStorageKV.setItem(KEY, JSON.stringify({ active: s.active, step: s.step, answers: s.answers }));
}

export const useOnboarding = create<OnbState>((set, get) => ({
  loaded: false,
  active: false,
  step: 'who',
  answers: {},
  lastProgress: 0,
  load: async () => {
    try {
      const raw = await asyncStorageKV.getItem(KEY);
      const v = raw ? (JSON.parse(raw) as Partial<OnbState>) : {};
      set({ active: v.active === true, step: v.step ?? 'who', answers: v.answers ?? {}, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  start: () => {
    set({ active: true, step: 'who', lastProgress: 0 });
    save(get());
  },
  answer: (patch) => {
    set({ answers: { ...get().answers, ...patch }, active: true });
    save(get());
  },
  reach: (step) => {
    set({ step, active: true });
    save(get());
  },
  setLastProgress: (lastProgress) => set({ lastProgress }),
  finish: () => {
    set({ active: false, step: 'who', answers: {}, lastProgress: 0 });
    void asyncStorageKV.removeItem(KEY);
  },
  reset: () => {
    set({ active: true, step: 'who', answers: {}, lastProgress: 0 });
    save(get());
  },
}));
