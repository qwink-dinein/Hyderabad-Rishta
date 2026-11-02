\set ON_ERROR_STOP on
-- 20261203 referral-based free Boosts: every rule from the owner's spec, against the real functions.
reset role;
-- Accounts: A = referrer (live groom), B/C/D = invited families, E = admin-added, F = a number that had an
-- account before (ledger), Z = admin.
insert into auth.users (id, phone) select ('00000000-0000-0000-0000-0000000ef00' || i)::uuid, '91961180000' || i from generate_series(1, 8) i;
insert into referral_phone_ledger (phone_hash, first_user_id) values (referral_phone_hash('+91', '9611800006'), gen_random_uuid());
insert into app_users (id, country_code, phone, role) values
  ('00000000-0000-0000-0000-0000000ef001', '+91', '9611800001', 'user'),
  ('00000000-0000-0000-0000-0000000ef002', '+91', '9611800002', 'user'),
  ('00000000-0000-0000-0000-0000000ef003', '+91', '9611800003', 'user'),
  ('00000000-0000-0000-0000-0000000ef004', '+91', '9611800004', 'user'),
  ('00000000-0000-0000-0000-0000000ef006', '+91', '9611800006', 'user'),
  ('00000000-0000-0000-0000-0000000ef008', '+91', '9611800008', 'admin');
insert into app_users (id, country_code, phone, role, created_by) values
  ('00000000-0000-0000-0000-0000000ef005', '+91', '9611800005', 'user', '00000000-0000-0000-0000-0000000ef008');

-- A full biodata (every item of the completion bar) for a given owner; photos must live under the owner's folder.
create or replace function pg_temp.full_bio(owner uuid, looking text, name text) returns jsonb language sql as $$
  select jsonb_build_object(
    'basic', jsonb_build_object('createdFor','self','lookingFor',looking,'fullName',name,'dob','1994-03-03','heightCm',170,
      'maritalStatus','never_married','motherTongue','urdu','aboutMe','Calm, kind and close to family; works in IT.'),
    'photos', jsonb_build_array(jsonb_build_object('id','p1','uri', owner::text || '/main.jpg')),
    'location', jsonb_build_object('country','India','state','Telangana','city','Hyderabad'),
    'career', jsonb_build_object('education','bachelors','profession','it'),
    'religion', jsonb_build_object('maslak','sunni','namaz','mostly'),
    'family', jsonb_build_object('familyType','nuclear','fatherOccupation','Business'),
    'preferences', jsonb_build_object('ageMin',22,'ageMax',30),
    'privacy', jsonb_build_object('displayName','first','photoVisibility','public','incomeVisibility','hidden','familyVisibility','public','acceptContactRequests',true));
$$;
grant execute on function pg_temp.full_bio(uuid, text, text) to authenticated;
insert into profiles (user_id, biodata, status, published_at) values
  ('00000000-0000-0000-0000-0000000ef001', pg_temp.full_bio('00000000-0000-0000-0000-0000000ef001', 'bride', 'Imran Referrer'), 'published', now());
update pricing_config set require_approval = false;
update referral_settings set mode = 'referral', enabled = true, reward_days = 7, invitee_reward = true, review = true;

do $$ begin
  assert (select count(*) from referral_codes where user_id::text like '00000000-0000-0000-0000-0000000ef00%') = 7, 'every new account gets a code';
  assert (select count(distinct code) from referral_codes) = (select count(*) from referral_codes), 'codes are unique';
  assert (select code from referral_codes where user_id = '00000000-0000-0000-0000-0000000ef001') ~ '^HR[2-9A-HJKMNP-Z]{4,6}$', 'code format';
end $$;
select code as acode from referral_codes where user_id = '00000000-0000-0000-0000-0000000ef001' \gset

-- Members cannot read the tables directly.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef002', false);
do $$ begin
  begin perform 1 from referrals; assert false, 'table readable'; exception when insufficient_privilege then null; end;
  begin perform 1 from referral_rewards; assert false, 'table readable'; exception when insufficient_privilege then null; end;
  begin perform 1 from referral_codes; assert false, 'table readable'; exception when insufficient_privilege then null; end;
end $$;

-- Wrong code, own code, then B joins with A's code (twice: a retry is fine), then tries another code.
do $$ begin
  begin perform claim_referral('HRZZZZ'); assert false, 'unknown code accepted'; exception when others then assert sqlerrm like 'referral_invalid%', sqlerrm; end;
end $$;
select claim_referral(:'acode') ->> 'status' as s1 \gset
select claim_referral(lower(:'acode')) ->> 'status' as s2 \gset
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef001', false);
do $$ begin
  begin perform claim_referral((select get_my_referral() ->> 'code')); assert false, 'self referral'; exception when others then assert sqlerrm like 'referral_self%', sqlerrm; end;
end $$;
-- Admin-added account and a returning number are not "new".
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef005', false);
do $$ begin
  begin perform claim_referral(current_setting('my.acode', true)); exception when others then null; end;
end $$;
reset role;
select set_config('my.acode', :'acode', false);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef005', false);
do $$ begin
  begin perform claim_referral(current_setting('my.acode')); assert false, 'admin-added account eligible'; exception when others then assert sqlerrm like 'referral_not_eligible%', sqlerrm; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef006', false);
do $$ begin
  begin perform claim_referral(current_setting('my.acode')); assert false, 'returning number eligible'; exception when others then assert sqlerrm like 'referral_not_eligible%', sqlerrm; end;
end $$;
-- C and D join too.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef003', false);
select claim_referral(current_setting('my.acode'));
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef004', false);
select claim_referral(current_setting('my.acode'));
reset role;
do $$ begin
  assert (select count(*) from referrals where referrer_user_id = '00000000-0000-0000-0000-0000000ef001') = 3, 'three families joined';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000ef001' and type = 'referral_joined') = 3, 'referrer told each time';
end $$;
-- B cannot switch to another code now (B already has one).
insert into profiles (user_id, biodata, status) values ('00000000-0000-0000-0000-0000000ef008', pg_temp.full_bio('00000000-0000-0000-0000-0000000ef008', 'groom', 'Zed Admin'), 'draft');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef002', false);
do $$ begin
  begin perform claim_referral((select code from referral_codes limit 0)); exception when others then null; end;
end $$;
reset role;
do $$ declare other text; begin
  select code into other from referral_codes where user_id = '00000000-0000-0000-0000-0000000ef008';
  perform set_config('my.zcode', other, false);
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef002', false);
do $$ begin
  begin perform claim_referral(current_setting('my.zcode')); assert false, 'code changed after sign-up'; exception when others then assert sqlerrm like 'referral_locked%', sqlerrm; end;
end $$;

-- B publishes an INCOMPLETE biodata (no photo, no about-me): stays "registered" — no reward.
reset role;
insert into profiles (user_id, biodata, status, published_at) values ('00000000-0000-0000-0000-0000000ef002',
  pg_temp.full_bio('00000000-0000-0000-0000-0000000ef002', 'groom', 'Sana Bride') - 'photos', 'published', now());
do $$ begin
  assert (select status from referrals where referred_user_id = '00000000-0000-0000-0000-0000000ef002') = 'registered', 'incomplete is not rewarded';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef001', false);
do $$ declare v jsonb := get_my_referral(); begin
  assert v #>> '{stats,referred}' = '3', 'stats referred';
  assert exists (select 1 from jsonb_array_elements(v -> 'referrals') x where x ->> 'stage' = 'incomplete' and x ->> 'initial' = 'S'), 'stage incomplete, initial only';
  assert v::text !~ '96118', 'no phone numbers in the referrer view';
  assert v::text !~ 'Sana Bride', 'no names in the referrer view';
end $$;

-- B completes it (photo added) → 100% and live → waits for the team (review is on).
reset role;
update profiles set biodata = pg_temp.full_bio('00000000-0000-0000-0000-0000000ef002', 'groom', 'Sana Bride') where user_id = '00000000-0000-0000-0000-0000000ef002';
do $$ begin
  assert (select status from referrals where referred_user_id = '00000000-0000-0000-0000-0000000ef002') = 'review', 'complete + live → team check';
  assert not exists (select 1 from referral_rewards), 'no reward before the check';
  assert exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000ef001' and type = 'referral_completed'), 'referrer told it is waiting';
  assert exists (select 1 from notifications where type = 'admin_alert' and params ->> 'kind' = 'referral_review'), 'admins alerted';
end $$;

-- A member cannot approve; the admin approves → exactly one Boost each, even when approved twice.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef001', false);
do $$ begin
  begin perform admin_decide_referral((select id from referrals limit 0), true); exception when others then null; end;
  begin perform admin_referral_overview(); assert false, 'member reached admin overview'; exception when others then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef008', false);
select id as refb from admin_list_referrals('review', null) x, lateral (select (x ->> 'id')::uuid as id) y limit 1 \gset
select admin_decide_referral(:'refb', true, 'Looks genuine');
select admin_decide_referral(:'refb', true, 'double tap');
reset role;
update profiles set biodata = biodata || '{"x":1}'::jsonb - 'x' where user_id = '00000000-0000-0000-0000-0000000ef002'; -- trigger fires again
do $$ begin
  assert (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef001') = 1, 'referrer: exactly one';
  assert (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef002' and role = 'invitee') = 1, 'invitee: exactly one';
  assert (select days from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef001') = 7, '7 days';
  assert exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000ef002' and type = 'referral_welcome'), 'invitee told';
end $$;

-- Review off: C completes → rewarded straight away. D gets rejected by the team.
update referral_settings set review = false;
insert into profiles (user_id, biodata, status, published_at) values
  ('00000000-0000-0000-0000-0000000ef003', pg_temp.full_bio('00000000-0000-0000-0000-0000000ef003', 'groom', 'Hina Bride'), 'published', now());
update referral_settings set review = true;
insert into profiles (user_id, biodata, status, published_at) values
  ('00000000-0000-0000-0000-0000000ef004', pg_temp.full_bio('00000000-0000-0000-0000-0000000ef004', 'groom', 'Zoya Bride'), 'published', now());
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef008', false);
select (x ->> 'id')::uuid as refd from admin_list_referrals('review', 'zoya') x limit 1 \gset
select admin_decide_referral(:'refd', false, 'Duplicate of another biodata');
reset role;
do $$ begin
  assert (select status from referrals where referred_user_id = '00000000-0000-0000-0000-0000000ef003') = 'rewarded', 'no check needed → rewarded';
  assert (select status from referrals where referred_user_id = '00000000-0000-0000-0000-0000000ef004') = 'rejected', 'rejected';
  assert (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef001' and status = 'available') = 2, 'two referrals → two Boosts (no cap)';
end $$;

-- Mode switch (referral → paid → referral) changes nothing already earned.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef008', false);
select admin_referral_settings_update('paid', true, 7, true, true);
select admin_referral_settings_update('referral', true, 7, true, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef001', false);
do $$ declare v jsonb := get_my_referral(); begin
  assert v #>> '{stats,available}' = '2' and v #>> '{stats,earned}' = '2' and v #>> '{stats,approved}' = '2', 'balance intact after switches';
end $$;

-- A uses one: same Boost fields as any Boost; balance −1; no second while running.
select (use_referral_boost() #>> '{reward,days}') as src \gset
do $$ begin
  begin perform use_referral_boost(); assert false, 'two Boosts at once'; exception when others then assert sqlerrm like 'boost_active%', sqlerrm; end;
end $$;
reset role;
do $$ begin
  assert current_setting('my.acode', true) is not null;
  assert (select boost_until > now() + interval '6 days' from profiles where user_id = '00000000-0000-0000-0000-0000000ef001'), 'boost runs 7 days';
  assert not exists (select 1 from orders where user_id = '00000000-0000-0000-0000-0000000ef001'), 'no order written (orders stay purchases)';
  assert exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000ef001' and type = 'boost_started'), 'same Boost-started notice';
  assert (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef001' and status = 'used') = 1, 'one used';
  assert (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef001' and status = 'available') = 1, 'one left';
end $$;

-- Revoke the running one (reason required): the Boost ends now; the unused one is untouched.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef008', false);
do $$ begin
  begin perform admin_revoke_referral_reward((select id from referral_rewards limit 0), ''); exception when others then null; end;
end $$;
reset role;
select id as usedrw from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef001' and status = 'used' \gset
set role authenticated;
do $$ begin
  begin perform admin_revoke_referral_reward(current_setting('my.acode')::uuid, ''); exception when others then null; end;
end $$;
select admin_revoke_referral_reward(:'usedrw', 'Fraud found later');
reset role;
do $$ begin
  assert (select boost_until <= now() from profiles where user_id = '00000000-0000-0000-0000-0000000ef001'), 'revoked running Boost ended';
  assert (select count(*) from referral_rewards where user_id = '00000000-0000-0000-0000-0000000ef001' and status = 'available') = 1, 'other Boost untouched';
  assert exists (select 1 from audit_events where action = 'referral.revoked' and meta ->> 'reason' = 'Fraud found later'), 'audited with reason';
end $$;

-- Admin overview counts paid and referral Boosts separately; public settings readable signed-out.
set role anon;
do $$ begin assert get_referral_settings() ->> 'mode' = 'referral', 'public mode'; end $$;
do $$ begin assert record_referral_visit(current_setting('my.acode')), 'visit counted'; assert not record_referral_visit('nope'), 'bad code';
  assert check_referral_code(lower(current_setting('my.acode'))) and not check_referral_code('HRZZZZ'), 'code check'; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ef008', false);
do $$ declare o jsonb := admin_referral_overview(); begin
  assert o ->> 'referred' = '3' and o ->> 'approved' = '2' and o ->> 'rejected' = '1', 'overview counts ' || o::text;
  assert o ->> 'freeReferralBoosts' = '1' and (o ->> 'visits')::int >= 1, 'overview boosts/visits ' || o::text;
end $$;
reset role;
update pricing_config set require_approval = true;
update referral_settings set mode = 'paid', review = true;
select 'ALL REFERRAL-BOOST TESTS PASSED (' || :'s1' || '/' || :'s2' || '/' || :'src' || ')' as result;
