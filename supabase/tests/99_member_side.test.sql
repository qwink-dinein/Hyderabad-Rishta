\set ON_ERROR_STOP on
-- A member only ever sees the opposite side; the Bride/Groom filter cannot override it (owner report 2026-11-01).
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-00000000ad01', '919788800001'), ('00000000-0000-0000-0000-00000000ad02', '919788800002'),
 ('00000000-0000-0000-0000-00000000ad03', '919788800003'), ('00000000-0000-0000-0000-00000000ad04', '919788800004');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-00000000ad01', '+91', '9788800001'), ('00000000-0000-0000-0000-00000000ad02', '+91', '9788800002'),
 ('00000000-0000-0000-0000-00000000ad03', '+91', '9788800003'), ('00000000-0000-0000-0000-00000000ad04', '+91', '9788800004');
\set bio '{"basic":{"createdFor":"self","lookingFor":"groom","fullName":"Side Test","dob":"1996-01-01","heightCm":158,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"public","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'
insert into profiles (user_id, biodata, last_step, status) values
 ('00000000-0000-0000-0000-00000000ad01', :'bio', 7, 'published'),                                                   -- a bride (looking for a groom)
 ('00000000-0000-0000-0000-00000000ad02', jsonb_set(:'bio'::jsonb, '{basic,lookingFor}', '"bride"'), 7, 'published'), -- a groom
 ('00000000-0000-0000-0000-00000000ad03', jsonb_set(:'bio'::jsonb, '{basic,lookingFor}', '"bride"'), 7, 'published'); -- another groom

set role authenticated;
-- The bride asks for brides: she still gets grooms only.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ad01', false);
do $$ begin
  assert not exists (select 1 from search_profiles('bride', null, null, null, null, null, null, 50, 0) x where x ->> 'profileType' = 'bride'),
    'a bride must never see brides, whatever the filter';
  assert exists (select 1 from search_profiles('bride', null, null, null, null, null, null, 50, 0) x where x ->> 'profileType' = 'groom'), 'she sees grooms';
end $$;
-- The groom asks for grooms: he still gets brides only.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ad02', false);
do $$ begin
  assert not exists (select 1 from search_profiles('groom', null, null, null, null, null, null, 50, 0) x where x ->> 'profileType' = 'groom'),
    'a groom must never see grooms, whatever the filter';
  assert exists (select 1 from search_profiles(null, null, null, null, null, null, null, 50, 0) x where x ->> 'profileType' = 'bride'), 'he sees brides';
end $$;
-- An account without a biodata (e.g. the team) can still choose a side.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ad04', false);
do $$ begin
  assert exists (select 1 from search_profiles('groom', null, null, null, null, null, null, 50, 0) x where x ->> 'profileType' = 'groom'), 'no biodata: filter applies';
  assert not exists (select 1 from search_profiles('groom', null, null, null, null, null, null, 50, 0) x where x ->> 'profileType' = 'bride'), 'no biodata: only the chosen side';
end $$;
reset role;
select 'ALL MEMBER-SIDE TESTS PASSED' as result;
