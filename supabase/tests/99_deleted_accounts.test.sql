\set ON_ERROR_STOP on
-- Deleted accounts (owner decision 2026-11-02): an admin-only 30-day copy of a member who deleted
-- their own account; the admins are told who it was; members can never read it; expired copies go.
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-0000000de001', '919611300001'),
 ('00000000-0000-0000-0000-0000000de002', '919611300002'),
 ('00000000-0000-0000-0000-0000000de003', '919611300003');
insert into app_users (id, country_code, phone, role) values
 ('00000000-0000-0000-0000-0000000de001', '+91', '9611300001', 'user'),
 ('00000000-0000-0000-0000-0000000de002', '+91', '9611300002', 'admin'),
 ('00000000-0000-0000-0000-0000000de003', '+91', '9611300003', 'user');
insert into profiles (user_id, biodata, last_step, status) values
 ('00000000-0000-0000-0000-0000000de001',
  '{"basic":{"createdFor":"self","lookingFor":"groom","fullName":"Ayesha Khan","dob":"1998-05-04","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu","aboutMe":"Teacher"},"photos":[{"id":"p1","uri":"00000000-0000-0000-0000-0000000de001/p1.jpg"}],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"education"},"religion":{},"family":{},"preferences":{},"privacy":{}}',
  7, 'published');

-- The member deletes their own account (the delete-account function removes the auth user → cascade).
delete from auth.users where id = '00000000-0000-0000-0000-0000000de001';

do $$
declare d deleted_accounts;
begin
  select * into d from deleted_accounts where user_id = '00000000-0000-0000-0000-0000000de001';
  assert d.id is not null, 'a copy was kept';
  assert d.full_name = 'Ayesha Khan' and d.code is not null, 'who it was';
  assert d.phone_masked not like '%9611300001%', 'phone stays masked';
  assert d.profile #>> '{biodata,basic,aboutMe}' = 'Teacher', 'the full biodata';
  assert d.photo_paths = array['00000000-0000-0000-0000-0000000de001/p1.jpg'], 'photo paths kept for the purge';
  assert d.purge_after between now() + interval '29 days 23 hours' and now() + interval '30 days 1 hour', '30 days';
  assert not exists (select 1 from profiles where user_id = '00000000-0000-0000-0000-0000000de001'), 'the live profile is gone';
  assert exists (select 1 from notifications where user_id = '00000000-0000-0000-0000-0000000de002'
                 and params ->> 'kind' = 'account_deleted' and params ->> 'name' = 'Ayesha Khan'
                 and deep_link = '/admin/deleted/' || d.id), 'admin alert names the member and opens the copy';
end $$;

-- A member can never read copies; an admin can, and the view is audited.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000de003';
do $$ begin
  begin perform admin_deleted_accounts(); assert false, 'members must not list copies'; exception when insufficient_privilege then null; end;
  begin perform 1 from deleted_accounts; assert (select count(*) from deleted_accounts) = 0, 'RLS hides the table'; exception when insufficient_privilege then null; end;
  begin perform due_deleted_account_purges(10); assert false, 'members must not reach the purge'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000de002';
do $$
declare j jsonb; id uuid;
begin
  select (x ->> 'id')::uuid into id from admin_deleted_accounts() x limit 1;
  assert id is not null, 'admin sees the list';
  j := admin_deleted_account(id);
  assert j #>> '{profile,biodata,basic,fullName}' = 'Ayesha Khan', 'admin opens the full profile';
end $$;
reset role;
reset request.jwt.claim.sub;
do $$ begin
  assert exists (select 1 from audit_events where action = 'deleted_account.viewed'), 'viewing is audited';
end $$;

-- After 30 days: no longer listed; the purge removes it.
update deleted_accounts set purge_after = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-0000000de001';
do $$
declare ids uuid[]; mine uuid := (select id from deleted_accounts where user_id = '00000000-0000-0000-0000-0000000de001');
begin
  select array_agg(id) into ids from due_deleted_account_purges(500);
  assert mine = any(ids), 'due for purge';
  assert not exists (select 1 from due_deleted_account_purges(500) x where x.id <> mine and x.id in (select id from deleted_accounts where purge_after > now())), 'only expired ones';
  assert finish_deleted_account_purge(array[mine]) = 1, 'erased';
  assert not exists (select 1 from deleted_accounts where id = mine), 'gone';
end $$;
select 'ALL DELETED ACCOUNTS TESTS PASSED' as result;
