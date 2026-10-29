import { createMember, type CreateDeps } from '../supabase/functions/admin-create-member/create';

/** The admin-create-member Edge Function core: admin only, normalised phone, no orphan logins. */
function fake(opts: { isAdmin?: boolean; authExists?: boolean; rpcError?: string } = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const deleted: string[] = [];
  const deps: CreateDeps = {
    caller: async (jwt) => (jwt === 'good' ? { id: 'admin-1', isAdmin: opts.isAdmin ?? true } : null),
    ensureAuthUser: async () => ({ id: 'auth-9', created: !opts.authExists }),
    deleteAuthUser: async (id) => {
      deleted.push(id);
    },
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (opts.rpcError) throw new Error(opts.rpcError);
      return { id: 'p-1', status: 'draft' };
    },
  };
  return { deps, calls, deleted };
}
const body = (over: Record<string, unknown> = {}) => ({ countryCode: '+91', phone: '099999 99999', biodata: { basic: { fullName: 'Team Added' } }, lastStep: 3, ...over });

it('an admin creates the member for the normalised number', async () => {
  const f = fake();
  const r = await createMember(f.deps, 'good', body());
  expect(r.status).toBe(200);
  expect(f.calls[0]).toMatchObject({ fn: 'admin_create_member', args: { p_admin: 'admin-1', p_user: 'auth-9', p_country_code: '+91', p_phone: '9999999999', p_last_step: 3 } });
});

it('refuses signed-out callers and non-admins before touching Auth', async () => {
  expect((await createMember(fake().deps, null, body())).status).toBe(401);
  expect((await createMember(fake().deps, 'bad', body())).status).toBe(401);
  const f = fake({ isAdmin: false });
  expect((await createMember(f.deps, 'good', body())).status).toBe(403);
  expect(f.calls).toHaveLength(0);
});

it.each([
  [{ phone: '12345' }],
  [{ biodata: null }],
  [{ biodata: [] }],
  [{ biodata: { basic: { fullName: '  ' } } }],
  [{ lastStep: 9 }],
  [{ biodata: { basic: { fullName: 'X' }, big: 'x'.repeat(40000) } }],
])('bad input %j → 400', async (over) => {
  expect((await createMember(fake().deps, 'good', body(over))).status).toBe(400);
});

it('a taken number → 409, and the Auth user this call created is removed again', async () => {
  const f = fake({ rpcError: 'phone_taken' });
  const r = await createMember(f.deps, 'good', body());
  expect(r).toEqual({ status: 409, body: { error: 'phone_taken' } });
  expect(f.deleted).toEqual(['auth-9']);
});

it('never deletes an Auth user that existed before this call', async () => {
  const f = fake({ rpcError: 'phone_taken', authExists: true });
  await createMember(f.deps, 'good', body());
  expect(f.deleted).toEqual([]);
});
