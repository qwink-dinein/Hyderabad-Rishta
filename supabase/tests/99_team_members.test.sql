\set ON_ERROR_STOP on
-- Team-added members: admin adds a member for a number (no OTP); the owner claims it on first sign-in.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000abc01'), ('00000000-0000-0000-0000-0000000abc02'), ('00000000-0000-0000-0000-0000000abc03'), ('00000000-0000-0000-0000-0000000abc04');
insert into app_users (id, country_code, phone, role) values
 ('00000000-0000-0000-0000-0000000abc01', '+91', '9666500001', 'admin'),   -- a sub-admin
 ('00000000-0000-0000-0000-0000000abc02', '+91', '9666500002', 'user');    -- an ordinary member
\set bio '{"basic":{"lookingFor":"groom","fullName":"Team Added","dob":"1998-02-02","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'

-- 1. The Edge Function (service role) creates the member for a new auth user.
select id as team_profile from admin_create_member('00000000-0000-0000-0000-0000000abc01', '00000000-0000-0000-0000-0000000abc03', '+91', '9666500003', :'bio', 7) \gset
do $$ begin
  assert (select status from profiles where user_id = '00000000-0000-0000-0000-0000000abc03') = 'draft', 'starts as a draft';
  assert (select created_by from app_users where id = '00000000-0000-0000-0000-0000000abc03') = '00000000-0000-0000-0000-0000000abc01', 'remembers who added it';
  assert (select count(*) from audit_events where action = 'member.created_by_team') = 1, 'audited';
  -- the same number again (any account) is refused; a non-admin "admin" id is refused
  begin perform admin_create_member('00000000-0000-0000-0000-0000000abc01', '00000000-0000-0000-0000-0000000abc04', '+91', '9666500003', '{"basic":{"fullName":"Dup"}}', 1); assert false, 'duplicate number';
  exception when raise_exception then null; end;
  begin perform admin_create_member('00000000-0000-0000-0000-0000000abc02', '00000000-0000-0000-0000-0000000abc04', '+91', '9666500004', '{"basic":{"fullName":"X"}}', 1); assert false, 'member posing as admin';
  exception when insufficient_privilege then null; end;
end $$;

set role authenticated;
-- 2. Members can't call the creation function at all, nor edit/publish team biodatas.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000abc02', false);
do $$ begin
  begin perform admin_create_member('00000000-0000-0000-0000-0000000abc01', '00000000-0000-0000-0000-0000000abc04', '+91', '9666500004', '{"basic":{"fullName":"X"}}', 1); assert false, 'members cannot create';
  exception when insufficient_privilege then null; end;
  begin perform admin_save_member_biodata(current_setting('test.p', true)::uuid, '{}', 1); assert false, 'members cannot edit';
  exception when others then null; end;
end $$;
select set_config('test.p', :'team_profile', false);
do $$ begin
  begin perform admin_publish_member(current_setting('test.p')::uuid); assert false, 'members cannot publish';
  exception when insufficient_privilege then null; end;
end $$;

-- 3. The (sub-)admin edits and publishes it; the owner gets a "created for you" notice.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000abc01', false);
select admin_save_member_biodata(:'team_profile', :'bio', 7) is not null;
select admin_publish_member(:'team_profile') is not null;
select admin_publish_member(:'team_profile') is not null; -- twice is harmless
reset role;
do $$ begin
  assert (select status from profiles where id = current_setting('test.p')::uuid) = 'published', 'published by the team';
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000abc03' and type = 'team_created') = 1, 'one notice';
end $$;

-- 4. The owner signs in (same account by phone) and claims it; then only the owner edits.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000abc03', false);
do $$ begin
  assert claim_account() = true, 'first claim';
  assert claim_account() = false, 'claim is idempotent';
end $$;
update profiles set biodata = jsonb_set(biodata, '{basic,fullName}', '"Team Added Owner"') where user_id = auth.uid();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000abc01', false);
do $$ begin
  begin perform admin_save_member_biodata(current_setting('test.p')::uuid, '{"basic":{"fullName":"Hijack"}}', 7); assert false, 'claimed: team can no longer edit';
  exception when raise_exception then null; end;
end $$;
reset role;
do $$ begin
  assert (select claimed_at is not null from app_users where id = '00000000-0000-0000-0000-0000000abc03'), 'claimed';
  assert (select owner_reviewed_at is not null from profiles where id = current_setting('test.p')::uuid), 'owner review recorded';
  -- a normal member's claim does nothing
  assert (select count(*) from app_users where id = '00000000-0000-0000-0000-0000000abc02' and claimed_at is not null) = 0, 'normal members untouched';
end $$;

-- 5. A member can't forge "team-made" on their own new biodata.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000abc02', false);
insert into profiles (user_id, biodata, created_by_admin) values ('00000000-0000-0000-0000-0000000abc02', :'bio', '00000000-0000-0000-0000-0000000abc01');
reset role;
do $$ begin
  assert (select created_by_admin from profiles where user_id = '00000000-0000-0000-0000-0000000abc02') is null, 'forged team flag cleared';
end $$;
select 'ALL TEAM-MEMBER TESTS PASSED' as result;
