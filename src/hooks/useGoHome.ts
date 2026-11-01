import { useCallback } from 'react';
import { router, type Href } from 'expo-router';
import { isAdminRole } from '@/domain/types';
import { useSession } from '@/state/session';

/** Where "Home" means for whoever is using the app right now. */
export function homeHrefFor(user: { role: Parameters<typeof isAdminRole>[0] } | null): Href {
  if (!user) return '/';
  return isAdminRole(user.role) ? '/admin' : '/home';
}

/** Screens that belong to members only (their own biodata, Discover, requests, boost…). Admins never see them. */
const MEMBER_ONLY = ['/home', '/discover', '/shortlist', '/requests', '/dashboard', '/biodata', '/boost', '/activity', '/filters', '/request/'];
export const isMemberOnlyPath = (path: string) => MEMBER_ONLY.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`));

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
