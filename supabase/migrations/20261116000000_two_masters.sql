-- Two master admins (owner decision 2026-10-29: "I want to have two master admins").
-- Rules:
--   * At most TWO masters (was exactly one). Enforced by a trigger under an advisory lock (no race).
--   * Masters cannot manage each other (assert_can_manage already refuses any master target), so one
--     compromised phone cannot lock the other owner out.
--   * Transfer still swaps the caller's master role with an active sub-admin (count unchanged).
--   * Recovery (codes / backup phone / break-glass) replaces the master TEAM: every other master is
--     demoted, because recovery means master access was lost or compromised. It still runs only after
--     the 72-hour delay (unless from the verified backup phone), and ANY master can cancel it meanwhile.
--   * A master invite gives the master role on first sign-in while fewer than two masters exist.

drop index if exists one_master;

create or replace function trg_max_two_masters() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role = 'master' and (tg_op = 'INSERT' or old.role is distinct from 'master') then
    perform pg_advisory_xact_lock(hashtext('app_users.master'));
    if (select count(*) from app_users where role = 'master' and id <> new.id) >= 2 then
      raise exception 'invalid_state: at most two master admins' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function trg_max_two_masters() from public, anon, authenticated;
drop trigger if exists app_users_max_two_masters on app_users;
create trigger app_users_max_two_masters before insert or update of role on app_users
  for each row execute function trg_max_two_masters();

create or replace function complete_master_recovery(p_cc text, p_phone text, p_method text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare target app_users; olds uuid[];
begin
  select * into target from app_users where country_code = p_cc and phone = p_phone;
  if target.id is null then raise exception 'not_found: the recovering phone must sign in once first'; end if;
  select coalesce(array_agg(id), '{}') into olds from app_users where role = 'master' and id <> target.id;
  update app_users set role = 'user' where id = any (olds);
  update app_users set role = 'master', deactivated_at = null, deleted_at = null where id = target.id;
  perform reset_recovery();
  insert into audit_events (actor_id, action, target, meta) values (target.id, 'master.recovered', target.id::text, jsonb_build_object('method', p_method, 'previousMasters', to_jsonb(olds)));
  insert into notifications (user_id, type, params, deep_link)
    select id, 'security', jsonb_build_object('event', 'master_recovered'), '/admin' from app_users where role in ('admin', 'master');
end $$;
revoke all on function complete_master_recovery(text, text, text) from public, anon, authenticated;

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
    -- An invite added after the account existed upgrades it once (never downgrades, never a 3rd master).
    select * into inv from admin_invites where country_code = acc.country_code and phone = acc.phone;
    if found and acc.role = 'user' and acc.deleted_at is null then
      perform pg_advisory_xact_lock(hashtext('app_users.master'));
      new_role := case when inv.role = 'master' and (select count(*) from app_users where role = 'master') < 2 then 'master'::app_role else 'admin'::app_role end;
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
    perform pg_advisory_xact_lock(hashtext('app_users.master'));
    new_role := case when inv.role = 'master' and (select count(*) from app_users where role = 'master') < 2 then 'master'::app_role else 'admin'::app_role end;
    delete from admin_invites where country_code = inv.country_code and phone = inv.phone;
  end if;
  insert into app_users (id, country_code, phone, role) values (me, '+' || cc, national, new_role);
  insert into audit_events (actor_id, action, target, meta) values (me, 'account.created', me::text, jsonb_build_object('role', new_role));
  return jsonb_build_object('id', me, 'role', new_role, 'is_new', true);
end $$;
revoke all on function ensure_account(text) from public, anon;
grant execute on function ensure_account(text) to authenticated;
