import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True only when BOTH public values are set. The service-role key must never be in the app. */
export const supabaseConfigured = !!url && !!anonKey;

let client: SupabaseClient | null = null;

/** Lazily creates the Supabase client (anon key only; RLS enforces access). */
export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error('Supabase is not configured. See .env.example.');
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}
