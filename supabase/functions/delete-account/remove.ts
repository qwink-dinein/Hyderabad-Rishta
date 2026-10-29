// Core of the delete-account Edge Function (pure, unit-tested in __tests__/deleteAccountEdge.test.ts).
// A member permanently deletes their own account (privacy right; App Store / Play account-deletion rule).
// Deleting the Auth user cascades to the app account, biodata, requests, shortlists, notifications…;
// orders are detached and kept (financial record); the admins are alerted by a database trigger.

export interface RemoveDeps {
  /** The caller from their JWT, with role and profile code (for the audit trail). */
  caller(jwt: string): Promise<{ id: string; role: string; code?: string } | null>;
  listPhotos(userId: string): Promise<string[]>;
  removePhotos(paths: string[]): Promise<void>;
  audit(userId: string, code?: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
}
export interface RemoveResult {
  status: number;
  body: Record<string, unknown>;
}

export async function deleteAccount(deps: RemoveDeps, jwt: string | null): Promise<RemoveResult> {
  if (!jwt) return { status: 401, body: { error: 'unauthenticated' } };
  const me = await deps.caller(jwt);
  if (!me) return { status: 401, body: { error: 'unauthenticated' } };
  if (me.role === 'master') return { status: 403, body: { error: 'forbidden', message: 'Transfer the master role before deleting this account' } };
  // Photos first: once the account is gone nothing points at them, so they must not be left behind.
  const photos = await deps.listPhotos(me.id).catch(() => []);
  if (photos.length) await deps.removePhotos(photos).catch(() => undefined);
  await deps.audit(me.id, me.code).catch(() => undefined);
  await deps.deleteAuthUser(me.id);
  return { status: 200, body: { ok: true } };
}
