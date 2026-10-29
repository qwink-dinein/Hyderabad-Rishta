\set ON_ERROR_STOP on
-- First sign-in creates the account from the OTP-proved number; admin invites (incl. the master) apply once.
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-00000000bb01', '919700000001'),   -- invited master
 ('00000000-0000-0000-0000-00000000bb02', '919700000002'),   -- invited sub-admin
 ('00000000-0000-0000-0000-00000000bb03', '919700000003'),   -- ordinary member
 ('00000000-0000-0000-0000-00000000bb04', '919700000004'),   -- a second "master" invite
 ('00000000-0000-0000-0000-00000000bb05', '12');             -- junk number
-- Any master from earlier test files is demoted so this file controls the bootstrap.
update app_users set role = 'admin' where role = 'master';
insert into admin_invites (country_code, phone, role) values ('+91', '9700000001', 'master'), ('+91', '9700000002', 'admin'), ('+91', '9700000004', 'master');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bb01', false);
do $$ declare r jsonb; begin
  r := ensure_account('+91');
  assert r->>'role' = 'master' and (r->>'is_new')::boolean, 'invited master becomes master on first sign-in: ' || r;
  r := ensure_account('+91');
  assert r->>'role' = 'master' and not (r->>'is_new')::boolean, 'second call is a no-op';
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bb02', false);
do $$ begin assert ensure_account('+91')->>'role' = 'admin', 'invited sub-admin'; end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bb03', false);
do $$ begin
  assert ensure_account('+91')->>'role' = 'user', 'everyone else is a member';
  -- the client cannot pick someone else's country code to mint a different number
  begin perform ensure_account('+1'); exception when others then null; end;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bb04', false);
do $$ begin assert ensure_account('+91')->>'role' = 'admin', 'a second master invite only gives admin (one master)'; end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bb05', false);
do $$ begin
  begin perform ensure_account('+91'); assert false, 'junk number refused'; exception when invalid_parameter_value then null; end;
end $$;

select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin perform ensure_account('+91'); assert false, 'signed-out refused'; exception when invalid_authorization_specification then null; end;
end $$;

-- Members cannot read or forge invites.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bb03', false);
do $$ begin
  assert (select count(*) from admin_invites) = 0, 'members see no invites';
  begin insert into admin_invites (country_code, phone, role) values ('+91', '9700000003', 'master'); assert false, 'members cannot invite';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from app_users where role = 'master') = 1, 'exactly one master';
  assert (select count(*) from admin_invites where phone in ('9700000001', '9700000002', '9700000004')) = 0, 'invites used up';
  assert (select phone from app_users where id = '00000000-0000-0000-0000-00000000bb03') = '9700000003', 'number taken from Auth';
end $$;
select 'ALL ACCOUNT-BOOTSTRAP TESTS PASSED' as result;
