import { Redirect } from 'expo-router';
import { Welcome } from '@/components/onboarding/Welcome';
import { isAdminRole } from '@/domain/types';
import { useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';

/**
 * Opening screen (owner request 2026-11-01, onboarding redesign): new families see matches before
 * signing up ("Find a rishta for my family"); members log in from the second button (/login).
 * Someone who left the sign-up halfway continues where they stopped. The old landing page is /welcome.
 */
export default function Index() {
  const user = useSession((s) => s.user);
  const onb = useOnboarding();
  if (user && isAdminRole(user.role)) return <Redirect href="/admin" />;
  // Signed up but not finished (anything after the number was verified): offer to continue.
  if (user && onb.active && !['who', 'wants', 'matches'].includes(onb.step)) return <Redirect href="/start/resume" />;
  if (user) return <Redirect href="/home" />;
  return <Welcome />;
}
