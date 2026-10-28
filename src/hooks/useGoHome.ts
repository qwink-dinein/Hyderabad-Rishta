import { useCallback } from 'react';
import { router, type Href } from 'expo-router';
import { isAdminRole } from '@/domain/types';
import { useSession } from '@/state/session';

/** Where "Home" means for whoever is using the app right now. */
export function homeHrefFor(user: { role: Parameters<typeof isAdminRole>[0] } | null): Href {
  if (!user) return '/';
  return isAdminRole(user.role) ? '/admin' : '/home';
}

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
