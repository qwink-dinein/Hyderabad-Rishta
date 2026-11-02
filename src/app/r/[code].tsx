import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Loading } from '@/components/ui/feedback';
import { backend } from '@/services';
import { savePendingReferral } from '@/services/referralCapture';

/**
 * An invitation link (…/r/HR8K29, or hyderabadrishta://r/HR8K29 in the app). The code is remembered on this
 * phone for the sign-up, the visit is counted (a visit is never a referral), and the family lands on the
 * normal welcome screen with an "A family invited you" note.
 */
export default function ReferralLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  useEffect(() => {
    let done = false;
    (async () => {
      const c = await savePendingReferral(code);
      if (c) await backend.recordReferralVisit(c).catch(() => undefined);
      if (!done) router.replace('/');
    })();
    return () => {
      done = true;
    };
  }, [code]);
  return <Loading />;
}
