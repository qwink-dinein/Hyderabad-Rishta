import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseConfigured, supabaseUrl } from './config';

export { supabaseConfigured };

let client: SupabaseClient | null = null;

/** Lazily creates the Supabase client (anon key only; RLS enforces access). */
export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error('Supabase is not configured. See .env.example.');
  if (!client) {
    client = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}
