\set ON_ERROR_STOP on
-- Member-side API (Phase 2 adapter): publish, pause, boost, activity, requests view, shortlist, blocks, deactivation.
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-00000000cc01', '919711100001'),   -- bride (looking for a groom)
 ('00000000-0000-0000-0000-00000000cc02', '919711100002'),   -- groom
 ('00000000-0000-0000-0000-00000000cc03', '919711100003'),   -- viewer
 ('00000000-0000-0000-0000-00000000cc04', '919711100004');   -- viewer
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-00000000cc01', '+91', '9711100001'),
 ('00000000-0000-0000-0000-00000000cc02', '+91', '9711100002'),
 ('00000000-0000-0000-0000-00000000cc03', '+91', '9711100003'),
 ('00000000-0000-0000-0000-00000000cc04', '+91', '9711100004');
\set full '{"basic":{"createdFor":"self","lookingFor":"groom","fullName":"Sana Member","dob":"1997-03-04","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'
insert into profiles (user_id, biodata, last_step) values
 ('00000000-0000-0000-0000-00000000cc01', jsonb_set(:'full'::jsonb, '{location,city}', '""'), 7),            -- no city: incomplete
 ('00000000-0000-0000-0000-00000000cc02', jsonb_set(jsonb_set(:'full'::jsonb, '{basic,lookingFor}', '"bride"'), '{basic,fullName}', '"Imran Member"'), 7);
-- Known pricing: publication free; boost d7 free for brides / ₹100 for grooms, d14 ₹200; approval off.
update pricing_config set require_approval = false, config = jsonb_build_object(
  'publication', jsonb_build_object('bride', jsonb_build_object('mode', 'free', 'amount', 0), 'groom', jsonb_build_object('mode', 'free', 'amount', 0)),
  'boost', jsonb_build_object('bride', jsonb_build_object('mode', 'free', 'amount', 0), 'groom', jsonb_build_object('mode', 'paid', 'amount', 100)),
  'boostPlans', jsonb_build_array(
    jsonb_build_object('id', 'd7', 'days', 7, 'enabled', true, 'popular', true, 'fee', jsonb_build_object('bride', jsonb_build_object('mode', 'free', 'amount', 0), 'groom', jsonb_build_object('mode', 'paid', 'amount', 100))),
    jsonb_build_object('id', 'd14', 'days', 14, 'enabled', true, 'popular', false, 'fee', jsonb_build_object('bride', jsonb_build_object('mode', 'paid', 'amount', 200), 'groom', jsonb_build_object('mode', 'paid', 'amount', 200)))));

set role authenticated;
-- 1. Publishing: incomplete refused; complete goes live (approval off) with a free publication order.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc01', false);
do $$ begin
  begin perform submit_for_publication(); assert false, 'incomplete biodata published'; exception when raise_exception then
    assert sqlerrm = 'incomplete_biodata', sqlerrm; end;
  begin perform set_paused(true); assert false, 'paused a draft'; exception when raise_exception then null; end;
end $$;
reset role;
update profiles set biodata = :'full'::jsonb where user_id = '00000000-0000-0000-0000-00000000cc01';
set role authenticated;
do $$ declare r jsonb; begin
  r := submit_for_publication();
  assert r #>> '{profile,status}' = 'published', 'published: ' || r;
  assert r -> 'order' is null, 'free publication needs no checkout';
  assert (select count(*) from orders where kind = 'publication' and status = 'free' and user_id = auth.uid()) = 1, 'free order recorded';
  assert (select count(*) from notifications where user_id = auth.uid() and type = 'profile_published') = 1, 'told it is live';
  r := submit_for_publication();
  assert (select count(*) from orders where kind = 'publication' and user_id = auth.uid()) = 1, 'resubmitting adds nothing';
  -- 2. Pause / resume.
  assert (set_paused(true)).status = 'paused', 'paused';
  begin perform set_paused(true); assert false, 'paused twice'; exception when raise_exception then null; end;
  assert (set_paused(false)).status = 'published', 'resumed';
  -- 3. Boost: brides' 7 days are free and start at once; a second boost is refused while it runs.
  r := start_boost(null);
  assert r #>> '{order,status}' = 'free' and r #>> '{order,terms,planId}' = 'd7', 'default = shortest option, free: ' || r;
  assert (r #>> '{profile,boost_until}')::timestamptz > now() + interval '6 days', 'boost running';
  begin perform start_boost('d14'); assert false, 'stacked a boost'; exception when raise_exception then assert sqlerrm = 'boost_active', sqlerrm; end;
  begin perform start_boost('nope'); assert false, 'unknown plan'; exception when raise_exception then null; end;
end $$;

-- Groom: paid option → one pending order, reused on repeat taps, replaced when switching option.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc02', false);
do $$ declare a jsonb; b jsonb; c jsonb; begin
  perform submit_for_publication();
  a := start_boost('d7');
  assert a #>> '{order,status}' = 'pending' and (a #>> '{order,amount}')::int = 100, 'paid option waits for payment: ' || a;
  b := start_boost('d7');
  assert a #>> '{order,id}' = b #>> '{order,id}', 'repeat tap reuses the order';
  c := start_boost('d14');
  assert c #>> '{order,id}' <> a #>> '{order,id}' and (c #>> '{order,amount}')::int = 200, 'switching option makes a new order';
  assert (select status from orders where id = (a #>> '{order,id}')::uuid) = 'cancelled', 'old order cancelled';
  assert (select count(*) from orders where user_id = auth.uid() and kind = 'boost' and status = 'pending') = 1, 'only one open order';
  assert (select boost_until from profiles where user_id = auth.uid()) is null, 'no boost before payment';
end $$;

-- 4. Activity: counts and timing, never who viewed.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc03', false);
reset role;
insert into profiles (user_id, biodata, last_step, status) values
 ('00000000-0000-0000-0000-00000000cc03', jsonb_set(:'full'::jsonb, '{basic,lookingFor}', '"bride"'), 7, 'published'),
 ('00000000-0000-0000-0000-00000000cc04', jsonb_set(:'full'::jsonb, '{basic,lookingFor}', '"bride"'), 7, 'published');
insert into view_events (profile_id, viewer_user_id, at)
  select p.id, v.id, now() - (v.n || ' hours')::interval
  from profiles p, (values ('00000000-0000-0000-0000-00000000cc03'::uuid, 1), ('00000000-0000-0000-0000-00000000cc03'::uuid, 2), ('00000000-0000-0000-0000-00000000cc04'::uuid, 3)) v(id, n)
  where p.user_id = '00000000-0000-0000-0000-00000000cc01';
insert into shortlists (user_id, profile_id) select '00000000-0000-0000-0000-00000000cc03', id from profiles where user_id = '00000000-0000-0000-0000-00000000cc01';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc01', false);
do $$ declare a jsonb; begin
  a := get_my_activity();
  assert jsonb_array_length(a -> 'views') = 3, 'three views: ' || a;
  assert (select count(distinct x ->> 'v') from jsonb_array_elements(a -> 'views') x) = 2, 'two distinct viewers';
  assert a::text not like '%00000000-0000-0000-0000-00000000cc0%', 'no viewer ids leak';
  assert (a ->> 'shortlistedBy')::int = 1, 'shortlisted once';
end $$;

-- 5. Requests view: both sides see it; the other party is projected (no number); masked own number.
reset role;
select set_config('test.target', id::text, false) from profiles where user_id = '00000000-0000-0000-0000-00000000cc01';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc03', false);
do $$ declare r jsonb; target uuid := current_setting('test.target')::uuid; begin
  perform send_request(target, 'Assalamu alaikum', false, false, 'k-1');
  r := (select x from get_requests(null) x limit 1);
  assert r ->> 'direction' = 'sent' and r #>> '{request,status}' = 'pending', 'sender sees it: ' || r;
  assert r ->> 'myPhoneMasked' like '%0003' and r ->> 'myPhoneMasked' not like '%97111%', 'own number masked';
  assert r #> '{other,contact}' is null and r::text not like '%9711100001%', 'no contact before consent';
  assert (r #>> '{myConsent,photos}')::boolean = false, 'no consent yet';
  assert (select count(*) from get_requests(target)) = 1, 'per-profile lookup';
  -- shortlist + blocks lists
  assert (select count(*) from get_shortlist()) = 1, 'shortlist shows the profile';
  insert into blocks (user_id, blocked_profile_id) values (auth.uid(), target);
  assert (select count(*) from get_shortlist()) = 0, 'blocked profiles leave the shortlist';
  assert (select x ->> 'name' from get_blocked_profiles() x) = 'Sana', 'blocked list shows the display name';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc01', false);
do $$ begin
  assert (select count(*) from get_requests(null) x where x ->> 'direction' = 'received') = 1, 'recipient sees it';
  perform set_allow_reminders(false);
  assert (select biodata #>> '{privacy,allowReminders}' from profiles where user_id = auth.uid()) = 'false', 'reminders off';
end $$;

-- 6. Deactivation: self-deactivated can come back; an admin suspension cannot be undone by the member.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc04', false);
do $$ begin
  perform deactivate_account();
  begin perform get_my_activity(); assert false, 'deactivated account still active'; exception when insufficient_privilege then null; end;
  assert reactivate_self(), 'self-deactivation undone';
  assert (select deactivated_at from app_users where id = auth.uid()) is null, 'active again';
end $$;
reset role;
update app_users set deactivated_at = now(), deactivated_by = '00000000-0000-0000-0000-00000000cc01' where id = '00000000-0000-0000-0000-00000000cc04';
set role authenticated;
do $$ begin
  begin perform reactivate_self(); assert false, 'suspension undone by the member'; exception when raise_exception then assert sqlerrm = 'account_suspended', sqlerrm; end;
end $$;

-- 8. Photos: signed only when the privacy projection shows them to the caller.
reset role;
update app_users set deactivated_at = null, deactivated_by = null where id = '00000000-0000-0000-0000-00000000cc04';
update profiles set biodata = jsonb_set(jsonb_set(biodata, '{photos}', '[{"id":"p1","uri":"00000000-0000-0000-0000-00000000cc01/p1.jpg"}]'), '{privacy,photoVisibility}', '"onConsent"')
 where user_id = '00000000-0000-0000-0000-00000000cc01';
insert into announcements (title, body, segment, status, published_at) values ('{"en":"Eid Mubarak"}', '{"en":"Greetings"}', 'all', 'published', now()) returning id \gset ann_
insert into notifications (user_id, type, announcement_id) values ('00000000-0000-0000-0000-00000000cc02', 'announcement', :'ann_id');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc02', false);
do $$ begin
  assert (select count(*) from photo_paths_for(array['00000000-0000-0000-0000-00000000cc01/p1.jpg'])) = 0, 'onConsent photo hidden without consent';
  assert (select count(*) from photo_paths_for(array['00000000-0000-0000-0000-00000000cc02/mine.jpg'])) = 1, 'own photos always';
  assert (select count(*) from photo_paths_for(array['../etc/passwd', 'x/y.jpg', null])) = 0, 'junk paths refused';
  assert (select x #>> '{announcement,title,en}' from get_notifications(50) x where x ->> 'type' = 'announcement') = 'Eid Mubarak', 'announcement text included';
end $$;
reset role;
update profiles set biodata = jsonb_set(biodata, '{privacy,photoVisibility}', '"public"') where user_id = '00000000-0000-0000-0000-00000000cc01';
set role authenticated;
do $$ begin
  assert (select count(*) from photo_paths_for(array['00000000-0000-0000-0000-00000000cc01/p1.jpg', '00000000-0000-0000-0000-00000000cc01/other.jpg'])) = 1, 'public photo visible; unknown file is not';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000cc03', false);
do $$ begin
  assert (select count(*) from photo_paths_for(array['00000000-0000-0000-0000-00000000cc01/p1.jpg'])) = 0, 'blocked: no photos';
end $$;

-- 7. Signed-out callers get nothing.
set role anon;
do $$ begin
  begin perform submit_for_publication(); assert false, 'anon published'; exception when insufficient_privilege then null; end;
  begin perform get_requests(null); assert false, 'anon read requests'; exception when insufficient_privilege then null; end;
  begin perform photo_paths_for(array['x']); assert false, 'anon checked photos'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL MEMBER-API TESTS PASSED' as result;
