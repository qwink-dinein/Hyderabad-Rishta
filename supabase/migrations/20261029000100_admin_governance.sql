-- Admin governance: master vs sub-admins, soft delete (Trash), suspension, lost-phone recovery.
-- Mirrors src/services/demo/demoBackend.ts and __tests__/governance.test.ts.
--
-- Invariants enforced BY THE DATABASE (not just the app):
--   * at most one master (unique partial index)
--   * nobody acts on the master; only the master acts on sub-admins
--   * audit_events and orders can never be deleted; audit_events can never be edited
--   * recovery codes are stored only as bcrypt hashes and are single-use
--   * new-phone recovery is time-locked 72 h and cancellable by the current master

-- ───────── columns ─────────
alter table app_users add column if not exists deactivated_by uuid;
alter table app_users add column if not exists deleted_at timestamptz;
alter table app_users add column if not exists deleted_by uuid;
alter table app_users add column if not exists delete_reason text;
alter table profiles add column if not exists deleted_at timestamptz;
alter table profiles add column if not exists deleted_by uuid;
alter table profiles add column if not exists delete_reason text;

create unique index if not exists one_master on app_users ((true)) where role = 'master';

-- ───────── role helpers (deleted / suspended admins lose power instantly) ─────────
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where id = auth.uid() and role in ('admin', 'master') and deactivated_at is null and deleted_at is null);
$$;

create or replace function is_master() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where id = auth.uid() and role = 'master' and deactivated_at is null and deleted_at is null);
$$;

create or replace function assert_can_manage(target uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare t app_users;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into t from app_users where id = target;
  if t.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t.id = auth.uid() then raise exception 'forbidden: not on yourself' using errcode = '42501'; end if;
  if t.role = 'master' then raise exception 'forbidden: the master changes only by transfer or recovery' using errcode = '42501'; end if;
  if t.role = 'admin' and not is_master() then raise exception 'forbidden: only the master manages sub-admins' using errcode = '42501'; end if;
end $$;

-- Step-up: sensitive master actions need a session created in the last 5 minutes (fresh OTP login).
create or replace function assert_recent_login() returns void
language plpgsql stable as $$
begin
  if coalesce((auth.jwt() ->> 'iat')::bigint, 0) < extract(epoch from now())::bigint - 300 then
    raise exception 'step_up_required' using errcode = '42501';
  end if;
end $$;

-- ───────── append-only records ─────────
create or replace function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% on % is not allowed (append-only record)', tg_op, tg_table_name using errcode = '42501';
end $$;
drop trigger if exists audit_append_only on audit_events;
create trigger audit_append_only before update or delete on audit_events for each row execute function forbid_change();
-- Orders outlive erased members (legal/financial record): detach instead of cascading a delete.
alter table orders alter column user_id drop not null, alter column profile_id drop not null;
alter table orders drop constraint if exists orders_user_id_fkey, drop constraint if exists orders_profile_id_fkey;
alter table orders add constraint orders_user_id_fkey foreign key (user_id) references app_users (id) on delete set null,
  add constraint orders_profile_id_fkey foreign key (profile_id) references profiles (id) on delete set null;
drop trigger if exists orders_no_delete on orders;
create trigger orders_no_delete before delete on orders for each row execute function forbid_change();

-- ───────── recovery storage ─────────
create table if not exists master_security (
  id boolean primary key default true check (id),
  codes_generated_at timestamptz,
  backup_country_code text,
  backup_phone text,
  backup_verified_at timestamptz,
  pending_country_code text,
  pending_phone text,
  pending_started_at timestamptz,
  pending_completes_at timestamptz
);
insert into master_security (id) values (true) on conflict do nothing;

create table if not exists recovery_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,          -- crypt(code, gen_salt('bf')) — plaintext is never stored
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists recovery_attempts (at timestamptz not null default now(), phone text);
create table if not exists admin_invites (
  country_code text not null,
  phone text not null,
  invited_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  primary key (country_code, phone)
);

alter table master_security enable row level security;
alter table recovery_codes enable row level security;
alter table recovery_attempts enable row level security;
alter table admin_invites enable row level security;
create policy master_security_admin_read on master_security for select using (is_admin());
create policy admin_invites_admin_read on admin_invites for select using (is_admin());
-- recovery_codes / recovery_attempts: no policies at all → only SECURITY DEFINER functions touch them.

-- ───────── discovery & profile view now exclude deleted rows ─────────
create or replace function search_profiles(p_show text default null, p_age_min int default null, p_age_max int default null,
  p_countries text[] default null, p_states text[] default null, p_cities text[] default null, p_keyword text default null,
  p_limit int default 20, p_offset int default 0)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select project_profile(p, auth.uid(), false)
  from profiles p
  join app_users u on u.id = p.user_id and u.deactivated_at is null and u.deleted_at is null
  where auth.uid() is not null
    and p.status = 'published' and p.deleted_at is null
    and p.user_id <> auth.uid()
    and not is_blocked_between(auth.uid(), p)
    and (p_show is null or p.profile_type = p_show)
    and (p_age_min is null or p.dob <= (current_date - make_interval(years => p_age_min)))
    and (p_age_max is null or p.dob > (current_date - make_interval(years => p_age_max + 1)))
    and (p_countries is null or p.country = any (p_countries))
    and (p_states is null or p.state = any (p_states))
    and (p_cities is null or p.city = any (p_cities))
    and (p_keyword is null or (coalesce(p.education_other, '') || ' ' || coalesce(p.profession_other, '') || ' ' || coalesce(p.city, '')) ilike '%' || p_keyword || '%')
  order by (p.boost_until > now()) desc nulls last, p.published_at desc
  limit least(p_limit, 50) offset p_offset;
$$;

create or replace function get_profile(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p profiles; me uuid := auth.uid(); owner app_users;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into p from profiles where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into owner from app_users where id = p.user_id;
  if p.user_id <> me and not is_admin() then
    if p.status <> 'published' or owner.deleted_at is not null or owner.deactivated_at is not null or is_blocked_between(me, p) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from view_events where profile_id = p.id and viewer_user_id = me and at > now() - interval '30 minutes') then
      insert into view_events (profile_id, viewer_user_id) values (p.id, me);
    end if;
  end if;
  return project_profile(p, me, true);
end $$;

-- ───────── admin powers (master + sub-admins) ─────────
create or replace function admin_set_require_approval(p_on boolean) returns int
language plpgsql volatile security definer set search_path = public as $$
declare before pricing_config; after pricing_config;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into before from pricing_config where id;
  update pricing_config set require_approval = p_on, version = version + 1, updated_at = now(), updated_by = auth.uid() where id returning * into after;
  insert into pricing_history (admin_id, before, after) values (auth.uid(), to_jsonb(before), to_jsonb(after));
  insert into audit_events (actor_id, action, meta) values (auth.uid(), 'settings.approval_mode', jsonb_build_object('requireApproval', p_on));
  return (select count(*) from profiles where status = 'pending' and deleted_at is null);
end $$;

create or replace function admin_approve_all_pending() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  with up as (
    update profiles set status = 'published', published_at = coalesce(published_at, now()), admin_note = null, updated_at = now()
    where status = 'pending' and deleted_at is null returning user_id
  ), notes as (insert into notifications (user_id, type, deep_link) select user_id, 'profile_approved', '/dashboard' from up returning 1)
  select count(*) into n from notes;
  insert into audit_events (actor_id, action, meta) values (auth.uid(), 'profile.bulk_approve', jsonb_build_object('count', n));
  return n;
end $$;

create or replace function admin_delete_profile(p_id uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare p profiles;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from profiles where id = p_id and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p.user_id <> auth.uid() then perform assert_can_manage(p.user_id); end if;
  update profiles set deleted_at = now(), deleted_by = auth.uid(), delete_reason = left(p_reason, 300) where id = p_id;
  update contact_requests set status = 'withdrawn' where status = 'pending' and p_id in (from_profile_id, to_profile_id);
  insert into notifications (user_id, type, deep_link) values (p.user_id, 'safety', '/dashboard');
  insert into audit_events (actor_id, action, target, meta) values (auth.uid(), 'profile.deleted', p_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function admin_delete_user(p_id uuid, p_reason text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform assert_can_manage(p_id);
  update app_users set deleted_at = now(), deleted_by = auth.uid(), delete_reason = left(p_reason, 300),
    role = case when role = 'admin' then 'user' else role end
  where id = p_id and deleted_at is null;
  update profiles set deleted_at = now(), deleted_by = auth.uid(), delete_reason = 'Account deleted' where user_id = p_id and deleted_at is null;
  update contact_requests set status = 'withdrawn' where status = 'pending' and p_id in (from_user_id, to_user_id);
  insert into audit_events (actor_id, action, target, meta) values (auth.uid(), 'user.deleted', p_id::text, jsonb_build_object('reason', p_reason));
  -- Session revocation: the Edge Function wrapper also calls auth.admin.signOut(p_id).
end $$;

create or replace function admin_set_user_deactivated(p_id uuid, p_on boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform assert_can_manage(p_id);
  update app_users set deactivated_at = case when p_on then now() end, deactivated_by = case when p_on then auth.uid() end where id = p_id;
  if p_on then update profiles set status = 'paused' where user_id = p_id and status = 'published'; end if;
  insert into audit_events (actor_id, action, target) values (auth.uid(), case when p_on then 'user.deactivated' else 'user.reactivated' end, p_id::text);
end $$;

create or replace function admin_delete(p_kind text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  case p_kind
    when 'request' then delete from contact_requests where id = p_id;      -- consents cascade
    when 'report' then delete from reports where id = p_id;
    when 'announcement' then delete from announcements where id = p_id;    -- deliveries/notifications cascade
    else raise exception 'validation' using errcode = '22023';
  end case;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_events (actor_id, action, target) values (auth.uid(), p_kind || '.deleted', p_id::text);
end $$;

create or replace function admin_cancel_order(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update orders set status = 'cancelled' where id = p_id and status = 'pending';
  if not found then raise exception 'invalid_state'; end if;
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'order.cancelled', p_id::text);
end $$;

-- ───────── master-only ─────────
create or replace function master_restore(p_kind text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare d timestamptz;
begin
  if not is_master() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'user' then
    select deleted_at into d from app_users where id = p_id and deleted_at is not null;
    if d is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    update app_users set deleted_at = null, deleted_by = null, delete_reason = null where id = p_id;
    update profiles set deleted_at = null, deleted_by = null, delete_reason = null where user_id = p_id and deleted_at = d;
  elsif p_kind = 'profile' then
    update profiles set deleted_at = null, deleted_by = null, delete_reason = null
    where id = p_id and deleted_at is not null
      and not exists (select 1 from profiles o where o.user_id = profiles.user_id and o.deleted_at is null);
    if not found then raise exception 'invalid_state'; end if;
  else raise exception 'validation' using errcode = '22023';
  end if;
  insert into audit_events (actor_id, action, target) values (auth.uid(), p_kind || '.restored', p_id::text);
end $$;

create or replace function purge_deleted(p_kind text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  -- Orders reference profiles/users; they are kept (legal record) by detaching instead of deleting.
  if p_kind = 'user' then
    delete from auth.users where id = p_id;   -- cascades to app_users → profiles → social graph
  else
    delete from profiles where id = p_id and deleted_at is not null;
  end if;
end $$;
revoke all on function purge_deleted(text, uuid) from public, anon, authenticated;

create or replace function master_purge(p_kind text, p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_master() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_kind = 'user' and not exists (select 1 from app_users where id = p_id and deleted_at is not null) then raise exception 'not_found'; end if;
  if p_kind = 'profile' and not exists (select 1 from profiles where id = p_id and deleted_at is not null) then raise exception 'not_found'; end if;
  perform purge_deleted(p_kind, p_id);
  insert into audit_events (actor_id, action, target) values (auth.uid(), p_kind || '.purged', p_id::text);
end $$;

create or replace function master_add_sub_admin(p_cc text, p_phone text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare t app_users;
begin
  if not is_master() then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select count(*) from app_users where role = 'admin' and deleted_at is null) >= 10 then raise exception 'rate_limited'; end if;
  select * into t from app_users where country_code = p_cc and phone = p_phone;
  if t.role = 'master' then raise exception 'invalid_state'; end if;
  if t.role = 'admin' then raise exception 'duplicate'; end if;
  if t.id is not null then
    update app_users set role = 'admin' where id = t.id;
  else
    insert into admin_invites (country_code, phone, invited_by) values (p_cc, p_phone, auth.uid()) on conflict do nothing;
  end if;
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'admin.added', p_cc || right(p_phone, 4));
end $$;

create or replace function master_remove_sub_admin(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_master() then raise exception 'forbidden' using errcode = '42501'; end if;
  update app_users set role = 'user' where id = p_id and role = 'admin';
  if not found then raise exception 'not_found'; end if;
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'admin.removed', p_id::text);
end $$;

create or replace function reset_recovery() returns void
language sql volatile security definer set search_path = public as $$
  delete from recovery_codes;
  update master_security set codes_generated_at = null, backup_country_code = null, backup_phone = null, backup_verified_at = null,
    pending_country_code = null, pending_phone = null, pending_started_at = null, pending_completes_at = null where id;
$$;
revoke all on function reset_recovery() from public, anon, authenticated;

create or replace function master_transfer(p_to uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not is_master() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform assert_recent_login();
  if not exists (select 1 from app_users where id = p_to and role = 'admin' and deleted_at is null and deactivated_at is null) then
    raise exception 'invalid_state';
  end if;
  update app_users set role = 'admin' where id = me;        -- order matters for the one_master index
  update app_users set role = 'master' where id = p_to;
  perform reset_recovery();
  insert into audit_events (actor_id, action, target) values (me, 'master.transferred', p_to::text);
end $$;

-- Returns 10 plaintext codes ONCE; stores bcrypt hashes only.
create or replace function master_generate_recovery_codes() returns text[]
language plpgsql volatile security definer set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; codes text[] := '{}'; c text; b bytea; i int; j int;
begin
  if not is_master() then raise exception 'forbidden' using errcode = '42501'; end if;
  perform assert_recent_login();
  delete from recovery_codes;
  for i in 1..10 loop
    b := gen_random_bytes(8); c := '';
    for j in 0..7 loop c := c || substr(alphabet, (get_byte(b, j) % 32) + 1, 1); end loop;
    c := left(c, 4) || '-' || right(c, 4);
    codes := codes || c;
    insert into recovery_codes (code_hash) values (crypt(replace(c, '-', ''), gen_salt('bf', 10)));
  end loop;
  update master_security set codes_generated_at = now() where id;
  insert into audit_events (actor_id, action) values (auth.uid(), 'master.recovery_codes_generated');
  return codes;
end $$;

-- Called by the Edge Function AFTER it verified an OTP sent to the backup phone (service role only).
create or replace function set_master_backup_phone(p_master uuid, p_cc text, p_phone text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from app_users where id = p_master and role = 'master') then raise exception 'forbidden'; end if;
  if exists (select 1 from app_users where country_code = p_cc and phone = p_phone and (id = p_master or role in ('admin', 'master'))) then
    raise exception 'invalid_state';
  end if;
  update master_security set backup_country_code = p_cc, backup_phone = p_phone, backup_verified_at = now() where id;
  insert into audit_events (actor_id, action) values (p_master, 'master.backup_phone_set');
end $$;
revoke all on function set_master_backup_phone(uuid, text, text) from public, anon, authenticated;

create or replace function complete_master_recovery(p_cc text, p_phone text, p_method text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare target app_users; old uuid;
begin
  select * into target from app_users where country_code = p_cc and phone = p_phone;
  if target.id is null then raise exception 'not_found: the recovering phone must sign in once first'; end if;
  select id into old from app_users where role = 'master';
  update app_users set role = 'user' where id = old and id <> target.id;
  update app_users set role = 'master', deactivated_at = null, deleted_at = null where id = target.id;
  perform reset_recovery();
  insert into audit_events (actor_id, action, target, meta) values (target.id, 'master.recovered', target.id::text, jsonb_build_object('method', p_method, 'previousMaster', old));
  insert into notifications (user_id, type, params, deep_link)
    select id, 'security', jsonb_build_object('event', 'master_recovered'), '/admin' from app_users where role in ('admin', 'master');
end $$;
revoke all on function complete_master_recovery(text, text, text) from public, anon, authenticated;

-- The recovering person signs in with the phone they have now (OTP proves it), then calls this.
create or replace function recover_master(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare me app_users; sec master_security; hit recovery_codes;
begin
  select * into me from app_users where id = auth.uid();
  if me.id is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if (select count(*) from recovery_attempts where at > now() - interval '1 hour') >= 5 then raise exception 'rate_limited'; end if;
  select * into sec from master_security where id;
  if sec.pending_phone is not null then raise exception 'invalid_state: a recovery is already in progress'; end if;
  if me.role = 'master' then raise exception 'invalid_state'; end if;
  select * into hit from recovery_codes
    where used_at is null and code_hash = crypt(upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), code_hash) limit 1;
  if hit.id is null then
    insert into recovery_attempts (phone) values (me.country_code || right(me.phone, 4));
    insert into audit_events (actor_id, action, target) values (me.id, 'master.recovery_failed', me.id::text);
    raise exception 'invalid_recovery_code';
  end if;
  update recovery_codes set used_at = now() where id = hit.id;
  if sec.backup_phone is not null and sec.backup_country_code = me.country_code and sec.backup_phone = me.phone then
    perform complete_master_recovery(me.country_code, me.phone, 'backup_phone');
    return jsonb_build_object('status', 'completed');
  end if;
  update master_security set pending_country_code = me.country_code, pending_phone = me.phone,
    pending_started_at = now(), pending_completes_at = now() + interval '72 hours' where id;
  insert into audit_events (actor_id, action, target) values (me.id, 'master.recovery_started', me.id::text);
  insert into notifications (user_id, type, params, deep_link)
    select id, 'security', jsonb_build_object('event', 'recovery_started'), '/admin' from app_users where role in ('admin', 'master');
  return jsonb_build_object('status', 'pending', 'completesAt', now() + interval '72 hours');
end $$;

create or replace function master_cancel_recovery() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_master() then raise exception 'forbidden' using errcode = '42501'; end if;
  update master_security set pending_country_code = null, pending_phone = null, pending_started_at = null, pending_completes_at = null
  where id and pending_phone is not null;
  if not found then raise exception 'not_found'; end if;
  insert into audit_events (actor_id, action) values (auth.uid(), 'master.recovery_cancelled');
end $$;

-- pg_cron every 5 minutes: finish due recoveries, purge Trash older than 30 days.
create or replace function run_governance_jobs() returns void
language plpgsql volatile security definer set search_path = public as $$
declare sec master_security; r record;
begin
  select * into sec from master_security where id;
  if sec.pending_completes_at is not null and sec.pending_completes_at <= now() then
    perform complete_master_recovery(sec.pending_country_code, sec.pending_phone, 'new_phone_after_delay');
  end if;
  for r in select id from profiles where deleted_at < now() - interval '30 days' loop perform purge_deleted('profile', r.id); end loop;
  for r in select id from app_users where deleted_at < now() - interval '30 days' loop perform purge_deleted('user', r.id); end loop;
end $$;
revoke all on function run_governance_jobs() from public, anon, authenticated;

-- BREAK-GLASS (lost phone AND lost codes AND no backup phone): run manually in the Supabase SQL editor
-- by the technical owner after out-of-band identity verification (two people present, ticket recorded).
create or replace function break_glass_set_master(p_cc text, p_phone text, p_ticket text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if coalesce(p_ticket, '') = '' then raise exception 'ticket reference required'; end if;
  perform complete_master_recovery(p_cc, p_phone, 'break_glass:' || p_ticket);
end $$;
revoke all on function break_glass_set_master(text, text, text) from public, anon, authenticated;

-- grants for app-callable RPCs
grant execute on function is_master() to authenticated;
grant execute on function admin_set_require_approval(boolean) to authenticated;
grant execute on function admin_approve_all_pending() to authenticated;
grant execute on function admin_delete_profile(uuid, text) to authenticated;
grant execute on function admin_delete_user(uuid, text) to authenticated;
grant execute on function admin_set_user_deactivated(uuid, boolean) to authenticated;
grant execute on function admin_delete(text, uuid) to authenticated;
grant execute on function admin_cancel_order(uuid) to authenticated;
grant execute on function master_restore(text, uuid) to authenticated;
grant execute on function master_purge(text, uuid) to authenticated;
grant execute on function master_add_sub_admin(text, text) to authenticated;
grant execute on function master_remove_sub_admin(uuid) to authenticated;
grant execute on function master_transfer(uuid) to authenticated;
grant execute on function master_generate_recovery_codes() to authenticated;
grant execute on function master_cancel_recovery() to authenticated;
grant execute on function recover_master(text) to authenticated;
revoke all on function assert_can_manage(uuid) from public, anon;
