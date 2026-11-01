import { useCallback } from 'react';
import { router } from 'expo-router';
import { homeHrefFor } from '@/domain/routes';
import { useSession } from '@/state/session';

export { homeHrefFor, isMemberOnlyPath } from '@/domain/routes';

/**
 * Jump to the right home from anywhere: pops the screens stacked on top (so Back doesn't walk
 * through them again), then lands on Home — the member Home tab, the admin dashboard, or the landing page.
 */
export function useGoHome() {
  const user = useSession((s) => s.user);
  return useCallback(() => {
    try {
      if (router.canDismiss()) router.dismissAll();
    } catch {
      // nothing stacked to dismiss
    }
    router.replace(homeHrefFor(user));
  }, [user]);
}
