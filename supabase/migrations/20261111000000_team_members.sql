-- Team-added members (owner request 2026-10-29): admins and sub-admins add a member for any phone
-- number without an OTP; the number's owner later signs in with OTP and gets that same account and
-- biodata. One number = one account = one biodata still holds (unique phone, one profile per user).
--
-- Flow (production):
--   1. Admin app → Edge Function `admin-create-member` (caller's JWT). It checks the caller is an admin,
--      creates the Supabase Auth user for the phone (Auth admin API), then calls admin_create_member()
--      with the service role. The auth user and app_users row share one id.
--   2. Later the owner signs in with phone OTP: Supabase Auth finds that same user by phone, so the
--      session IS that account. The client then calls claim_account() once.
--   3. While unclaimed, admins edit/publish with admin_save_member_biodata / admin_publish_member.

alter table app_users add column if not exists created_by uuid references app_users (id);
alter table app_users add column if not exists claimed_at timestamptz;
alter table profiles add column if not exists created_by_admin uuid references app_users (id);
alter table profiles add column if not exists owner_reviewed_at timestamptz;

-- Members can never mark their own biodata as team-made (inserts by members are hardened).
create or replace function harden_profile_insert() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.status := 'draft';
    new.boost_until := null;
    new.boost_started_at := null;
    new.boost_notices := '{}';
    new.published_at := null;
    new.deleted_at := null;
    new.admin_note := null;
    new.created_by_admin := null;
    new.owner_reviewed_at := null;
    new.code := 'HR-' || nextval('profile_code_seq');
  end if;
  return new;
end $$;

create or replace function caller_is_admin(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where id = p_user and role in ('admin', 'master') and deactivated_at is null and deleted_at is null);
$$;
revoke all on function caller_is_admin(uuid) from public, anon, authenticated;

-- Step 1b (service role only, called by the Edge Function after creating the auth user).
create or replace function admin_create_member(p_admin uuid, p_user uuid, p_country_code text, p_phone text, p_biodata jsonb, p_last_step int)
returns profiles language plpgsql volatile security definer set search_path = public as $$
declare p profiles;
begin
  if not caller_is_admin(p_admin) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from app_users where country_code = p_country_code and phone = p_phone) then raise exception 'phone_taken'; end if;
  if coalesce(trim(p_biodata #>> '{basic,fullName}'), '') = '' then raise exception 'validation'; end if;
  insert into app_users (id, country_code, phone, role, created_by) values (p_user, p_country_code, p_phone, 'user', p_admin);
  insert into profiles (user_id, biodata, status, last_step, created_by_admin)
  values (p_user, p_biodata, 'draft', greatest(0, least(7, coalesce(p_last_step, 0))), p_admin)
  returning * into p;
  insert into audit_events (actor_id, action, target, meta)
  values (p_admin, 'member.created_by_team', p_user::text, jsonb_build_object('code', p.code, 'last_digits', right(p_phone, 4)));
  return p;
end $$;
revoke all on function admin_create_member(uuid, uuid, text, text, jsonb, int) from public, anon, authenticated;
grant execute on function admin_create_member(uuid, uuid, text, text, jsonb, int) to service_role;

-- A team-added biodata the calling admin may still edit (not deleted, owner hasn't claimed it).
create or replace function team_profile_for_edit(p_profile uuid) returns profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into p from profiles where id = p_profile and deleted_at is null and created_by_admin is not null;
  if p.id is null then raise exception 'not_found'; end if;
  if exists (select 1 from app_users where id = p.user_id and (claimed_at is not null or deleted_at is not null)) then raise exception 'invalid_state'; end if;
  return p;
end $$;
revoke all on function team_profile_for_edit(uuid) from public, anon, authenticated;

create or replace function admin_save_member_biodata(p_profile uuid, p_biodata jsonb, p_last_step int)
returns profiles language plpgsql volatile security definer set search_path = public as $$
declare p profiles;
begin
  p := team_profile_for_edit(p_profile);
  update profiles set biodata = p_biodata, last_step = greatest(last_step, least(7, greatest(0, coalesce(p_last_step, 0)))),
    status = case when status = 'rejected' then 'draft' else status end, updated_at = now()
  where id = p.id returning * into p;
  insert into audit_events (actor_id, action, target, meta) values (auth.uid(), 'member.biodata_edited_by_team', p.user_id::text, jsonb_build_object('code', p.code));
  return p;
end $$;
revoke all on function admin_save_member_biodata(uuid, jsonb, int) from public, anon;
grant execute on function admin_save_member_biodata(uuid, jsonb, int) to authenticated;

-- The team entered and checked it: live at once (no approval queue, no fee). Needs the core fields.
create or replace function admin_publish_member(p_profile uuid)
returns profiles language plpgsql volatile security definer set search_path = public as $$
declare p profiles;
begin
  p := team_profile_for_edit(p_profile);
  if p.last_step < 7 or coalesce(p.biodata #>> '{basic,lookingFor}', '') = '' or coalesce(p.biodata #>> '{basic,dob}', '') = ''
     or coalesce(p.biodata #>> '{location,city}', '') = '' then
    raise exception 'incomplete_biodata';
  end if;
  if p.status <> 'published' then
    update profiles set status = 'published', published_at = coalesce(published_at, now()), admin_note = null, updated_at = now()
    where id = p.id returning * into p;
    insert into notifications (user_id, type, deep_link) values (p.user_id, 'team_created', '/biodata/preview');
    insert into audit_events (actor_id, action, target, meta) values (auth.uid(), 'member.published_by_team', p.user_id::text, jsonb_build_object('code', p.code));
  end if;
  return p;
end $$;
revoke all on function admin_publish_member(uuid) from public, anon;
grant execute on function admin_publish_member(uuid) to authenticated;

-- Step 2: the owner's first OTP sign-in claims the account (idempotent; no-op for normal accounts).
create or replace function claim_account() returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  update app_users set claimed_at = now() where id = auth.uid() and created_by is not null and claimed_at is null;
  get diagnostics n = row_count;
  if n > 0 then insert into audit_events (actor_id, action, target) values (auth.uid(), 'member.claimed', auth.uid()::text); end if;
  return n > 0;
end $$;
revoke all on function claim_account() from public, anon;
grant execute on function claim_account() to authenticated;

-- The owner saving their team-made biodata once ends the "please review" note.
create or replace function trg_owner_reviewed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by_admin is not null and new.owner_reviewed_at is null and auth.uid() = new.user_id and new.biodata is distinct from old.biodata then
    new.owner_reviewed_at := now();
  end if;
  return new;
end $$;
revoke all on function trg_owner_reviewed() from public, anon, authenticated;
drop trigger if exists profiles_owner_reviewed on profiles;
create trigger profiles_owner_reviewed before update of biodata on profiles for each row execute function trg_owner_reviewed();
