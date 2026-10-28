import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

/**
 * Admin area. This guard is UX only — every admin backend call independently verifies the
 * admin role (DemoBackend.admin() / Supabase RLS + is_admin()). Hiding a button is not security.
 * Admin UI copy is English-only for the MVP (internal tool) — see Tasks.md.
 */
export default function AdminLayout() {
  const user = useSession((s) => s.user);
  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/discover" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />;
}
