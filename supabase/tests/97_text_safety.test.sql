\set ON_ERROR_STOP on
-- Security round 2: hidden characters that spoof names/messages are refused (biodata) or stripped
-- (interest messages, report details). Urdu/Telugu joiners stay allowed.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000ca1'), ('00000000-0000-0000-0000-000000000ca2');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-000000000ca1', '+91', '9666200001'),
 ('00000000-0000-0000-0000-000000000ca2', '+91', '9666200002');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('ca000000-0000-0000-0000-000000000ca1', '00000000-0000-0000-0000-000000000ca1', '{"basic":{"fullName":"Ayesha"},"photos":[]}', 'published', now()),
 ('ca000000-0000-0000-0000-000000000ca2', '00000000-0000-0000-0000-000000000ca2', '{"basic":{"fullName":"Imran"},"photos":[]}', 'published', now());
do $$ begin
  -- Right-to-left override in a name: refused.
  begin
    update profiles set biodata = jsonb_set(biodata, '{basic,fullName}', to_jsonb(E'Imran ‮moc.live'::text)) where id = 'ca000000-0000-0000-0000-000000000ca2';
    assert false, 'bidi override saved in a name';
  exception when check_violation then null; end;
  -- Zero-width space and a control code hidden in "about": refused.
  begin
    update profiles set biodata = jsonb_set(biodata, '{basic,about}', to_jsonb(E'call​me'::text)) where id = 'ca000000-0000-0000-0000-000000000ca2';
    assert false, 'zero-width space saved';
  exception when check_violation then null; end;
  begin
    update profiles set biodata = jsonb_set(biodata, '{basic,about}', to_jsonb(E'bell\u0007'::text)) where id = 'ca000000-0000-0000-0000-000000000ca2';
    assert false, 'control code saved';
  exception when check_violation then null; end;
  -- Real Urdu with a ZWNJ, and new lines: allowed.
  update profiles set biodata = jsonb_set(biodata, '{basic,about}', to_jsonb(E'می‌ں\nline two'::text)) where id = 'ca000000-0000-0000-0000-000000000ca2';
  -- Interest message and report details: stripped.
  insert into contact_requests (from_user_id, from_profile_id, to_user_id, to_profile_id, message)
   values ('00000000-0000-0000-0000-000000000ca1', 'ca000000-0000-0000-0000-000000000ca1', '00000000-0000-0000-0000-000000000ca2', 'ca000000-0000-0000-0000-000000000ca2', E'Salaam‮⁦ hi​');
  assert (select message from contact_requests where from_user_id = '00000000-0000-0000-0000-000000000ca1') = 'Salaam hi', 'message not stripped';
  insert into reports (reporter_user_id, profile_id, reason, details)
   values ('00000000-0000-0000-0000-000000000ca1', 'ca000000-0000-0000-0000-000000000ca2', 'fake', E'‮fake﻿');
  assert (select details from reports where reporter_user_id = '00000000-0000-0000-0000-000000000ca1') = 'fake', 'report details not stripped';
end $$;
select 'ALL TEXT-SAFETY TESTS PASSED' as result;
