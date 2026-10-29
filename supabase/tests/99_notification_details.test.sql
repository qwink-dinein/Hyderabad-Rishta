\set ON_ERROR_STOP on
-- An accepted interest that carried the sender's number says so in the sender's notification;
-- one without a number offer does not.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000ae1'), ('00000000-0000-0000-0000-000000000ae2'), ('00000000-0000-0000-0000-000000000ae3');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-000000000ae1', '+91', '9100000201'),
 ('00000000-0000-0000-0000-000000000ae2', '+91', '9100000202'),
 ('00000000-0000-0000-0000-000000000ae3', '+91', '9100000203');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('20000000-0000-0000-0000-000000000ae1', '00000000-0000-0000-0000-000000000ae1', '{"basic":{"lookingFor":"bride","fullName":"Ehsan Test","dob":"1993-01-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('20000000-0000-0000-0000-000000000ae2', '00000000-0000-0000-0000-000000000ae2', '{"basic":{"lookingFor":"groom","fullName":"Erum Test","dob":"1997-01-01","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('20000000-0000-0000-0000-000000000ae3', '00000000-0000-0000-0000-000000000ae3', '{"basic":{"lookingFor":"groom","fullName":"Esha Test","dob":"1996-01-01","heightCm":158,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now());
set role authenticated;
-- e1 sends e2 an interest WITH his number, and e3 one WITHOUT.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000ae1', false);
select id as with_no from send_request('20000000-0000-0000-0000-000000000ae2', 'Salaam', true, true, 'idem-e-1') \gset
select id as without_no from send_request('20000000-0000-0000-0000-000000000ae3', 'Salaam', false, false, 'idem-e-2') \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000ae2', false);
select respond_request(:'with_no', 'accepted') is not null;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000ae3', false);
select respond_request(:'without_no', 'accepted') is not null;
reset role;
do $$ begin
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000ae1' and type = 'request_accepted') = 2, 'two accepted notices';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000ae1' and type = 'request_accepted' and params ->> 'numberShared' = '1') = 1, 'exactly one says the number is shared';
end $$;
select 'ALL NOTIFICATION-DETAIL TESTS PASSED' as result;
