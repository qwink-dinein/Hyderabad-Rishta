import { isAdminRole, type Role } from './types';

/** Where "Home" means for whoever is using the app right now. */
export function homeHrefFor(user: { role: Role } | null): '/' | '/admin' | '/home' {
  if (!user) return '/';
  return isAdminRole(user.role) ? '/admin' : '/home';
}

/** Screens that belong to members only (their own biodata, Discover, requests, boost…). Admins never see them. */
const MEMBER_ONLY = ['/home', '/discover', '/shortlist', '/requests', '/dashboard', '/biodata', '/boost', '/activity', '/filters', '/request/'];
export const isMemberOnlyPath = (path: string) => MEMBER_ONLY.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`));
