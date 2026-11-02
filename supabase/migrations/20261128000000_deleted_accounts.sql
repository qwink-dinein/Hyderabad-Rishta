-- Deleted accounts: an admin-only copy kept for 30 days (owner decision 2026-11-02).
--
-- When a member permanently deletes their own account, admins are told WHO it was (name + member code)
-- and can open the full profile, including photos, for 30 days (safety / fraud / complaint checks). After
-- 30 days the copy and the photos are erased automatically. The member is told this on the delete screen
-- and in the privacy policy. Phone numbers stay masked, as everywhere else in the admin console.
--
-- * The copy is taken by the existing BEFORE DELETE trigger on app_users (the biodata still exists then).
-- * Photos stay in their private folder (profile-photos/<old user id>/…): delete-account no longer removes
--   them right away. Admins can already get short-lived links for any photo path (photo_paths_for).
-- * Storage files cannot be deleted from SQL, so a daily job calls the `purge-deleted-accounts` edge
--   function, which erases the expired photos through the Storage API and then the expired rows.

create table if not exists deleted_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                 -- the old account id (the account itself no longer exists)
  code text,
  full_name text,
  phone_masked text not null default '',
  joined_at timestamptz,
  profile jsonb,                          -- the profiles row as it was (biodata, status, code…)
  photo_paths text[] not null default '{}',
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null default now() + interval '30 days'
);
create index if not exists deleted_accounts_purge_idx on deleted_accounts (purge_after);
alter table deleted_accounts enable row level security; -- no policies: admins read through the functions below

-- A member deleting their own account (hard delete): keep the 30-day copy and alert the admins by name.
-- Purging something already in Trash (admin action) does neither, as before.
create or replace function trg_alert_account_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  snap_id uuid;
  nm text;
begin
  if old.deleted_at is null and old.role = 'user' then
    select * into p from profiles where user_id = old.id;
    nm := nullif(trim(p.biodata #>> '{basic,fullName}'), '');
    insert into deleted_accounts (user_id, code, full_name, phone_masked, joined_at, profile, photo_paths)
    values (
      old.id, p.code, nm, masked_phone(old.country_code, old.phone), old.created_at,
      case when p.id is not null then to_jsonb(p) end,
      coalesce((select array_agg(x ->> 'uri') from jsonb_array_elements(coalesce(p.biodata -> 'photos', '[]'::jsonb)) x
                where coalesce(x ->> 'uri', '') <> ''), '{}')
    )
    returning id into snap_id;
    perform alert_admins('account_deleted',
      jsonb_build_object('code', coalesce(p.code, '—'), 'name', coalesce(nm, '')),
      '/admin/deleted/' || snap_id);
  end if;
  return old;
end $$;

-- Admin list (newest first) and one full copy. Viewing a copy is written to the audit log.
create or replace function admin_deleted_accounts() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select jsonb_build_object(
    'id', d.id, 'code', d.code, 'fullName', d.full_name, 'phoneMasked', d.phone_masked,
    'joinedAt', d.joined_at, 'deletedAt', d.deleted_at, 'purgeAt', d.purge_after,
    'profileStatus', d.profile ->> 'status', 'profileType', d.profile ->> 'profile_type',
    'photoCount', coalesce(array_length(d.photo_paths, 1), 0))
  from deleted_accounts d
  where d.purge_after > now()
  order by d.deleted_at desc
  limit 500;
end $$;
revoke all on function admin_deleted_accounts() from public, anon;
grant execute on function admin_deleted_accounts() to authenticated;

create or replace function admin_deleted_account(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := admin_require();
  d deleted_accounts;
begin
  select * into d from deleted_accounts where id = p_id and purge_after > now();
  if d.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_events (actor_id, action, target, meta) values (me, 'deleted_account.viewed', d.user_id::text, jsonb_build_object('code', d.code));
  return jsonb_build_object(
    'id', d.id, 'code', d.code, 'fullName', d.full_name, 'phoneMasked', d.phone_masked,
    'joinedAt', d.joined_at, 'deletedAt', d.deleted_at, 'purgeAt', d.purge_after,
    'profileStatus', d.profile ->> 'status', 'profileType', d.profile ->> 'profile_type',
    'photoCount', coalesce(array_length(d.photo_paths, 1), 0),
    'profile', d.profile);
end $$;
revoke all on function admin_deleted_account(uuid) from public, anon;
grant execute on function admin_deleted_account(uuid) to authenticated;

-- For the purge job (service role only): expired copies and their photo paths.
create or replace function due_deleted_account_purges(p_limit int default 100)
returns table (id uuid, photo_paths text[])
language sql stable security definer set search_path = public as $$
  select d.id, d.photo_paths from deleted_accounts d where d.purge_after <= now()
  order by d.purge_after limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
revoke all on function due_deleted_account_purges(int) from public, anon, authenticated;

create or replace function finish_deleted_account_purge(p_ids uuid[]) returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  delete from deleted_accounts where id = any(p_ids) and purge_after <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function finish_deleted_account_purge(uuid[]) from public, anon, authenticated;

-- Job secrets live in Supabase Vault (never in code or chat). Same helper as the reminders job.
create or replace function check_job_secret(p_name text, p_secret text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  want text;
begin
  if to_regclass('vault.decrypted_secrets') is null or coalesce(length(p_secret), 0) < 32 then return false; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into want using 'job_secret_' || p_name;
  return want is not null and want = p_secret;
end $$;
revoke all on function check_job_secret(text, text) from public, anon, authenticated;

-- Daily at 03:13 IST: call the purge function with the Vault secret. Guarded so local test databases
-- without pg_cron / pg_net / Vault skip it.
do $$
declare
  base text := 'https://hlthzrznuztapfsloxkm.supabase.co';
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regclass('vault.secrets') is null then
    raise notice 'pg_cron / pg_net / vault not available — skipping the purge schedule';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  if not exists (select 1 from vault.secrets where name = 'job_secret_purge_deleted_accounts') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'job_secret_purge_deleted_accounts', 'purge-deleted-accounts cron → edge function');
  end if;
  perform cron.schedule('hr-deleted-accounts-purge', '43 21 * * *', format($q$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-job-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'job_secret_purge_deleted_accounts' limit 1)),
      body := '{}'::jsonb)$q$, base || '/functions/v1/purge-deleted-accounts'));
end $$;
