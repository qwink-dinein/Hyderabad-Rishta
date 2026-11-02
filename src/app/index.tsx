import { Redirect, useLocalSearchParams } from 'expo-router';
import { normalizeReferralCode } from '@/domain/referral';
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
  // An invitation link in the …/?ref=CODE form: remembered by the /r/CODE route, which comes straight back here.
  const ref = normalizeReferralCode(useLocalSearchParams<{ ref?: string }>().ref);
  if (ref && !user) return <Redirect href={`/r/${ref}`} />;
  if (user && isAdminRole(user.role)) return <Redirect href="/admin" />;
  // Signed up but not finished (anything after the number was verified): offer to continue.
  if (user && onb.active && !['who', 'side', 'wants', 'matches'].includes(onb.step)) return <Redirect href="/start/resume" />;
  if (user) return <Redirect href="/home" />;
  return <Welcome />;
}
