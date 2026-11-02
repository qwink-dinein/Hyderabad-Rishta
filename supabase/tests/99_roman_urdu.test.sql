\set ON_ERROR_STOP on
-- 20261202: Roman Urdu ('ur-Latn') is a saved language choice; members can set it themselves; nothing else is accepted.
reset role;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000a1001', '919611700001');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000a1001', '+91', '9611700001');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000a1001', false);
update app_users set language = 'ur-Latn' where id = '00000000-0000-0000-0000-0000000a1001';
reset role;
do $$ begin
  assert (select language from app_users where id = '00000000-0000-0000-0000-0000000a1001') = 'ur-Latn', 'member can choose Roman Urdu';
  begin
    update app_users set language = 'xx' where id = '00000000-0000-0000-0000-0000000a1001';
    assert false, 'unknown language accepted';
  exception when check_violation then null;
  end;
end $$;
select 'ALL ROMAN-URDU TESTS PASSED' as result;
