\set ON_ERROR_STOP on
-- Onboarding reminders (max 2, only unfinished, never team-filled or admins) + SMS backup + match preview.
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-0000000be001', '919611200001'), ('00000000-0000-0000-0000-0000000be002', '919611200002'),
 ('00000000-0000-0000-0000-0000000be003', '919611200003'), ('00000000-0000-0000-0000-0000000be004', '919611200004'),
 ('00000000-0000-0000-0000-0000000be005', '919611200005');
insert into app_users (id, country_code, phone, created_at) values
 ('00000000-0000-0000-0000-0000000be001', '+91', '9611200001', now() - interval '2 hours'),  -- stopped in the draft
 ('00000000-0000-0000-0000-0000000be002', '+91', '9611200002', now() - interval '2 hours'),  -- finished (published)
 ('00000000-0000-0000-0000-0000000be003', '+91', '9611200003', now() - interval '10 minutes'), -- still busy (too soon)
 ('00000000-0000-0000-0000-0000000be004', '+91', '9611200004', now() - interval '10 days'),  -- long gone (too old)
 ('00000000-0000-0000-0000-0000000be005', '+91', '9611200005', now() - interval '2 hours');  -- team-created, not claimed
update app_users set created_by = '00000000-0000-0000-0000-0000000be002' where id = '00000000-0000-0000-0000-0000000be005';
\set bio '{"basic":{"createdFor":"son","lookingFor":"bride","fullName":"Imran Ahmed","dob":"1997-03-12","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"public","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'
insert into profiles (user_id, biodata, last_step, status) values
 ('00000000-0000-0000-0000-0000000be001', :'bio', 0, 'draft'),
 ('00000000-0000-0000-0000-0000000be002', jsonb_set(:'bio'::jsonb, '{basic,lookingFor}', '"groom"'), 7, 'published'),
 ('00000000-0000-0000-0000-0000000be003', :'bio', 0, 'draft'),
 ('00000000-0000-0000-0000-0000000be004', :'bio', 0, 'draft'),
 ('00000000-0000-0000-0000-0000000be005', :'bio', 0, 'draft');
update profiles set updated_at = now() - interval '90 minutes' where user_id in ('00000000-0000-0000-0000-0000000be001', '00000000-0000-0000-0000-0000000be005');
update profiles set updated_at = now() - interval '10 minutes' where user_id = '00000000-0000-0000-0000-0000000be003';
update profiles set updated_at = now() - interval '10 days' where user_id = '00000000-0000-0000-0000-0000000be004';

-- Members can't touch reminder machinery.
set role authenticated;
do $$ begin
  begin perform claim_onboarding_reminders(10); assert false, 'members must not claim reminders'; exception when insufficient_privilege then null; end;
  begin perform take_otp_channel('919611200001'); assert false, 'members must not read channel notes'; exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
declare
  r record;
  cnt int := 0;
begin
  for r in select * from claim_onboarding_reminders(50) loop
    cnt := cnt + 1;
    assert r.user_id = '00000000-0000-0000-0000-0000000be001', 'only the member who stopped an hour+ ago is due, got ' || r.user_id;
    assert r.phone = '919611200001' and r.name = 'Imran Ahmed' and r.n = 1, 'phone with country code, name, first reminder';
  end loop;
  assert cnt = 1, 'exactly one due, got ' || cnt;
  -- Claimed = counted: asking again right away gives nothing (never twice for the same slot).
  assert (select count(*) from claim_onboarding_reminders(50)) = 0, 'no repeat right after';
  -- Next day, no activity since → the second (last) reminder. (Account made the day before, as in real life.)
  update app_users set created_at = now() - interval '2 days' where id = '00000000-0000-0000-0000-0000000be001';
  update onboarding_reminders set last_sent_at = now() - interval '21 hours' where user_id = '00000000-0000-0000-0000-0000000be001';
  update profiles set updated_at = now() - interval '22 hours' where user_id = '00000000-0000-0000-0000-0000000be001';
  assert (select c.n from claim_onboarding_reminders(50) c) = 2, 'second reminder';
  -- Never a third.
  update onboarding_reminders set last_sent_at = now() - interval '3 days' where user_id = '00000000-0000-0000-0000-0000000be001';
  assert (select count(*) from claim_onboarding_reminders(50)) = 0, 'max two reminders';
end $$;

-- Activity after the first reminder stops the second; finishing stops everything.
do $$ begin
  delete from onboarding_reminders;
  update profiles set updated_at = now() - interval '2 hours' where user_id = '00000000-0000-0000-0000-0000000be001';
  assert (select count(*) from claim_onboarding_reminders(50)) = 1, 'first again after reset';
  update onboarding_reminders set last_sent_at = now() - interval '21 hours';
  update profiles set updated_at = now() - interval '1 hour' where user_id = '00000000-0000-0000-0000-0000000be001'; -- came back after the reminder
  assert (select count(*) from claim_onboarding_reminders(50)) = 0, 'came back after the first reminder: no second';
  delete from onboarding_reminders;
  update profiles set status = 'pending' where user_id = '00000000-0000-0000-0000-0000000be001';
  assert (select count(*) from claim_onboarding_reminders(50)) = 0, 'submitted: no reminders';
end $$;

-- SMS: off until switched on; one-time note; 10-minute window.
do $$ begin
  assert (auth_channels() ->> 'sms')::boolean = false, 'SMS off by default';
  assert request_sms_code('+91', '9611200001') = false, 'cannot ask for SMS while it is off';
  update app_flags set value = 'true' where key = 'sms_otp_enabled';
  assert (auth_channels() ->> 'sms')::boolean = true, 'SMS on';
  assert request_sms_code('+91', '96112-00001') = true, 'asked for SMS';
  assert request_sms_code('+91', 'abc') = false, 'bad number refused';
  assert take_otp_channel('919611200001') = 'sms', 'next code by SMS';
  assert take_otp_channel('919611200001') is null, 'one time only';
  perform request_sms_code('+91', '9611200001');
  update otp_channel_requests set requested_at = now() - interval '11 minutes';
  assert take_otp_channel('919611200001') is null, 'expires after 10 minutes';
  update app_flags set value = 'false' where key = 'sms_otp_enabled';
end $$;

-- Pre-sign-up preview: safe fields only, opposite side only, works without logging in.
set role anon;
do $$
declare
  j jsonb := match_preview('groom', null, null, 'hyd');
begin
  assert (j ->> 'count')::int >= 1, 'the published groom is counted';
  assert not (j::text ~ 'Imran Ahmed|9611200|fullName|photos|phone'), 'no names, numbers or photos';
  assert (match_preview('x', null, null, null) ->> 'count')::int = 0, 'only bride or groom';
end $$;
reset role;
select 'ALL REMINDERS + SMS TESTS PASSED' as result;
