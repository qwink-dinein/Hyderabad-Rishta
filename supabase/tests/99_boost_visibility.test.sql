\set ON_ERROR_STOP on
-- Boost visibility (owner Mini PRD 2026-10-31): Featured frequency cap, filter narrowing (p_only), on/off,
-- size, validation of the new admin settings, Boost master switch and the photo eligibility rule.
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-00000000bf01', '919755500001'), ('00000000-0000-0000-0000-00000000bf02', '919755500002'),
 ('00000000-0000-0000-0000-00000000bf03', '919755500003'), ('00000000-0000-0000-0000-00000000bf04', '919755500004'),
 ('00000000-0000-0000-0000-00000000bf05', '919755500005');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-00000000bf01', '+91', '9755500001'), ('00000000-0000-0000-0000-00000000bf02', '+91', '9755500002'),
 ('00000000-0000-0000-0000-00000000bf03', '+91', '9755500003'), ('00000000-0000-0000-0000-00000000bf04', '+91', '9755500004'),
 ('00000000-0000-0000-0000-00000000bf05', '+91', '9755500005');
\set bio '{"basic":{"createdFor":"self","lookingFor":"groom","fullName":"Boost Test","dob":"1996-01-01","heightCm":158,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"public","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'
insert into profiles (user_id, biodata, last_step, status, boost_until, boost_started_at) values
 ('00000000-0000-0000-0000-00000000bf01', jsonb_set(:'bio'::jsonb, '{basic,lookingFor}', '"bride"'), 7, 'published', null, null),  -- viewer
 ('00000000-0000-0000-0000-00000000bf02', :'bio', 7, 'published', now() + interval '5 days', now()),
 ('00000000-0000-0000-0000-00000000bf03', :'bio', 7, 'published', now() + interval '5 days', now()),
 ('00000000-0000-0000-0000-00000000bf04', :'bio', 7, 'published', now() + interval '5 days', now()),
 ('00000000-0000-0000-0000-00000000bf05', :'bio', 7, 'published', null, null);                                                  -- not boosted
select set_config('test.b2', id::text, false) from profiles where user_id = '00000000-0000-0000-0000-00000000bf02';
select set_config('test.b3', id::text, false) from profiles where user_id = '00000000-0000-0000-0000-00000000bf03';
select set_config('test.b4', id::text, false) from profiles where user_id = '00000000-0000-0000-0000-00000000bf04';
update pricing_config set config = config || '{"featuredCapDaysPer7": 2}';
-- b2 was already featured to the viewer on 2 of the last 7 days (not today) → capped today.
insert into boost_impressions (profile_id, viewer_user_id, day)
select current_setting('test.b2')::uuid, '00000000-0000-0000-0000-00000000bf01', d
from (values ((now() at time zone 'utc')::date - 1), ((now() at time zone 'utc')::date - 3), ((now() at time zone 'utc')::date - 9)) v(d);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bf01', false);
do $$ declare b2 uuid := current_setting('test.b2')::uuid; b3 uuid := current_setting('test.b3')::uuid; b4 uuid := current_setting('test.b4')::uuid; ids uuid[]; begin
  select array_agg((x ->> 'id')::uuid) into ids from get_featured(12) x;
  assert array_length(ids, 1) = 2 and not (b2 = any (ids)) and ids @> array[b3, b4], 'capped profile skipped, others featured: ' || ids::text;
  -- p_only narrows to the viewer's filter matches (never widens to non-boosted profiles).
  select array_agg((x ->> 'id')::uuid) into ids from get_featured(12, array[b3]) x;
  assert ids = array[b3], 'p_only narrows: ' || coalesce(ids::text, 'none');
  select array_agg((x ->> 'id')::uuid) into ids from get_featured(12, array[(select id from profiles where user_id = '00000000-0000-0000-0000-00000000bf05')]) x;
  assert ids is null, 'p_only cannot add a profile that is not boosted';
  begin perform get_featured(12, array_fill(b3, array[2001])); assert false, 'oversized p_only'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- A profile already featured today stays featured for the rest of the day, even if it reaches the cap.
insert into boost_impressions (profile_id, viewer_user_id, day)
select current_setting('test.b3')::uuid, '00000000-0000-0000-0000-00000000bf01', (now() at time zone 'utc')::date - 2;
set role authenticated;
do $$ declare b3 uuid := current_setting('test.b3')::uuid; begin
  assert exists (select 1 from get_featured(12) x where (x ->> 'id')::uuid = b3), 'featured today stays for the day';
  assert (select count(*) from boost_impressions where viewer_user_id = auth.uid()) = 0, 'members cannot read impressions';
end $$;
reset role;
do $$ begin
  assert (select count(*) from boost_impressions where viewer_user_id = '00000000-0000-0000-0000-00000000bf01' and day = (now() at time zone 'utc')::date) = 2,
    'one impression per profile per day';
end $$;
-- Size and on/off are admin settings.
update pricing_config set config = config || '{"featuredMaxCards": 1}';
set role authenticated;
do $$ begin assert (select count(*) from get_featured(12)) = 1, 'featuredMaxCards'; end $$;
reset role;
update pricing_config set config = config || '{"featuredEnabled": false}';
set role authenticated;
do $$ begin assert (select count(*) from get_featured(12)) = 0, 'Featured switched off'; end $$;
reset role;
update pricing_config set config = config || '{"featuredEnabled": true, "featuredMaxCards": 12}';
-- Settings are validated by the database.
do $$ begin
  begin update pricing_config set config = config || '{"featuredMaxCards": 31}'; assert false, 'max cards range'; exception when check_violation then null; end;
  begin update pricing_config set config = config || '{"featuredCapDaysPer7": 0}'; assert false, 'cap range'; exception when check_violation then null; end;
  begin update pricing_config set config = config || '{"boostEnabled": "yes"}'; assert false, 'switch type'; exception when check_violation then null; end;
  begin update pricing_config set config = jsonb_set(config, '{boostPlans,0,promoLabel}', '"<b>Best</b>"'); assert false, 'label markup'; exception when check_violation then null; end;
  begin update pricing_config set config = jsonb_set(config, '{boostPlans,0,promoLabel}', to_jsonb(repeat('x', 25))); assert false, 'label length'; exception when check_violation then null; end;
  update pricing_config set config = jsonb_set(config, '{boostPlans,0,promoLabel}', '"Best value"');
end $$;
-- Boost master switch and photo rule apply to every new boost (start_boost and the order trigger).
update pricing_config set config = config || '{"boostEnabled": false}';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bf05', false);
do $$ begin
  begin perform start_boost(null); assert false, 'boost switched off'; exception when others then assert sqlerrm = 'fee_disabled', sqlerrm; end;
  begin perform start_boost('d14'); assert false, 'boost switched off (explicit plan)'; exception when others then assert sqlerrm = 'fee_disabled', sqlerrm; end;
end $$;
reset role;
update pricing_config set config = config || '{"boostEnabled": true, "boostRequirePhoto": true}';
set role authenticated;
do $$ begin
  begin perform start_boost('d14'); assert false, 'photo required'; exception when others then assert sqlerrm = 'photo_required', sqlerrm; end;
end $$;
reset role;
update profiles set biodata = jsonb_set(biodata, '{photos}', '[{"id":"ph1","uri":"00000000-0000-0000-0000-00000000bf05/ph1.jpg"}]') where user_id = '00000000-0000-0000-0000-00000000bf05';
set role authenticated;
do $$ declare r jsonb; begin
  r := start_boost('d14');
  assert r #>> '{order,status}' = 'pending' and (r #>> '{order,amount}')::int > 0, 'eligible profile can boost: ' || r::text;
end $$;
-- Boosts already running keep their terms when Boost is switched off: still featured.
reset role;
update pricing_config set config = config || '{"boostEnabled": false, "boostRequirePhoto": false}';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000bf01', false);
do $$ begin assert (select count(*) from get_featured(12)) >= 1, 'running boosts unaffected by the switch'; end $$;
reset role;
update pricing_config set config = config || '{"boostEnabled": true}';
set role anon;
do $$ begin
  begin perform get_featured(12, null); assert false, 'anon'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL BOOST-VISIBILITY TESTS PASSED' as result;
