\set ON_ERROR_STOP on
-- Runs after 10_rls_privacy (same DB). Users: a (member), b (member), c (master after upgrade), d (sub-admin).
reset role;
-- Fixtures below use arbitrary boost prices/lengths to test other rules; 98_boost_plans tests the price guard.
alter table orders disable trigger orders_boost_terms;
update app_users set role = 'master' where id = '00000000-0000-0000-0000-00000000000c';
insert into auth.users values ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-00000000000e');
insert into app_users (id, country_code, phone, role) values
 ('00000000-0000-0000-0000-00000000000d', '+91', '9000000009', 'admin'),
 ('00000000-0000-0000-0000-00000000000e', '+91', '9888800000', 'user');
-- grants for new tables (Supabase default privileges do this for real projects)
grant select on master_security, admin_invites to authenticated;

-- single-master invariant is enforced by the database itself
do $$ begin
  begin update app_users set role = 'master' where id = '00000000-0000-0000-0000-00000000000d'; assert false, 'second master allowed';
  exception when unique_violation then null; end;
end $$;

set role authenticated;
-- sub-admin d
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000d', false);
select set_config('request.jwt.claims', json_build_object('iat', extract(epoch from now())::bigint)::text, false);
do $$ begin
  perform admin_set_require_approval(true);
  perform admin_delete_profile('10000000-0000-0000-0000-00000000000b', 'test');
  begin perform master_add_sub_admin('+91', '9111111111'); assert false, 'sub-admin added admin'; exception when insufficient_privilege then null; end;
  begin perform admin_delete_user('00000000-0000-0000-0000-00000000000c', 'x'); assert false, 'sub-admin deleted master'; exception when insufficient_privilege then null; end;
  begin perform master_restore('profile', '10000000-0000-0000-0000-00000000000b'); assert false, 'sub-admin restored'; exception when insufficient_privilege then null; end;
  begin perform master_generate_recovery_codes(); assert false, 'sub-admin generated codes'; exception when insufficient_privilege then null; end;
end $$;
-- member a cannot see the deleted profile, cannot use admin powers
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from search_profiles()) = 0, 'deleted profile still discoverable';
  begin perform get_profile('10000000-0000-0000-0000-00000000000b'); assert false, 'deleted profile viewable'; exception when no_data_found then null; end;
  begin perform admin_set_require_approval(false); assert false, 'member toggled approval'; exception when insufficient_privilege then null; end;
end $$;
-- master c: restore, audit is append-only, orders undeletable, step-up for codes
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ declare codes text[]; n int; begin
  perform master_restore('profile', '10000000-0000-0000-0000-00000000000b');
  -- As an app user, RLS makes audit rows untouchable (0 rows affected).
  n := (select count(*) from audit_events);
  delete from audit_events;
  update audit_events set action = 'x';
  assert (select count(*) from audit_events where action <> 'x') = n, 'audit rows changed by app user';
  codes := master_generate_recovery_codes();
  assert array_length(codes, 1) = 10, 'ten codes';
  assert (select count(*) from recovery_codes where code_hash = any (codes)) = 0, 'plaintext stored';
  perform set_config('test.code1', codes[1], false);
  perform set_config('test.code2', codes[2], false);
end $$;
-- Even the database owner cannot delete/edit audit rows or delete orders (append-only triggers).
reset role;
do $$ begin
  begin delete from audit_events; assert false, 'owner deleted audit'; exception when insufficient_privilege then null; end;
  begin update audit_events set action = 'x'; assert false, 'owner edited audit'; exception when insufficient_privilege then null; end;
  insert into orders (user_id, profile_id, kind, amount, currency, status, terms)
    values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', 'boost', 0, 'INR', 'free', '{}');
  begin delete from orders; assert false, 'order deleted'; exception when insufficient_privilege then null; end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
-- stale session cannot generate codes (step-up)
select set_config('request.jwt.claims', json_build_object('iat', extract(epoch from now())::bigint - 3600)::text, false);
do $$ begin
  begin perform master_generate_recovery_codes(); assert false, 'no step-up'; exception when insufficient_privilege then null; end;
end $$;
-- backup phone is set by the edge function (service role) after OTP verification
reset role;
select set_master_backup_phone('00000000-0000-0000-0000-00000000000c', '+91', '9888800000');
set role authenticated;
-- recovery from the backup phone (user e) with a valid code → immediate
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$ declare r jsonb; begin
  begin perform recover_master('AAAA-AAAA'); assert false, 'bad code accepted'; exception when raise_exception then null; end;
  r := recover_master(current_setting('test.code1'));
  assert r ->> 'status' = 'completed', 'backup recovery: ' || r::text;
  assert is_master(), 'e is master';
end $$;
reset role;
do $$ begin
  assert (select count(*) from app_users where role = 'master') = 1, 'exactly one master';
  assert (select role from app_users where id = '00000000-0000-0000-0000-00000000000c') = 'user', 'old master demoted';
  assert (select count(*) from recovery_codes) = 0, 'codes reset after recovery';
end $$;
-- new-phone recovery is time-locked and cancellable (d tries with an old code → invalid since reset)
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  begin perform recover_master(current_setting('test.code2')); assert false, 'old code reused'; exception when raise_exception then null; end;
end $$;
reset role;
-- governance jobs complete a due recovery
update master_security set pending_country_code = '+91', pending_phone = '9000000001', pending_started_at = now() - interval '73 hours', pending_completes_at = now() - interval '1 hour' where id;
select run_governance_jobs();
do $$ begin
  assert (select role from app_users where phone = '9000000001') = 'master', 'time-locked recovery completed';
  assert (select count(*) from app_users where role = 'master') = 1, 'still exactly one master';
end $$;
reset role;
alter table orders enable trigger orders_boost_terms;
select 'ALL GOVERNANCE TESTS PASSED' as result;
