-- Master backup phone, live (task #35). Proving you hold the backup phone must NOT sign that number in
-- (Supabase Auth's OTP would create/sign in an account for it), so the master-backup-phone Edge Function
-- issues its own 6-digit code, sends it on WhatsApp and checks it here. Only a keyed hash of the code is
-- stored (HMAC computed by the function); codes last 10 minutes, 5 attempts, and sends are rate-limited.
-- Both functions are service-role only: the Edge Function has already identified the signed-in caller.

create table if not exists backup_phone_codes (
  master_id uuid primary key references app_users (id) on delete cascade,
  country_code text not null,
  phone text not null,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempts int not null default 0,
  sends timestamptz[] not null default '{}'
);
alter table backup_phone_codes enable row level security;
revoke all on backup_phone_codes from anon, authenticated;

-- Stores a new code for (caller, number). Raises: forbidden (not a master), invalid_state (own login number
-- or another admin's), rate_limited (≥ 60 s between codes, ≤ 5 per hour; HINT = seconds to wait).
create or replace function backup_code_issue(p_master uuid, p_cc text, p_phone text, p_hash text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare r backup_phone_codes; recent timestamptz[]; wait int;
begin
  if not exists (select 1 from app_users where id = p_master and role = 'master' and deleted_at is null) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_cc !~ '^\+[1-9][0-9]{0,3}$' or p_phone !~ '^[0-9]{6,14}$' then raise exception 'validation' using errcode = '22023'; end if;
  if exists (select 1 from app_users where country_code = p_cc and phone = p_phone and (id = p_master or role in ('admin', 'master'))) then
    raise exception 'invalid_state';
  end if;
  select * into r from backup_phone_codes where master_id = p_master for update;
  recent := array(select t from unnest(coalesce(r.sends, '{}')) t where t > now() - interval '1 hour' order by t);
  if array_length(recent, 1) >= 5 then
    wait := ceil(extract(epoch from (recent[1] + interval '1 hour' - now())));
    raise exception 'rate_limited' using hint = wait::text;
  end if;
  if array_length(recent, 1) >= 1 and recent[array_length(recent, 1)] > now() - interval '60 seconds' then
    wait := ceil(extract(epoch from (recent[array_length(recent, 1)] + interval '60 seconds' - now())));
    raise exception 'rate_limited' using hint = wait::text;
  end if;
  insert into backup_phone_codes (master_id, country_code, phone, code_hash, expires_at, attempts, sends)
  values (p_master, p_cc, p_phone, p_hash, now() + interval '10 minutes', 0, recent || now())
  on conflict (master_id) do update set country_code = excluded.country_code, phone = excluded.phone, code_hash = excluded.code_hash,
    expires_at = excluded.expires_at, attempts = 0, sends = excluded.sends;
end $$;

-- Checks a code. Right: saves the backup phone (set_master_backup_phone re-checks the rules), forgets the
-- code, returns true. Wrong: counts the attempt and returns false (a raised error would undo the count).
-- Raises: not_found (no code for that number), otp_expired, rate_limited (5 wrong attempts: new code).
create or replace function backup_code_verify(p_master uuid, p_cc text, p_phone text, p_hash text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare r backup_phone_codes;
begin
  select * into r from backup_phone_codes where master_id = p_master for update;
  if r.master_id is null or r.country_code <> p_cc or r.phone <> p_phone then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.expires_at <= now() then raise exception 'otp_expired'; end if;
  if r.attempts >= 5 then raise exception 'rate_limited'; end if;
  if r.code_hash <> p_hash then
    update backup_phone_codes set attempts = attempts + 1 where master_id = p_master;
    insert into audit_events (actor_id, action) values (p_master, 'master.backup_code_failed');
    return false;
  end if;
  delete from backup_phone_codes where master_id = p_master;
  perform set_master_backup_phone(p_master, p_cc, p_phone);
  return true;
end $$;

revoke all on function backup_code_issue(uuid, text, text, text) from public, anon, authenticated;
revoke all on function backup_code_verify(uuid, text, text, text) from public, anon, authenticated;
grant execute on function backup_code_issue(uuid, text, text, text) to service_role;
grant execute on function backup_code_verify(uuid, text, text, text) to service_role;
