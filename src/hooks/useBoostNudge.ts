import { boostNudge, type BoostNudge } from '@/domain/featured';
import { resolvePricing } from '@/domain/pricing';
import { profileTypeOf } from '@/domain/privacy';
import { useMyProfile, usePricing } from './queries';

/** Where the member stands with Boost — `ready` means "could boost now and hasn't" (we remind). */
export function useBoostNudge(): BoostNudge | null {
  const { data: profile, isLoading } = useMyProfile();
  const { data: pricing } = usePricing();
  if (isLoading || !pricing) return null;
  const disabled = !!profile && resolvePricing(pricing, profileTypeOf(profile)).boost.mode === 'disabled';
  return boostNudge(profile, disabled);
}
