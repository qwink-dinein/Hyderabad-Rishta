\set ON_ERROR_STOP on
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
-- re-apply column-level update restrictions after the broad grant (mirrors Supabase defaults + migration)
revoke update on app_users, profiles, notifications from authenticated;
grant update (language) on app_users to authenticated;
grant update (biodata, last_step, updated_at) on profiles to authenticated;
grant update (read_at) on notifications to authenticated;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
insert into app_users (id, country_code, phone, role) values
 ('00000000-0000-0000-0000-00000000000a', '+91', '9000000001', 'user'),
 ('00000000-0000-0000-0000-00000000000b', '+91', '9000000002', 'user'),
 ('00000000-0000-0000-0000-00000000000c', '+91', '9000000000', 'admin');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a',
  '{"basic":{"lookingFor":"bride","fullName":"Imran Siddiqui","dob":"1994-05-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it","income":"20to35","employer":"Secret Co"},"religion":{},"family":{"familyType":"joint"},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"onConsent","acceptContactRequests":true}}', 'published', now()),
 ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b',
  '{"basic":{"lookingFor":"groom","fullName":"Ayesha Khan","dob":"1998-02-10","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[{"id":"x","uri":"secret-photo"}],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"other","educationOther":"Hafiz-e-Quran","profession":"it","income":"10to20"},"religion":{},"family":{"familyType":"nuclear"},"preferences":{},"privacy":{"displayName":"initials","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now());

set role authenticated;
-- As user A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ begin
  assert (select count(*) from profiles) = 1, 'A must only see own profile row directly';
  assert (select count(*) from app_users) = 1, 'A must only see own user row';
end $$;
-- discovery returns B projected, without phone/photo/income
do $$ declare j jsonb; begin
  select x into j from search_profiles() x;
  assert j ->> 'displayName' = 'A. K.', 'initials display name: ' || (j ->> 'displayName');
  assert j::text not like '%9000000002%', 'phone leaked in discovery';
  assert j::text not like '%secret-photo%', 'on-consent photo leaked';
  assert j #>> '{career,income}' is null, 'hidden income leaked';
  assert (j ->> 'photosHidden')::boolean, 'photosHidden flag';
  assert j #>> '{career,educationOther}' = 'Hafiz-e-Quran', 'custom education present';
  assert (select count(*) from search_profiles(p_keyword => 'hafiz')) = 1, 'custom value searchable';
  assert (select count(*) from search_profiles(p_show => 'groom')) = 0, 'type filter';
end $$;
-- A cannot escalate own role or publish directly
do $$ begin
  begin update app_users set role = 'admin' where id = auth.uid(); assert false, 'role escalation allowed';
  exception when insufficient_privilege then null; end;
  begin update profiles set status = 'published' where user_id = auth.uid(); assert false, 'status self-change allowed';
  exception when insufficient_privilege then null; end;
  begin perform admin_set_profile_status('10000000-0000-0000-0000-00000000000b', 'paused'); assert false, 'non-admin admin RPC';
  exception when insufficient_privilege then null; end;
end $$;
-- A sends request to B
select id as req from send_request('10000000-0000-0000-0000-00000000000b', 'Salaam') \gset
-- As B: accept, then check A still sees nothing restricted until consent
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select respond_request(:'req', 'accepted') is not null as accepted;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare j jsonb; begin
  j := get_profile('10000000-0000-0000-0000-00000000000b');
  assert j -> 'contact' is null, 'acceptance alone must not reveal phone';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select set_consent(:'req', false, true, false);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$ declare j jsonb; begin
  j := get_profile('10000000-0000-0000-0000-00000000000b');
  assert j #>> '{contact,phone}' = '9000000002', 'phone visible after explicit consent';
  assert j::text not like '%secret-photo%', 'photos not consented';
  assert (select count(*) from search_profiles() x where x::text like '%9000000002%') = 0, 'discovery never carries phone';
  assert (select count(*) from notifications) >= 2, 'A got accepted + shared notifications';
end $$;
-- Admin
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
do $$ begin
  assert (select count(*) from profiles) = 2, 'admin sees all profiles';
  perform admin_set_profile_status('10000000-0000-0000-0000-00000000000b', 'paused', 'test');
  assert (select count(*) from audit_events where action = 'profile.status') = 1, 'audited';
end $$;
select 'ALL RLS TESTS PASSED' as result;
