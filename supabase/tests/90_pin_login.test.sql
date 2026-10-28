\set ON_ERROR_STOP on
-- OTP registration + PIN login, attacked and exercised at the database level.
reset role;
create temp table pin_results (name text, ok boolean);
grant all on pin_results to anon, authenticated, service_role;
create or replace function pk(n text, ok boolean) returns void language sql as $$ insert into pin_results values (n, coalesce(ok, false)) $$;
create or replace function pk_fails(q text) returns boolean language plpgsql as $$ begin execute q; return false; exception when others then return true; end $$;
grant execute on function pk(text, boolean), pk_fails(text) to anon, authenticated, service_role;
-- Simulates the JWT Supabase issues: an OTP `amr` entry (seconds ago) and a session id.
create or replace function as_member(uid uuid, otp_age_s int, sess uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
  perform set_config('request.jwt.claims', case when otp_age_s is null then jsonb_build_object('session_id', sess)
    else jsonb_build_object('session_id', sess, 'amr', jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint - otp_age_s))) end::text, false);
end $$;
grant execute on function as_member(uuid, int, uuid) to anon, authenticated, service_role;

insert into auth.users values ('00000000-0000-0000-0000-0000000009a1'), ('00000000-0000-0000-0000-0000000009b1');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000009a1', '+91', '9888800001'), ('00000000-0000-0000-0000-0000000009b1', '+91', '9888800002');
-- Member A is signed in on two phones (sessions s1, s2).
insert into auth.sessions (id, user_id) values ('a0000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a1'), ('a0000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009a1');

set role authenticated;
-- ── PIN setup needs a fresh OTP ──
select as_member('00000000-0000-0000-0000-0000000009a1', null, 'a0000000-0000-0000-0000-0000000009a1');
select pk('no OTP in this session → cannot create a PIN', (set_pin('4827') ->> 'error') = 'otp_required');
select pk('no OTP → cannot trust a device', pk_fails($q$select trust_device('d0000000-0000-0000-0000-0000000009a1', repeat('a', 64), 'ios')$q$));
select as_member('00000000-0000-0000-0000-0000000009a1', 3600, 'a0000000-0000-0000-0000-0000000009a1');
select pk('OTP an hour ago → still refused', (set_pin('4827') ->> 'error') = 'otp_required');
select as_member('00000000-0000-0000-0000-0000000009a1', 30, 'a0000000-0000-0000-0000-0000000009a1');
select pk('weak PIN refused', (set_pin('1234') ->> 'message') = 'pin.tooEasy');
select pk('3-digit PIN refused', (set_pin('482') ->> 'message') = 'pin.mustBe4');
select pk('fresh OTP → PIN created', (set_pin('4827') ->> 'ok')::boolean);
select trust_device('d0000000-0000-0000-0000-0000000009a1', repeat('k', 64), 'ios');
select pk('the same OTP cannot set a second PIN', (set_pin('5931') ->> 'error') = 'otp_required');

-- ── Members can never read PIN data or call the login check ──
select pk('member cannot read PIN hashes', pk_fails('select * from login_pins'));
select pk('member cannot read device keys', pk_fails('select * from trusted_devices'));
select pk('member cannot read failures', pk_fails('select * from pin_failures'));
select pk('member cannot call the login check', pk_fails($q$select pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '4827')$q$));
select pk('member cannot call the attempt helper', pk_fails($q$select pin_attempt('00000000-0000-0000-0000-0000000009a1', '4827', null)$q$));
select pk('get_pin_status works for self', (get_pin_status() ->> 'has_pin')::boolean);
reset role;
set role anon;
select pk('anon cannot set a PIN', pk_fails($q$select set_pin('4827')$q$));
select pk('anon cannot call the login check', pk_fails($q$select pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '4827')$q$));
reset role;
select pk('first PIN did not sign out the other phone', (select count(*) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000009a1') = 2);
select pk('PIN stored as bcrypt, never plain', (select pin_hash like '$2%' and pin_hash <> '4827' from login_pins where user_id = '00000000-0000-0000-0000-0000000009a1'));
select pk('device key stored only as a hash', (select secret_hash <> repeat('k', 64) and char_length(secret_hash) = 64 from trusted_devices where user_id = '00000000-0000-0000-0000-0000000009a1'));

-- ── Returning login (Edge Function, service role) ──
set role service_role;
select pk('right number + trusted device + right PIN → ok', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '4827') ->> 'ok')::boolean);
select pk('PIN alone from another phone → device_not_trusted', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009ff', repeat('k', 64), '4827') ->> 'error') = 'device_not_trusted');
select pk('right device id, wrong device key → device_not_trusted', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('x', 64), '4827') ->> 'error') = 'device_not_trusted');
select pk('unknown number looks the same (no probing)', (pin_login_check('+91', '9888800099', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '4827') ->> 'error') = 'device_not_trusted');
select pk('wrong PIN → attempts left 4', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '0000') ->> 'attempts_left') = '4');
select pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '0000') from generate_series(1, 3);
select pk('5th wrong PIN → locked with a retry time', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '0000') ->> 'retry_at') is not null);
select pk('while locked even the right PIN is refused', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '4827') ->> 'error') = 'pin_locked');
reset role;
select pk('failures were committed (not rolled back)', (select count(*) from pin_failures where user_id = '00000000-0000-0000-0000-0000000009a1') = 5);
update login_pins set locked_until = now() - interval '1 second' where user_id = '00000000-0000-0000-0000-0000000009a1'; -- 15 minutes pass
set role service_role;
select pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '1111') from generate_series(1, 4);
select pk('10 wrong in a day → only an OTP reset unlocks', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '1111') ->> 'reset') = 'true');
reset role;
update login_pins set locked_until = null where user_id = '00000000-0000-0000-0000-0000000009a1';
set role service_role;
select pk('hard lock holds even after the short lock ends', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '4827') ->> 'error') = 'pin_locked');
reset role;

-- ── Forgot PIN: new OTP → new PIN, other phones signed out, lock cleared ──
set role authenticated;
select as_member('00000000-0000-0000-0000-0000000009a1', 5, 'a0000000-0000-0000-0000-0000000009a1');
select pk('a NEW OTP allows the reset', (set_pin('5931') ->> 'ok')::boolean);
reset role;
select pk('reset signed out the other phone, kept this one', (select array_agg(id::text) from auth.sessions where user_id = '00000000-0000-0000-0000-0000000009a1') = array['a0000000-0000-0000-0000-0000000009a1']);
set role service_role;
select pk('after reset: old PIN refused', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '4827') ->> 'error') = 'invalid_pin');
select pk('after reset: new PIN works', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '5931') ->> 'ok')::boolean);
reset role;

-- ── Change PIN with the current PIN (no OTP) ──
set role authenticated;
select as_member('00000000-0000-0000-0000-0000000009a1', null, 'a0000000-0000-0000-0000-0000000009a1');
select pk('change needs the current PIN', (set_pin('7140') ->> 'error') = 'otp_required');
select pk('wrong current PIN counts as an attempt', (set_pin('7140', '0000') ->> 'attempts_left') = '4');
select pk('right current PIN changes it', (set_pin('7140', '5931') ->> 'ok')::boolean);
reset role;

-- ── Suspension revokes sessions and blocks PIN login ──
insert into auth.sessions (id, user_id) values ('a0000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-0000000009a1');
update app_users set deactivated_at = now(), deactivated_by = '00000000-0000-0000-0000-0000000009b1' where id = '00000000-0000-0000-0000-0000000009a1';
select pk('suspension signed the member out everywhere', not exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-0000000009a1'));
set role service_role;
select pk('suspended member cannot log in with the PIN', (pin_login_check('+91', '9888800001', 'd0000000-0000-0000-0000-0000000009a1', repeat('k', 64), '7140') ->> 'error') = 'account_suspended');
reset role;

do $$
declare bad text;
begin
  select string_agg('  ✗ ' || name, E'\n') into bad from pin_results where not ok;
  if bad is not null then raise exception E'PIN LOGIN CHECKS FAILED:\n%', bad; end if;
end $$;
select 'ALL PIN LOGIN TESTS PASSED (' || count(*) || ' checks)' as result from pin_results;
