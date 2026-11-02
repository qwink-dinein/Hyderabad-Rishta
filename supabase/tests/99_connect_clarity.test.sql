\set ON_ERROR_STOP on
-- Owner report 2026-11-02: after acceptance the sender could not find the other member's number/photo.
-- A swap is instant; one-sided offers still need a tap; notices open the person's profile.
reset role;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000cc001', '919611400001'), ('00000000-0000-0000-0000-0000000cc002', '919611400002'),
 ('00000000-0000-0000-0000-0000000cc003', '919611400003');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-0000000cc001', '+91', '9611400001'), ('00000000-0000-0000-0000-0000000cc002', '+91', '9611400002'),
 ('00000000-0000-0000-0000-0000000cc003', '+91', '9611400003');
\set g '{"basic":{"lookingFor":"bride","fullName":"Salman Test","dob":"1995-01-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'
insert into profiles (id, user_id, biodata, status, published_at) values
 ('2000000c-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000cc001', :'g', 'published', now()),
 ('2000000c-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-0000000cc002', jsonb_set(jsonb_set(:'g'::jsonb, '{basic,lookingFor}', '"groom"'), '{basic,fullName}', '"Sana Test"'), 'published', now()),
 ('2000000c-0000-0000-0000-0000000cc003', '00000000-0000-0000-0000-0000000cc003', jsonb_set(jsonb_set(:'g'::jsonb, '{basic,lookingFor}', '"groom"'), '{basic,fullName}', '"Hina Test"'), 'published', now());

set role authenticated;
-- Salman → Sana, WITH his number; Salman → Hina, without.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000cc001', false);
select id as r1 from send_request('2000000c-0000-0000-0000-0000000cc002', null, true, true, 'cc-1') \gset
select id as r2 from send_request('2000000c-0000-0000-0000-0000000cc003', null, false, false, 'cc-2') \gset
-- Sana accepts (sees his number), then shares hers back: a swap, so he sees it at once.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000cc002', false);
select respond_request(:'r1', 'accepted');
select offer_phone(:'r1', true, 'cc-o1');
-- Hina accepts and offers her number: one-sided, Salman still taps to see it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000cc003', false);
select respond_request(:'r2', 'accepted');
select offer_phone(:'r2', true, 'cc-o2');
reset role;
do $$ begin
  assert (consent_scopes('00000000-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-0000000cc001') ->> 'phone')::boolean, 'swap: her number is visible to him at once';
  assert not (consent_scopes('00000000-0000-0000-0000-0000000cc003', '00000000-0000-0000-0000-0000000cc001') ->> 'phone')::boolean, 'one-sided offer still needs his tap';
  assert exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000cc001' and type = 'request_accepted'
                 and deep_link = '/profile/2000000c-0000-0000-0000-0000000cc002'), 'accepted notice opens her profile';
  assert exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000cc001' and type = 'phone_offer_received'
                 and params ->> 'shared' = '1' and deep_link = '/profile/2000000c-0000-0000-0000-0000000cc002'), 'swap notice says shared';
  assert exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000cc001' and type = 'phone_offer_received'
                 and params ->> 'shared' is null and deep_link = '/profile/2000000c-0000-0000-0000-0000000cc003'), 'one-sided notice opens her profile';
end $$;
-- He taps "Show number" for Hina.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000cc001', false);
select respond_phone_offer((select id from phone_offers where request_id = :'r2' and from_user_id = '00000000-0000-0000-0000-0000000cc003'), 'accepted');
reset role;
do $$ begin
  assert (consent_scopes('00000000-0000-0000-0000-0000000cc003', '00000000-0000-0000-0000-0000000cc001') ->> 'phone')::boolean, 'after the tap he sees it';
  -- A stranger can never get a number by "swapping".
  assert not (consent_scopes('00000000-0000-0000-0000-0000000cc002', '00000000-0000-0000-0000-0000000cc003') ->> 'phone')::boolean, 'no leak across pairs';
end $$;
select 'ALL CONNECT-CLARITY TESTS PASSED' as result;

-- 20261201: both press "Share my number" before either taps "Show number" → a swap, both visible.
reset role;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-0000000cc004', '919611400004'), ('00000000-0000-0000-0000-0000000cc005', '919611400005');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000cc004', '+91', '9611400004'), ('00000000-0000-0000-0000-0000000cc005', '+91', '9611400005');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('2000000c-0000-0000-0000-0000000cc004', '00000000-0000-0000-0000-0000000cc004', :'g', 'published', now()),
 ('2000000c-0000-0000-0000-0000000cc005', '00000000-0000-0000-0000-0000000cc005', jsonb_set(:'g'::jsonb, '{basic,lookingFor}', '"groom"'), 'published', now());
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000cc004', false);
select id as r3 from send_request('2000000c-0000-0000-0000-0000000cc005', null, false, false, 'cc-3') \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000cc005', false);
select respond_request(:'r3', 'accepted');
select (offer_phone(:'r3', true, 'cc-o3')).status as first_status \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000cc004', false);
select (offer_phone(:'r3', true, 'cc-o4')).status as second_status \gset
reset role;
do $$ begin
  assert (consent_scopes('00000000-0000-0000-0000-0000000cc005', '00000000-0000-0000-0000-0000000cc004') ->> 'phone')::boolean, 'both offered: he sees hers';
  assert (consent_scopes('00000000-0000-0000-0000-0000000cc004', '00000000-0000-0000-0000-0000000cc005') ->> 'phone')::boolean, 'both offered: she sees his';
end $$;
select 'ALL BOTH-OFFERED SWAP TESTS PASSED' as result where :'first_status' = 'offered' and :'second_status' = 'accepted';
