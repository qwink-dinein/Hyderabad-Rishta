import { deleteAccount, type RemoveDeps } from '../supabase/functions/delete-account/remove';

/** delete-account Edge Function core: the member's own account, photos first, masters refused. */
function fake(role = 'user') {
  const log: string[] = [];
  const deps: RemoveDeps = {
    caller: async (jwt) => (jwt === 'good' ? { id: 'u1', role, code: 'HR-1' } : null),
    listPhotos: async (id) => [`${id}/a.jpg`, `${id}/b.jpg`],
    removePhotos: async (p) => void log.push(`photos:${p.join(',')}`),
    audit: async (id, code) => void log.push(`audit:${id}:${code}`),
    deleteAuthUser: async (id) => void log.push(`delete:${id}`),
  };
  return { deps, log };
}

it('removes photos, records the audit, then deletes the login (cascades to the account)', async () => {
  const f = fake();
  expect((await deleteAccount(f.deps, 'good')).status).toBe(200);
  expect(f.log).toEqual(['photos:u1/a.jpg,u1/b.jpg', 'audit:u1:HR-1', 'delete:u1']);
});

it('refuses signed-out callers and the master (transfer first)', async () => {
  const f = fake('master');
  expect((await deleteAccount(f.deps, null)).status).toBe(401);
  expect((await deleteAccount(f.deps, 'bad')).status).toBe(401);
  expect((await deleteAccount(f.deps, 'good')).status).toBe(403);
  expect(f.log).toEqual([]);
});
