/**
 * True only when BOTH public values are set. The service-role key must never be in the app.
 * Kept apart from client.ts so the demo build doesn't bundle the Supabase SDK just to read a flag.
 */
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = !!supabaseUrl && !!supabaseAnonKey;
