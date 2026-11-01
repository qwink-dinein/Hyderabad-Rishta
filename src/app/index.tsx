import { Redirect } from 'expo-router';
import { LoginFlow } from '@/components/LoginFlow';
import { isAdminRole } from '@/domain/types';
import { useSession } from '@/state/session';

/**
 * Opening screen (owner request 2026-11-01): log in first — mobile number (always blank) + 4-digit PIN,
 * Forgot PIN under it, then "Create an account" / "Find matches" for new people. The old landing page
 * lives at /welcome ("How it works").
 */
export default function Index() {
  const user = useSession((s) => s.user);
  if (user) return <Redirect href={isAdminRole(user.role) ? '/admin' : '/home'} />;
  return <LoginFlow />;
}
