-- Account bootstrap (first live project, 2026-10-29).
-- A member's first WhatsApp-OTP sign-in creates their Supabase Auth user; nothing created the matching
-- app_users row yet, and invited admins never received their role. ensure_account() closes both gaps:
-- the app calls it once right after every OTP sign-in.

-- Invites can name the master (owner bootstrap) as well as sub-admins. Real numbers are inserted as data
-- on the live project (never in this repo).
alter table admin_invites add column if not exists role app_role not null default 'admin';
alter table admin_invites drop constraint if exists admin_invites_role_check;
alter table admin_invites add constraint admin_invites_role_check check (role in ('admin', 'master'));

create or replace function ensure_account(p_country_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  acc app_users;
  auth_phone text;
  cc text;
  national text;
  inv admin_invites;
  new_role app_role := 'user';
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;

  select * into acc from app_users where id = me;
  if found then
    -- An invite added after the account existed upgrades it once (never downgrades, never a 2nd master).
    select * into inv from admin_invites where country_code = acc.country_code and phone = acc.phone;
    if found and acc.role = 'user' and acc.deleted_at is null then
      new_role := case when inv.role = 'master' and not exists (select 1 from app_users where role = 'master') then 'master'::app_role else 'admin'::app_role end;
      update app_users set role = new_role where id = me;
      delete from admin_invites where country_code = inv.country_code and phone = inv.phone;
      insert into audit_events (actor_id, action, target, meta) values (me, 'admin.invite_redeemed', me::text, jsonb_build_object('role', new_role));
      acc.role := new_role;
    end if;
    return jsonb_build_object('id', me, 'role', acc.role, 'is_new', false);
  end if;

  -- New account: the number comes from Auth (proved by OTP), never from the client.
  select regexp_replace(coalesce(phone, ''), '\D', '', 'g') into auth_phone from auth.users where id = me;
  cc := regexp_replace(coalesce(p_country_code, ''), '\D', '', 'g');
  if cc !~ '^[1-9]\d{0,2}$' or auth_phone is null or left(auth_phone, length(cc)) <> cc then
    raise exception 'validation' using errcode = '22023';
  end if;
  national := substr(auth_phone, length(cc) + 1);
  if (cc = '91' and national !~ '^[6-9]\d{9}$') or national !~ '^\d{6,14}$' then
    raise exception 'validation' using errcode = '22023';
  end if;
  if exists (select 1 from app_users where country_code = '+' || cc and phone = national) then
    raise exception 'phone_taken' using errcode = '23505';
  end if;

  select * into inv from admin_invites where country_code = '+' || cc and phone = national;
  if found then
    new_role := case when inv.role = 'master' and not exists (select 1 from app_users where role = 'master') then 'master'::app_role else 'admin'::app_role end;
    delete from admin_invites where country_code = inv.country_code and phone = inv.phone;
  end if;
  insert into app_users (id, country_code, phone, role) values (me, '+' || cc, national, new_role);
  insert into audit_events (actor_id, action, target, meta) values (me, 'account.created', me::text, jsonb_build_object('role', new_role));
  return jsonb_build_object('id', me, 'role', new_role, 'is_new', true);
end $$;
revoke all on function ensure_account(text) from public, anon;
grant execute on function ensure_account(text) to authenticated;
