\set ON_ERROR_STOP on
-- Discover rotation storage: impressions (de-duplicated), views/shortlists/interests recorded automatically,
-- snapshots per filter set, own-only access, configurable cooldowns.
reset role;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000ee01', '919733300001'), ('00000000-0000-0000-0000-00000000ee02', '919733300002'), ('00000000-0000-0000-0000-00000000ee03', '919733300003');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-00000000ee01', '+91', '9733300001'), ('00000000-0000-0000-0000-00000000ee02', '+91', '9733300002'), ('00000000-0000-0000-0000-00000000ee03', '+91', '9733300003');
\set bio '{"basic":{"createdFor":"self","lookingFor":"groom","fullName":"Feed Test","dob":"1996-01-01","heightCm":158,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{"cities":["Hyderabad"]},"privacy":{"displayName":"first","photoVisibility":"public","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'
insert into profiles (user_id, biodata, last_step, status) values
 ('00000000-0000-0000-0000-00000000ee01', jsonb_set(:'bio'::jsonb, '{basic,lookingFor}', '"bride"'), 7, 'published'),   -- viewer (groom)
 ('00000000-0000-0000-0000-00000000ee02', :'bio', 7, 'published'),
 ('00000000-0000-0000-0000-00000000ee03', :'bio', 7, 'draft');
select set_config('test.p2', id::text, false) from profiles where user_id = '00000000-0000-0000-0000-00000000ee02';
select set_config('test.p3', id::text, false) from profiles where user_id = '00000000-0000-0000-0000-00000000ee03';

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ee01', false);
do $$ declare p2 uuid := current_setting('test.p2')::uuid; p3 uuid := current_setting('test.p3')::uuid; c jsonb; begin
  assert record_impressions(array[p2, p3]) = 1, 'only live profiles are recorded';
  assert record_impressions(array[p2]) = 0, 'a repeat within 30 minutes counts once';
  assert (select impressions from profile_seen where profile_id = p2) = 1, 'impressions not inflated';
  begin perform record_impressions(array_fill(p2, array[101])); assert false, 'oversized batch'; exception when invalid_parameter_value then null; end;
  begin insert into profile_seen (viewer_id, profile_id) values (auth.uid(), p2); assert false, 'members cannot forge history'; exception when insufficient_privilege then null; end;
  perform get_profile(p2);          -- full view
  insert into shortlists (user_id, profile_id) values (auth.uid(), p2);
  c := get_feed_context(array['fA']);
  assert (c -> 'seen' -> 0 ->> 'viewedAt') is not null and c -> 'seen' -> 0 ->> 'interaction' = 'shortlist', 'view + shortlist recorded: ' || c;
  assert (c -> 'shortlisted') @> to_jsonb(array[p2]), 'shortlist listed';
  assert (c #>> '{cfg,impressionCooldownDays}')::int = 3 and (c #>> '{cfg,viewCooldownDays}')::int = 7, 'default cooldowns';
  perform save_feed_state('fA', 'sess1', array[p2], now(), now(), null);
  perform save_feed_state('fA', 'sess2', array[p2], now(), now(), now() - interval '1 day');
  c := get_feed_context(array['fA']);
  assert c #>> '{snapshots,fA,sessionId}' = 'sess2', 'snapshot upserted per filter set';
  begin perform save_feed_state('fB', 's', array_fill(p2, array[2001]), now(), now(), null); assert false, 'oversized snapshot'; exception when invalid_parameter_value then null; end;
end $$;
-- Others cannot read this member's history or snapshots.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ee02', false);
do $$ begin
  assert (select count(*) from profile_seen) = 0 and (select count(*) from feed_state) = 0, 'history is private';
end $$;
reset role;
-- Interest sent → recorded; deleting a profile cleans its history.
insert into contact_requests (from_user_id, from_profile_id, to_user_id, to_profile_id, expires_at)
  select '00000000-0000-0000-0000-00000000ee02', current_setting('test.p2')::uuid, '00000000-0000-0000-0000-00000000ee01', id, now() + interval '14 days'
  from profiles where user_id = '00000000-0000-0000-0000-00000000ee01';
do $$ begin
  assert (select interaction from profile_seen where viewer_id = '00000000-0000-0000-0000-00000000ee02') = 'interest', 'interest recorded';
end $$;
-- Admin can change the cooldowns; ranges enforced.
update app_users set role = 'admin' where id = '00000000-0000-0000-0000-00000000ee03';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000ee03', false);
do $$ declare c pricing_config; begin
  select * into c from pricing_config limit 1;
  c := admin_update_pricing(c.config, c.boost_days, c.require_approval, c.request_expiry_days, c.poke_wait_hours, c.poke_max_per_7_days, 1, 2);
  assert c.feed_impression_cooldown_days = 1 and c.feed_view_cooldown_days = 2, 'cooldowns saved';
  begin perform admin_update_pricing(c.config, c.boost_days, c.require_approval, 14, 48, 2, 61, 2); assert false, 'out of range'; exception when check_violation then null; end;
end $$;
reset role;
select 'ALL DISCOVER-ROTATION TESTS PASSED' as result;
