import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { create } from 'zustand';

/**
 * Optional sensory feedback (Design PRD §13).
 * - Sound effects are OFF by default and never play during browsing, navigation or carousel changes.
 * - Haptics are light and only on meaningful moments (confirmations, shortlist, selections).
 * Both are pure UX: failures are swallowed and nothing depends on them.
 */
export type SoundKind = 'save' | 'sent' | 'accepted' | 'published';
export type HapticKind = 'light' | 'select' | 'success';

interface Prefs {
  sound: boolean;
  haptics: boolean;
  loaded: boolean;
  setSound: (on: boolean) => void;
  setHaptics: (on: boolean) => void;
}

const KEY = 'hr.prefs.feedback';

export const useFeedbackPrefs = create<Prefs>((set, get) => ({
  sound: false,
  haptics: true,
  loaded: false,
  setSound: (sound) => {
    set({ sound });
    persist({ sound, haptics: get().haptics });
  },
  setHaptics: (haptics) => {
    set({ haptics });
    persist({ sound: get().sound, haptics });
  },
}));

function persist(v: { sound: boolean; haptics: boolean }) {
  AsyncStorage.setItem(KEY, JSON.stringify(v)).catch(() => undefined);
}

export async function loadFeedbackPrefs() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as { sound?: boolean; haptics?: boolean }) : {};
    useFeedbackPrefs.setState({ sound: v.sound === true, haptics: v.haptics !== false, loaded: true });
  } catch {
    useFeedbackPrefs.setState({ loaded: true });
  }
}

export function haptic(kind: HapticKind = 'light') {
  if (Platform.OS === 'web' || !useFeedbackPrefs.getState().haptics) return;
  const run = kind === 'success' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : kind === 'select' ? Haptics.selectionAsync() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  run.catch(() => undefined);
}

const SOURCES: Record<SoundKind, number> = {
  save: require('../../assets/sounds/save.wav'),
  sent: require('../../assets/sounds/sent.wav'),
  accepted: require('../../assets/sounds/accepted.wav'),
  published: require('../../assets/sounds/published.wav'),
};

type Player = { play: () => void; pause: () => void; seekTo: (s: number) => Promise<void>; volume: number };
const players: Partial<Record<SoundKind, Player>> = {};
let current: Player | null = null;
let modeSet = false;

/** Plays a short, quiet effect — only if the person turned sound effects on. Never overlaps. */
export function playSound(kind: SoundKind) {
  if (!useFeedbackPrefs.getState().sound) return;
  (async () => {
      if (!modeSet) {
        modeSet = true;
        // Respect the iOS silent switch; mix with (don't stop) whatever else is playing.
        await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
      }
      // Loaded lazily, only once sound is enabled — nothing is fetched at startup.
      const p = (players[kind] ??= createAudioPlayer(SOURCES[kind]) as unknown as Player);
      if (current && current !== p) current.pause();
      current = p;
      p.volume = 0.6;
      await p.seekTo(0).catch(() => undefined);
      p.play();
  })().catch(() => undefined);
}

/** Convenience for success moments: one haptic + (optional) one sound. */
export function celebrate(kind: SoundKind) {
  haptic('success');
  playSound(kind);
}
