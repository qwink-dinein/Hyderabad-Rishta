\set ON_ERROR_STOP on
-- Admin console: profile IDs, relation badges, admin search, admin bell.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2');
insert into app_users (id, country_code, phone, role) values
 ('00000000-0000-0000-0000-0000000000a1', '+91', '9200000000', 'admin'),
 ('00000000-0000-0000-0000-0000000000b1', '+91', '9200000001', 'user'),
 ('00000000-0000-0000-0000-0000000000b2', '+91', '9200000002', 'user');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1',
  '{"basic":{"lookingFor":"bride","fullName":"Bilal Console","dob":"1993-01-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('30000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2',
  '{"basic":{"lookingFor":"groom","fullName":"Bushra Console","dob":"1997-01-01","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Secunderabad"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now());

do $$ declare c1 text; c2 text; begin
  select code into c1 from profiles where id = '30000000-0000-0000-0000-0000000000b1';
  select code into c2 from profiles where id = '30000000-0000-0000-0000-0000000000b2';
  assert c1 ~ '^HR-\d{5}$', 'code format';
  assert substr(c2, 4)::int > substr(c1, 4)::int, 'codes are sequential';
  begin update profiles set code = 'HR-1' where id = '30000000-0000-0000-0000-0000000000b1'; assert false, 'code changed';
  exception when raise_exception then null; end;
end $$;

set role authenticated;
-- B1 sends interest; B2 declines. Both sides see the relation; nobody sees a phone.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', false);
select id as rq from send_request('30000000-0000-0000-0000-0000000000b2', null, false, false, 'ac-1') \gset
do $$ begin
  assert get_profile('30000000-0000-0000-0000-0000000000b2') #>> '{relation,status}' = 'pending', 'relation pending';
  assert get_profile('30000000-0000-0000-0000-0000000000b2') #>> '{relation,direction}' = 'sent', 'direction sent';
  assert get_profile('30000000-0000-0000-0000-0000000000b2') ->> 'code' like 'HR-%', 'code in profile';
  assert (select count(*) from search_profiles() s where s #>> '{relation,status}' = 'pending') >= 1, 'relation in search';
  begin perform admin_search('HR-1'); assert false, 'member searched';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b2', false);
select respond_request(:'rq', 'declined') is not null;
do $$ begin
  assert get_profile('30000000-0000-0000-0000-0000000000b1') #>> '{relation,direction}' = 'received', 'direction received';
  assert get_profile('30000000-0000-0000-0000-0000000000b1') #>> '{relation,status}' = 'declined', 'declined visible';
end $$;
-- B2 reports B1 → admin bell.
insert into reports (reporter_user_id, profile_id, reason) values ('00000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b1', 'fake');
do $$ begin
  assert (select count(*) from notifications where type = 'admin_alert') = 0, 'member sees admin alerts';
end $$;

-- Admin: search by code, name, phone (audited, masked); alerts present.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false);
do $$ declare c text; r record; begin
  reset role; select code into c from profiles where id = '30000000-0000-0000-0000-0000000000b1'; set role authenticated;
  assert (select count(*) from admin_search(c) s where s.user_id = '00000000-0000-0000-0000-0000000000b1') = 1, 'search by code';
  assert (select count(*) from admin_search('bushra') s where s.user_id = '00000000-0000-0000-0000-0000000000b2') = 1, 'search by name';
  assert (select count(*) from admin_search('secunderabad')) = 1, 'search by city';
  select * into r from admin_search('9200000002');
  assert r.user_id = '00000000-0000-0000-0000-0000000000b2', 'search by phone';
  assert r.phone_masked not like '%9200000002%' and r.phone_masked like '%0002', 'masked';
  reset role;
  assert (select count(*) from audit_events where action = 'admin.search_phone' and meta ->> 'lastDigits' = '0002') = 1, 'phone search audited';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'admin_alert' and params ->> 'kind' = 'report' and params ->> 'code' = c) = 1, 'report alert';
  -- payment + pending + self-deletion alerts
  insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
    ('00000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000b2', 'publication', 299, 'INR', 'pending', '{}');
  update orders set status = 'paid' where profile_id = '30000000-0000-0000-0000-0000000000b2';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'admin_alert' and params ->> 'kind' = 'payment' and params ->> 'status' = 'paid') = 1, 'payment alert';
  update profiles set status = 'pending' where id = '30000000-0000-0000-0000-0000000000b2';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'admin_alert' and params ->> 'kind' = 'pending_profile') = 1, 'pending alert';
  delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000a1' and type = 'admin_alert' and params ->> 'kind' = 'account_deleted' and params ->> 'code' = c) = 1, 'deletion alert';
  assert (select count(*) from notifications where type = 'admin_alert' and params::text ~ '92000000[0-9]{2}') = 0, 'phone in alert';
end $$;
reset role;
select 'ALL ADMIN CONSOLE TESTS PASSED';
