-- OTP registration + 4-digit PIN login (Mini PRD 2026-10-28). Architecture.md §16.
--
--  * OTP (Supabase Auth phone OTP) proves the number: registration, a new phone, Forgot PIN, and the
--    first PIN on an older account. The JWT's `amr` claim records that OTP and when it happened.
--  * After an OTP the app registers this phone as trusted (a random device key; only its SHA-256 is
--    stored) and the member creates a PIN (bcrypt).
--  * Returning login = the `pin-login` Edge Function → pin_login_check(): number + trusted device key +
--    PIN. A PIN alone (other phone) never works. Wrong PINs are counted here, server-side: 5 in a row
--    → 15 min lock; 10 in 24 h → only Forgot PIN (OTP) unlocks. This function never raises on a wrong
--    PIN, so the counters are committed (a raise would roll them back).
--  * Resetting/changing the PIN deletes the member's other auth.sessions (signs out other phones);
--    an admin suspension deletes all of them.
--  * Nothing here is readable by members: tables have RLS on and no policies; the login check is
--    service-role only.

create table if not exists login_pins (
  user_id uuid primary key references app_users (id) on delete cascade,
  pin_hash text not null,
  set_at timestamptz not null default now(),
  streak int not null default 0,
  locked_until timestamptz,
  hard_locked boolean not null default false,
  otp_used_at timestamptz -- the OTP (amr timestamp) already used to set a PIN: one PIN change per OTP
);
create table if not exists pin_failures (
  user_id uuid not null references app_users (id) on delete cascade,
  device_id uuid,
  at timestamptz not null default now()
);
create index if not exists pin_failures_user_idx on pin_failures (user_id, at desc);
create table if not exists trusted_devices (
  id uuid not null,
  user_id uuid not null references app_users (id) on delete cascade,
  secret_hash text not null,
  platform text check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (id, user_id)
);
alter table login_pins enable row level security;
alter table pin_failures enable row level security;
alter table trusted_devices enable row level security;
revoke all on login_pins, pin_failures, trusted_devices from anon, authenticated;

-- When did this session's OTP happen? (Supabase puts {method:'otp', timestamp} in the JWT's amr.)
create or replace function jwt_otp_at() returns timestamptz
language sql stable set search_path = public as $$
  select to_timestamp(max((e ->> 'timestamp')::bigint))
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
  where e ->> 'method' in ('otp', 'sms', 'phone')
$$;

-- Same rule as src/domain/auth.ts pinProblem().
create or replace function pin_problem(p text) returns text
language plpgsql immutable set search_path = public as $$
declare d int[]; step int;
begin
  if p is null or p !~ '^[0-9]{4}$' then return 'pin.mustBe4'; end if;
  if p ~ '^([0-9])\1{3}$' or p = any (array['1234','4321','0123','3210','1122','1212','6969','1010','2580','0852','1004','2000','2020','2024','2025','2026']) then return 'pin.tooEasy'; end if;
  d := array[substr(p,1,1)::int, substr(p,2,1)::int, substr(p,3,1)::int, substr(p,4,1)::int];
  step := d[2] - d[1];
  if step in (1, -1) and d[3] - d[2] = step and d[4] - d[3] = step then return 'pin.tooEasy'; end if;
  return null;
end $$;

-- Checks a PIN against the lockout and records the outcome. Never raises for a wrong PIN.
create or replace function pin_attempt(p_user uuid, p_pin text, p_device uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare p login_pins; fails int; v_streak int;
begin
  select * into p from login_pins where user_id = p_user for update;
  if p.user_id is null then return jsonb_build_object('ok', false, 'error', 'pin_not_set'); end if;
  if p.hard_locked then return jsonb_build_object('ok', false, 'error', 'pin_locked', 'reset', true); end if;
  if p.locked_until > now() then return jsonb_build_object('ok', false, 'error', 'pin_locked', 'retry_at', p.locked_until); end if;
  if crypt(p_pin, p.pin_hash) = p.pin_hash then
    update login_pins set streak = 0, locked_until = null where user_id = p_user;
    delete from pin_failures where user_id = p_user;
    return jsonb_build_object('ok', true);
  end if;
  insert into pin_failures (user_id, device_id) values (p_user, p_device);
  select count(*) into fails from pin_failures where user_id = p_user and at > now() - interval '24 hours';
  v_streak := p.streak + 1;
  update login_pins set streak = v_streak,
    hard_locked = fails >= 10,
    locked_until = case when v_streak % 5 = 0 then now() + interval '15 minutes' else login_pins.locked_until end
  where user_id = p_user;
  insert into audit_events (actor_id, action, target, meta) values (p_user, 'pin.failed', p_user::text, jsonb_build_object('streak', v_streak));
  if fails >= 10 then return jsonb_build_object('ok', false, 'error', 'pin_locked', 'reset', true); end if;
  if v_streak % 5 = 0 then return jsonb_build_object('ok', false, 'error', 'pin_locked', 'retry_at', now() + interval '15 minutes'); end if;
  return jsonb_build_object('ok', false, 'error', 'invalid_pin', 'attempts_left', 5 - v_streak % 5);
end $$;

-- Right after an OTP: remember this phone (device key) for PIN login.
create or replace function trust_device(p_device_id uuid, p_secret text, p_platform text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare otp timestamptz := jwt_otp_at();
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if otp is null or otp < now() - interval '10 minutes' then raise exception 'otp_required' using errcode = '42501'; end if;
  if p_secret is null or char_length(p_secret) not between 32 and 200 then raise exception 'validation' using errcode = '22023'; end if;
  insert into trusted_devices (id, user_id, secret_hash, platform)
  values (p_device_id, auth.uid(), encode(digest(p_secret, 'sha256'), 'hex'), p_platform)
  on conflict (id, user_id) do update set secret_hash = excluded.secret_hash, revoked_at = null, last_used_at = now();
end $$;

-- Create / reset (right after an OTP, once per OTP) or change (with the current PIN).
-- Reset/change signs out every other session of this member. Returns {ok} or {ok:false,error,...}.
create or replace function set_pin(p_pin text, p_current text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); otp timestamptz := jwt_otp_at(); p login_pins; fresh boolean; problem text; chk jsonb;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  problem := pin_problem(p_pin);
  if problem is not null then return jsonb_build_object('ok', false, 'error', 'validation', 'message', problem); end if;
  select * into p from login_pins where user_id = me;
  fresh := otp is not null and otp > now() - interval '10 minutes' and p.otp_used_at is distinct from otp;
  if not fresh then
    if p.user_id is null or p_current is null then return jsonb_build_object('ok', false, 'error', 'otp_required'); end if;
    chk := pin_attempt(me, p_current, null);
    if not (chk ->> 'ok')::boolean then return chk; end if;
  end if;
  insert into login_pins (user_id, pin_hash, otp_used_at) values (me, crypt(p_pin, gen_salt('bf', 10)), case when fresh then otp end)
  on conflict (user_id) do update set pin_hash = excluded.pin_hash, set_at = now(), streak = 0, locked_until = null, hard_locked = false,
    otp_used_at = coalesce(excluded.otp_used_at, login_pins.otp_used_at);
  delete from pin_failures where user_id = me;
  if p.user_id is not null then
    delete from auth.sessions where user_id = me and id is distinct from nullif(auth.jwt() ->> 'session_id', '')::uuid;
  end if;
  insert into audit_events (actor_id, action, target) values (me, case when p.user_id is null then 'pin.created' when fresh then 'pin.reset' else 'pin.changed' end, me::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function get_pin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('has_pin', exists (select 1 from login_pins where user_id = auth.uid()))
$$;

-- Returning login (called ONLY by the pin-login Edge Function with the service role).
create or replace function pin_login_check(p_country_code text, p_phone text, p_device_id uuid, p_device_secret text, p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare u app_users; d trusted_devices; r jsonb;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' or p_device_secret is null or char_length(p_device_secret) not between 32 and 200 then
    return jsonb_build_object('ok', false, 'error', 'validation');
  end if;
  select * into u from app_users where country_code || phone = p_country_code || p_phone;
  if u.id is not null then
    select * into d from trusted_devices where id = p_device_id and user_id = u.id and revoked_at is null;
  end if;
  -- Unknown number, other phone or wrong device key all look the same (no account probing).
  if u.id is null or d.id is null or d.secret_hash <> encode(digest(p_device_secret, 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'error', 'device_not_trusted');
  end if;
  if u.deleted_at is not null then return jsonb_build_object('ok', false, 'error', 'account_removed'); end if;
  if u.deactivated_at is not null and u.deactivated_by is distinct from u.id then return jsonb_build_object('ok', false, 'error', 'account_suspended'); end if;
  r := pin_attempt(u.id, p_pin, p_device_id);
  if not (r ->> 'ok')::boolean then return r; end if;
  update trusted_devices set last_used_at = now() where id = d.id and user_id = u.id;
  if u.deactivated_at is not null then update app_users set deactivated_at = null, deactivated_by = null where id = u.id; end if; -- self-deactivation ends on login
  insert into audit_events (actor_id, action, target) values (u.id, 'pin.login', u.id::text);
  return jsonb_build_object('ok', true, 'user_id', u.id, 'phone', u.country_code || u.phone);
end $$;

-- An admin suspension signs the member out everywhere.
create or replace function trg_suspend_revokes_sessions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deactivated_at is not null and old.deactivated_at is null and new.deactivated_by is distinct from new.id then
    delete from auth.sessions where user_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists app_users_suspend_revokes on app_users;
create trigger app_users_suspend_revokes after update of deactivated_at on app_users for each row execute function trg_suspend_revokes_sessions();

revoke all on function jwt_otp_at(), pin_problem(text), pin_attempt(uuid, text, uuid), trust_device(uuid, text, text), set_pin(text, text),
  get_pin_status(), pin_login_check(text, text, uuid, text, text), trg_suspend_revokes_sessions() from public, anon, authenticated;
grant execute on function trust_device(uuid, text, text), set_pin(text, text), get_pin_status() to authenticated;
grant execute on function pin_login_check(text, text, uuid, text, text) to service_role;
