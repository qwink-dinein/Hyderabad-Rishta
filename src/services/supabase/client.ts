import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { secureKV } from '../secureStorage';
import { asyncStorageKV, type KV } from '../storage';
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './config';

export { supabaseConfigured };

/**
 * The login session can be larger than one Keychain/Keystore entry allows (~2 KB on some phones), so
 * it is split into chunks, each kept in secure storage (THIS_DEVICE_ONLY — never in backups).
 */
const CHUNK = 1800;
export function chunkedKV(kv: KV): KV {
  return {
    async getItem(key) {
      const n = Number(await kv.getItem(`${key}.n`));
      if (!n) return kv.getItem(key);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await kv.getItem(`${key}.${i}`);
        if (part == null) return null;
        parts.push(part);
      }
      return parts.join('');
    },
    async setItem(key, value) {
      const old = Number(await kv.getItem(`${key}.n`)) || 0;
      const n = Math.ceil(value.length / CHUNK) || 1;
      for (let i = 0; i < n; i++) await kv.setItem(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
      for (let i = n; i < old; i++) await kv.removeItem(`${key}.${i}`);
      await kv.setItem(`${key}.n`, String(n));
    },
    async removeItem(key) {
      const n = Number(await kv.getItem(`${key}.n`)) || 0;
      for (let i = 0; i < n; i++) await kv.removeItem(`${key}.${i}`);
      await kv.removeItem(`${key}.n`);
      await kv.removeItem(key);
    },
  };
}

let client: SupabaseClient | null = null;

/** Lazily creates the Supabase client (public key only; RLS and RPCs enforce every rule). */
export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error('Supabase is not configured. See .env.example.');
  if (!client) {
    const native = Platform.OS !== 'web';
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        storage: native ? chunkedKV(secureKV) : asyncStorageKV,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        ...(native ? { lock: processLock } : {}),
      },
    });
    if (native) {
      // Refresh tokens only while the app is in the foreground.
      const c = client;
      AppState.addEventListener('change', (state) => {
        if (state === 'active') c.auth.startAutoRefresh();
        else c.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}
