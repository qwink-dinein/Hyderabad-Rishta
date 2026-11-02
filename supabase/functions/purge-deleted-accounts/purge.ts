// Core of the purge-deleted-accounts Edge Function (pure, unit-tested in __tests__/deletedAccounts.test.ts).
// Erases the 30-day admin copies of deleted accounts once they expire: photos first (Storage API — SQL
// cannot delete storage files), then the rows. A copy whose photos could not be removed is kept and
// retried on the next run, so photos are never orphaned.

export interface PurgeDeps {
  due(limit: number): Promise<{ id: string; photo_paths: string[] | null }[]>;
  removePhotos(paths: string[]): Promise<boolean>;
  finish(ids: string[]): Promise<number>;
  log(msg: string): void;
}

export async function purgeExpired(deps: PurgeDeps, limit = 100): Promise<{ erased: number; retry: number }> {
  const rows = await deps.due(limit);
  const done: string[] = [];
  let retry = 0;
  for (const r of rows) {
    const paths = (r.photo_paths ?? []).filter((p) => /^[0-9a-f-]{36}\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/.test(p));
    const ok = paths.length ? await deps.removePhotos(paths).catch(() => false) : true;
    if (ok) done.push(r.id);
    else retry++;
  }
  const erased = done.length ? await deps.finish(done) : 0;
  deps.log(`purge-deleted-accounts: erased ${erased}, retry ${retry}`);
  return { erased, retry };
}
