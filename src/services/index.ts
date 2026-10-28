import { DemoBackend } from './demo/demoBackend';
import type { Backend } from './backend';
import { asyncStorageKV } from './storage';
import { supabaseConfigured } from './supabase/client';

/**
 * Backend selection.
 * - Demo (default): offline, seeded, clearly labelled. Works in Expo Go, web and tests.
 * - Supabase: schema + RLS live in supabase/migrations; the client adapter is Phase 2
 *   (see Phases.md). Until it lands we stay on the demo backend even if env vars exist,
 *   and the UI says so — we never silently pretend to be production.
 */
export const backend: Backend = new DemoBackend({ storage: asyncStorageKV, latencyMs: 120 });

export const backendInfo = {
  kind: backend.kind,
  supabaseConfigured,
};

export * from './backend';
