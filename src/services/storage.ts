import AsyncStorage from '@react-native-async-storage/async-storage';

/** Minimal key-value contract so the demo backend can run on AsyncStorage or in memory (tests). */
export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * AsyncStorage with an in-memory fallback: private windows and sandboxed frames can block
 * localStorage, and the app must still work (data then lasts for the session only).
 */
const fallback = new Map<string, string>();
export const asyncStorageKV: KV = {
  getItem: async (k) => {
    try {
      return (await AsyncStorage.getItem(k)) ?? fallback.get(k) ?? null;
    } catch {
      return fallback.get(k) ?? null;
    }
  },
  setItem: async (k, v) => {
    fallback.set(k, v);
    try {
      await AsyncStorage.setItem(k, v);
    } catch {
      // storage blocked or full — keep the in-memory copy
    }
  },
  removeItem: async (k) => {
    fallback.delete(k);
    try {
      await AsyncStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

export function memoryKV(initial: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(initial));
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => {
      m.set(k, v);
    },
    removeItem: async (k) => {
      m.delete(k);
    },
  };
}
