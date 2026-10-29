// Core of the admin-create-member Edge Function (pure, unit-tested in __tests__/adminCreateMemberEdge.test.ts).
// An admin or sub-admin adds a member for a phone number without any OTP. This creates the Supabase
// Auth user for that phone (so the owner's later OTP sign-in lands in THIS account), then the
// database creates the app account + draft biodata (admin_create_member, service role).
import { normalizePhone } from '../_shared/phone.ts';

export interface CreateDeps {
  /** Who is calling (from their JWT) and whether they are an active admin/sub-admin. */
  caller(jwt: string): Promise<{ id: string; isAdmin: boolean } | null>;
  /** Finds or creates the Auth user for this phone. `created` = it did not exist before. */
  ensureAuthUser(phoneE164: string): Promise<{ id: string; created: boolean }>;
  /** Removes an Auth user this call created, when the database refuses (no orphan logins). */
  deleteAuthUser(id: string): Promise<void>;
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
}
export interface CreateResult {
  status: number;
  body: Record<string, unknown>;
}

const MAX_BIODATA_BYTES = 32 * 1024;

export async function createMember(deps: CreateDeps, jwt: string | null, input: unknown): Promise<CreateResult> {
  if (!jwt) return { status: 401, body: { error: 'unauthenticated' } };
  const me = await deps.caller(jwt);
  if (!me) return { status: 401, body: { error: 'unauthenticated' } };
  if (!me.isAdmin) return { status: 403, body: { error: 'forbidden' } };

  const b = (input ?? {}) as Record<string, unknown>;
  const phone = normalizePhone(typeof b.countryCode === 'string' ? b.countryCode : '', typeof b.phone === 'string' ? b.phone : '');
  const biodata = b.biodata;
  const lastStep = Number(b.lastStep);
  const name = (biodata as { basic?: { fullName?: unknown } } | null)?.basic?.fullName;
  if (
    !phone ||
    !biodata ||
    typeof biodata !== 'object' ||
    Array.isArray(biodata) ||
    typeof name !== 'string' ||
    !name.trim() ||
    !Number.isInteger(lastStep) ||
    lastStep < 0 ||
    lastStep > 7 ||
    new TextEncoder().encode(JSON.stringify(biodata)).length > MAX_BIODATA_BYTES
  ) {
    return { status: 400, body: { error: 'validation' } };
  }

  const e164 = `${phone.countryCode}${phone.phone}`;
  const auth = await deps.ensureAuthUser(e164);
  try {
    const profile = await deps.rpc('admin_create_member', {
      p_admin: me.id,
      p_user: auth.id,
      p_country_code: phone.countryCode,
      p_phone: phone.phone,
      p_biodata: biodata,
      p_last_step: lastStep,
    });
    return { status: 200, body: { profile, userId: auth.id } };
  } catch (e) {
    // Only undo what this call made: an Auth user that already existed belongs to someone.
    if (auth.created) await deps.deleteAuthUser(auth.id).catch(() => undefined);
    const msg = e instanceof Error ? e.message : '';
    if (/phone_taken/.test(msg)) return { status: 409, body: { error: 'phone_taken' } };
    if (/forbidden/.test(msg)) return { status: 403, body: { error: 'forbidden' } };
    if (/validation/.test(msg)) return { status: 400, body: { error: 'validation' } };
    throw e;
  }
}
