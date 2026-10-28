\set ON_ERROR_STOP on
-- Boost guarantees + push pipeline. Members: g1 (groom, boosted), g2 (groom, boosted then paused),
-- b1/b2 (brides, viewers), x1 (bride who blocks g1). Admin-free: everything here is member-facing.
reset role;
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2'),
 ('00000000-0000-0000-0000-0000000000d1'), ('00000000-0000-0000-0000-0000000000d2'), ('00000000-0000-0000-0000-0000000000d3');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-0000000000c1', '+91', '9300000001'),
 ('00000000-0000-0000-0000-0000000000c2', '+91', '9300000002'),
 ('00000000-0000-0000-0000-0000000000d1', '+91', '9300000011'),
 ('00000000-0000-0000-0000-0000000000d2', '+91', '9300000012'),
 ('00000000-0000-0000-0000-0000000000d3', '+91', '9300000013');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1',
  '{"basic":{"lookingFor":"bride","fullName":"Ghani Boost","dob":"1992-01-01","heightCm":178,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('40000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2',
  '{"basic":{"lookingFor":"bride","fullName":"Gulzar Paused","dob":"1990-01-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Warangal"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('40000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
  '{"basic":{"lookingFor":"groom","fullName":"Bano Viewer","dob":"1996-01-01","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('40000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2',
  '{"basic":{"lookingFor":"groom","fullName":"Bushra Viewer","dob":"1997-01-01","heightCm":158,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"USA","state":"Texas","city":"Austin"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('40000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000d3',
  '{"basic":{"lookingFor":"groom","fullName":"Xenia Blocker","dob":"1995-01-01","heightCm":162,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now());
insert into orders (id, user_id, profile_id, kind, amount, currency, status, terms) values
 ('50000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', 'boost', 199, 'INR', 'paid', '{"boostDays":7}'),
 ('50000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c2', '40000000-0000-0000-0000-0000000000c2', 'boost', 0, 'INR', 'free', '{"boostDays":3}'),
 ('50000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000c1', 'boost', 199, 'INR', 'pending', '{"boostDays":7}');
insert into blocks (user_id, blocked_profile_id) values ('00000000-0000-0000-0000-0000000000d3', '40000000-0000-0000-0000-0000000000c1');

do $$ declare until1 timestamptz; begin
  until1 := apply_boost('50000000-0000-0000-0000-0000000000c1');
  assert until1 > now() + interval '6 days', 'boost length from order terms';
  assert apply_boost('50000000-0000-0000-0000-0000000000c1') = until1, 'apply_boost idempotent per order';
  perform apply_boost('50000000-0000-0000-0000-0000000000c2');
  begin perform apply_boost('50000000-0000-0000-0000-0000000000c3'); assert false, 'unpaid order applied';
  exception when raise_exception then null; end;
  assert (select count(*) from notifications where type = 'boost_started') = 2, 'boost_started once each';
end $$;
update profiles set status = 'paused' where id = '40000000-0000-0000-0000-0000000000c2';

-- Members can't buy-free: inserted boost/publication fields are wiped, ID comes from the sequence.
grant select, insert on profiles to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false);
do $$ begin
  assert exists (select 1 from get_push_settings() s where (s -> 'prefs' ->> 'showNames') = 'false'), 'default prefs: names hidden';
end $$;
reset role;

-- ── Featured: every eligible viewer sees the boost, regardless of their own filters/location ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', false); -- Austin, far away
do $$ begin
  assert (select count(*) from get_featured(12) f where f ->> 'id' = '40000000-0000-0000-0000-0000000000c1') = 1, 'boost visible to b2';
  assert (select count(*) from get_featured(12) f where f ->> 'id' = '40000000-0000-0000-0000-0000000000c2') = 0, 'paused boost hidden';
  assert (select count(*) from get_featured(12) f where f ->> 'contact' is not null and f ->> 'contact' <> 'null') = 0, 'no contact in featured';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
do $$ begin
  assert (select count(*) from get_featured(12) f where f ->> 'id' = '40000000-0000-0000-0000-0000000000c1') = 1, 'boost visible to b1';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d3', false);
do $$ begin
  assert (select count(*) from get_featured(12) f where f ->> 'id' = '40000000-0000-0000-0000-0000000000c1') = 0, 'blocked pair never featured';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false); -- a groom: not his type
do $$ begin
  assert (select count(*) from get_featured(12)) = 0, 'not shown to the same profile type';
end $$;
reset role;
do $$ begin
  assert (select count(distinct viewer_user_id) from boost_impressions where profile_id = '40000000-0000-0000-0000-0000000000c1') = 2, 'impressions = 2 eligible viewers';
end $$;

-- ── Boost lifecycle notices: exactly once each ──
update profiles set boost_until = now() + interval '2 hours' where id = '40000000-0000-0000-0000-0000000000c1';
do $$ begin
  perform run_boost_jobs(); perform run_boost_jobs();
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000c1' and type = 'boost_ending') = 1, 'ending once';
end $$;
update profiles set boost_until = now() - interval '1 minute' where id = '40000000-0000-0000-0000-0000000000c1';
do $$ begin
  perform run_boost_jobs(); perform run_boost_jobs();
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000c1' and type = 'boost_ended') = 1, 'ended once';
end $$;

-- ── Push: register, enqueue, prefs, device move, dispatch results ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select register_push_device('ExponentPushToken[aaaaaaaaaaaa]', 'android');
do $$ begin
  begin perform register_push_device('not-a-token', 'android'); assert false, 'bad token accepted';
  exception when check_violation then null; end;
end $$;
reset role;
insert into notifications (user_id, type, params, deep_link) values ('00000000-0000-0000-0000-0000000000c1', 'request_received', '{"name":"Bano"}', '/requests');
do $$ begin
  assert (select count(*) from push_outbox where user_id = '00000000-0000-0000-0000-0000000000c1' and status = 'queued' and category = 'interests') = 1, 'interest queued';
end $$;
-- Category off → skipped; account category still delivered.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', false);
select set_push_prefs('{"interests": false, "bogus": 1}');
reset role;
insert into notifications (user_id, type, params) values ('00000000-0000-0000-0000-0000000000c1', 'request_accepted', '{}');
insert into notifications (user_id, type, params) values ('00000000-0000-0000-0000-0000000000c1', 'payment', '{"status":"paid"}');
do $$ begin
  assert (select reason from push_outbox where category = 'interests' and status = 'skipped' and user_id = '00000000-0000-0000-0000-0000000000c1') = 'category_off', 'category off';
  assert (select count(*) from push_outbox where category = 'account' and status = 'queued' and user_id = '00000000-0000-0000-0000-0000000000c1') >= 1, 'account always queued';
  assert not ((select push_prefs from app_users where id = '00000000-0000-0000-0000-0000000000c1') ? 'bogus'), 'unknown pref keys ignored';
end $$;
-- Shared phone: the same token signs in as b1 → c1 no longer receives anything on it.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', false);
select register_push_device('ExponentPushToken[aaaaaaaaaaaa]', 'android');
reset role;
do $$ declare n int; begin
  assert (select user_id from push_devices where token = 'ExponentPushToken[aaaaaaaaaaaa]') = '00000000-0000-0000-0000-0000000000d1', 'token moved';
  select count(*) into n from claim_push_batch(100);
  assert n = 0, 'queued rows for the previous owner are never sent';
  assert (select count(*) from push_outbox where reason = 'device_moved') >= 1, 'marked device_moved';
end $$;

-- Dispatch: queue a fresh one for b1, claim, simulate Expo responses.
insert into notifications (user_id, type) values ('00000000-0000-0000-0000-0000000000d1', 'poke');
do $$ declare r record; begin
  select * into r from claim_push_batch(100) limit 1;
  assert r.type = 'poke' and r.show_names = false and r.lang = 'en', 'claimed with render context';
  assert (select count(*) from claim_push_batch(100)) = 0, 'claimed rows are not claimed twice';
  perform push_result(r.id, false, null, 'network');
  assert (select status from push_outbox where id = r.id) = 'queued', 'transient error retries';
  assert (select next_attempt_at from push_outbox where id = r.id) > now(), 'with backoff';
  perform push_result(r.id, false, null, 'DeviceNotRegistered');
  assert not exists (select 1 from push_devices where token = 'ExponentPushToken[aaaaaaaaaaaa]'), 'dead token removed';
end $$;

-- ── Activity notices: shortlist once ever; views batched ──
insert into shortlists (user_id, profile_id) values ('00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-0000000000c1');
delete from shortlists where user_id = '00000000-0000-0000-0000-0000000000d2';
insert into shortlists (user_id, profile_id) values ('00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-0000000000c1');
insert into view_events (profile_id, viewer_user_id) values ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d1');
insert into view_events (profile_id, viewer_user_id) values ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000d2');
insert into view_events (profile_id, viewer_user_id) values ('40000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1'); -- own view
do $$ begin
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000c1' and type = 'profile_shortlisted') = 1, 'shortlist notice once';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000c1' and type = 'profile_viewed') = 1, 'views batched';
  assert (select count(*) from notifications where params::text ~ '93000000') = 0, 'no phone numbers in notifications';
end $$;

-- ── Member-created profiles can't carry a boost ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', false);
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000000e1', '+91', '9300000099');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
insert into profiles (user_id, biodata, status, boost_until, code) values
 ('00000000-0000-0000-0000-0000000000e1', '{"basic":{"lookingFor":"bride"}}', 'draft', now() + interval '10 years', 'HR-1');
reset role;
do $$ begin
  assert (select boost_until is null and code <> 'HR-1' and status = 'draft' from profiles where user_id = '00000000-0000-0000-0000-0000000000e1'), 'insert hardened';
end $$;
select 'ALL BOOST & PUSH TESTS PASSED';
