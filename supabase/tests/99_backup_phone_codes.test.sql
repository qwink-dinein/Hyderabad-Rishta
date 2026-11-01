\set ON_ERROR_STOP on
-- Master backup phone codes (task #35): only the master, never their own or another admin's number,
-- keyed hashes only, 10-minute expiry, 5 attempts, 60 s between sends and 5 per hour, service role only.
reset role;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000cd02', '919766600002');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-00000000cd02', '+91', '9766600002');
select set_config('test.master', id::text, false), set_config('test.mcc', country_code, false), set_config('test.mphone', phone, false)
from app_users where role = 'master' order by created_at limit 1;
\set h1 '1111111111111111111111111111111111111111111111111111111111111111'
\set h2 '2222222222222222222222222222222222222222222222222222222222222222'

do $$ declare m uuid := current_setting('test.master')::uuid; begin
  begin perform backup_code_issue('00000000-0000-0000-0000-00000000cd02', '+91', '9555500001', repeat('1', 64)); assert false, 'non-master';
  exception when insufficient_privilege then null; end;
  begin perform backup_code_issue(m, current_setting('test.mcc'), current_setting('test.mphone'), repeat('1', 64)); assert false, 'own number';
  exception when raise_exception then assert sqlerrm = 'invalid_state', sqlerrm; end;
  begin perform backup_code_issue(m, '+91', 'abc', repeat('1', 64)); assert false, 'bad number';
  exception when invalid_parameter_value then null; end;
  begin perform backup_code_issue(m, '+91', '9555500001', 'not-a-hash'); assert false, 'raw code stored';
  exception when check_violation then null; end;
end $$;

-- Issue, resend too soon, wrong code (counted), right code (saved, forgotten).
select backup_code_issue(current_setting('test.master')::uuid, '+91', '9555500001', :'h1');
do $$ declare m uuid := current_setting('test.master')::uuid; begin
  begin perform backup_code_issue(m, '+91', '9555500001', repeat('3', 64)); assert false, 'resend within 60 s';
  exception when raise_exception then assert sqlerrm = 'rate_limited', sqlerrm; end;
  begin perform backup_code_verify(m, '+91', '9555500009', repeat('1', 64)); assert false, 'another number';
  exception when no_data_found then null; end;
  assert backup_code_verify(m, '+91', '9555500001', repeat('2', 64)) = false, 'wrong code refused';
  assert (select attempts from backup_phone_codes where master_id = m) = 1, 'wrong attempt counted (not rolled back)';
  assert backup_code_verify(m, '+91', '9555500001', repeat('1', 64)) = true, 'right code accepted';
  assert (select backup_phone from master_security) = '9555500001', 'backup phone saved';
  assert not exists (select 1 from backup_phone_codes where master_id = m), 'code forgotten after use';
  begin perform backup_code_verify(m, '+91', '9555500001', repeat('1', 64)); assert false, 'code reused';
  exception when no_data_found then null; end;
end $$;

-- Expiry and the 5-attempt limit.
update backup_phone_codes set sends = '{}' where true;
insert into backup_phone_codes (master_id, country_code, phone, code_hash, expires_at)
  values (current_setting('test.master')::uuid, '+91', '9555500002', :'h2', now() - interval '1 second')
  on conflict (master_id) do update set country_code = excluded.country_code, phone = excluded.phone, code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0;
do $$ declare m uuid := current_setting('test.master')::uuid; begin
  begin perform backup_code_verify(m, '+91', '9555500002', repeat('2', 64)); assert false, 'expired accepted';
  exception when raise_exception then assert sqlerrm = 'otp_expired', sqlerrm; end;
  update backup_phone_codes set expires_at = now() + interval '5 minutes', attempts = 5 where master_id = m;
  begin perform backup_code_verify(m, '+91', '9555500002', repeat('2', 64)); assert false, 'sixth attempt';
  exception when raise_exception then assert sqlerrm = 'rate_limited', sqlerrm; end;
  -- Five sends in the last hour (the latest over a minute ago): the sixth waits.
  update backup_phone_codes set sends = array[now() - interval '50 minutes', now() - interval '40 minutes', now() - interval '30 minutes',
    now() - interval '20 minutes', now() - interval '10 minutes'] where master_id = m;
  begin perform backup_code_issue(m, '+91', '9555500002', repeat('4', 64)); assert false, 'sixth send in an hour';
  exception when raise_exception then assert sqlerrm = 'rate_limited', sqlerrm; end;
end $$;

-- Apps can neither call these functions nor read the codes.
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.master'), false);
do $$ begin
  begin perform backup_code_issue(auth.uid(), '+91', '9555500003', repeat('1', 64)); assert false, 'app issued a code';
  exception when insufficient_privilege then null; end;
  begin perform backup_code_verify(auth.uid(), '+91', '9555500003', repeat('1', 64)); assert false, 'app verified a code';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from backup_phone_codes; assert false, 'app read codes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL BACKUP-PHONE-CODE TESTS PASSED' as result;
