import { Platform } from 'react-native';
import { DemoBackend } from './demo/demoBackend';
import type { Backend } from './backend';
import { secureKV } from './secureStorage';
import { asyncStorageKV } from './storage';
import { getSupabase } from './supabase/client';
import { supabaseConfigured } from './supabase/config';
import { SupabaseBackend } from './supabase/supabaseBackend';

/**
 * Backend selection.
 * - Supabase (production): when EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are set
 *   (eas.json build profiles / .env). Real WhatsApp OTP, RLS and RPCs, private photo storage.
 * - Demo: offline, seeded, clearly labelled — localhost, previews and tests.
 */
function create(): Backend {
  if (supabaseConfigured) {
    return new SupabaseBackend(getSupabase(), { secure: secureKV, platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'android' });
  }
  return new DemoBackend({ storage: asyncStorageKV, secure: secureKV, latencyMs: 120 });
}

export const backend: Backend = create();

export const backendInfo = {
  kind: backend.kind,
  supabaseConfigured,
};

export * from './backend';
