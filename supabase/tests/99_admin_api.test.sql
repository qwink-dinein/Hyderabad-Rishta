\set ON_ERROR_STOP on
-- Admin console API: members get nothing; admins get masked data, moderation and announcements.
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-00000000dd01', '919722200001'),   -- sub-admin
 ('00000000-0000-0000-0000-00000000dd02', '919722200002'),   -- member (bride)
 ('00000000-0000-0000-0000-00000000dd03', '919722200003');   -- member, no profile
insert into app_users (id, country_code, phone, role) values
 ('00000000-0000-0000-0000-00000000dd01', '+91', '9722200001', 'admin'),
 ('00000000-0000-0000-0000-00000000dd02', '+91', '9722200002', 'user'),
 ('00000000-0000-0000-0000-00000000dd03', '+91', '9722200003', 'user');
insert into profiles (user_id, biodata, last_step, status) values ('00000000-0000-0000-0000-00000000dd02',
 '{"basic":{"createdFor":"self","lookingFor":"groom","fullName":"Rubina Admintest","dob":"1996-01-01","heightCm":158,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[{"id":"p1","uri":"00000000-0000-0000-0000-00000000dd02/p1.jpg"}],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"public","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 7, 'published');
insert into reports (reporter_user_id, profile_id, reason) select '00000000-0000-0000-0000-00000000dd03', id, 'fake' from profiles where user_id = '00000000-0000-0000-0000-00000000dd02';
select set_config('test.rep', id::text, false) from reports where reporter_user_id = '00000000-0000-0000-0000-00000000dd03';

set role authenticated;
-- 1. Members are refused everywhere.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dd03', false);
do $$ declare f text; begin
  foreach f in array array['admin_stats()', 'admin_list_profiles(null)', 'admin_list_users()', 'admin_list_orders()', 'admin_list_reports()',
    'admin_list_requests()', 'admin_audit_log()', 'admin_list_trash()', 'master_list_admins()', 'master_security_status()',
    'admin_audience_count(''all'')', 'admin_list_announcements()', 'admin_check_phone(''+91'', ''9722200002'')'] loop
    begin execute 'select ' || f; assert false, 'member ran ' || f; exception when insufficient_privilege then null; end;
  end loop;
end $$;

-- 2. Sub-admin: masked data, no raw numbers anywhere.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000dd01', false);
do $$ declare st jsonb; t text; begin
  st := admin_stats();
  assert (st #>> '{profiles,published}')::int >= 1 and st ? 'connections' and st ? 'push' and st ? 'boosts', 'stats shape: ' || st;
  select string_agg(x::text, ' ') into t from admin_list_users() x;
  assert t not like '%9722200002%' and t like '%••••0002%', 'user list masks phones';
  select string_agg(x::text, ' ') into t from admin_list_profiles('published') x;
  assert t like '%Rubina Admintest%' and t not like '%9722200002%', 'profile list masks phones';
  assert (select count(*) from admin_list_reports() x where x ->> 'profile_name' = 'Rubina Admintest') = 1, 'report shows the profile';
  assert (admin_check_phone('+91', '9722200002') ->> 'available')::boolean = false, 'taken number';
  assert (admin_check_phone('+91', '9722299999') ->> 'available')::boolean, 'free number';
  assert (admin_get_member('00000000-0000-0000-0000-00000000dd02') #>> '{member,code}') like 'HR-%', 'member detail';
  assert (admin_get_member('00000000-0000-0000-0000-00000000dd02'))::text not like '%9722200002%', 'member detail masks phone';
  assert (select count(*) from master_list_admins() x where x ->> 'id' = '00000000-0000-0000-0000-00000000dd01') = 1, 'team list';
  assert master_security_status() ? 'codesRemaining', 'security status';
end $$;

-- 3. Moderation: resolve a report and pause the profile; remove a photo.
do $$ declare pid uuid; begin
  perform admin_resolve_report(current_setting('test.rep')::uuid, 'resolved', true);
  begin perform admin_resolve_report(current_setting('test.rep')::uuid, 'bogus', false); assert false, 'bad status'; exception when invalid_parameter_value then null; end;
  select (x ->> 'id')::uuid into pid from admin_list_profiles(null) x where x #>> '{biodata,basic,fullName}' = 'Rubina Admintest';
  assert (select x ->> 'status' from admin_list_profiles(null) x where (x ->> 'id')::uuid = pid) = 'paused', 'profile paused';
  perform admin_remove_photo(pid, 'p1');
  assert (select jsonb_array_length(x #> '{biodata,photos}') from admin_list_profiles(null) x where (x ->> 'id')::uuid = pid) = 0, 'photo removed';
end $$;

-- 4. Announcements: validation, publish now (fan-out to the right audience), schedule + job, archive, stats.
do $$ declare a announcements; n int; begin
  begin perform admin_save_announcement('{"title":{"en":""},"body":{"en":"x"},"segment":"all"}'); assert false, 'empty title'; exception when invalid_parameter_value then null; end;
  begin perform admin_save_announcement('{"title":{"en":"t"},"body":{"en":"x"},"segment":"all","deepLink":"https://evil.example"}'); assert false, 'external link'; exception when invalid_parameter_value then null; end;
  begin perform admin_save_announcement('{"title":{"en":"t"},"body":{"en":"x"},"segment":"all","imageUrl":"http://x"}'); assert false, 'http image'; exception when invalid_parameter_value then null; end;
  n := admin_audience_count('brides');
  a := admin_save_announcement('{"title":{"en":"Eid Mubarak"},"body":{"en":"From the team"},"segment":"brides","deepLink":"/discover"}');
  assert a.status = 'draft', 'saved as draft';
  a := admin_publish_announcement(a.id, null);
  assert a.status = 'published', 'published';
  assert (select count(*) from announcement_deliveries where announcement_id = a.id) = n, 'delivered to the brides segment only';
  perform set_config('test.ann', a.id::text, false);
  begin perform admin_save_announcement(jsonb_build_object('id', a.id, 'title', '{"en":"x"}'::jsonb, 'body', '{"en":"y"}'::jsonb, 'segment', 'all')); assert false, 'edited a published one';
  exception when raise_exception then null; end;
  assert (select (x #>> '{stats,targeted}')::int from admin_list_announcements() x where (x ->> 'id')::uuid = a.id) = n, 'stats count recipients';
  a := admin_save_announcement('{"title":{"en":"Later"},"body":{"en":"Soon"},"segment":"all"}');
  a := admin_publish_announcement(a.id, now() + interval '1 hour');
  assert a.status = 'scheduled', 'scheduled';
  assert (admin_archive_announcement(a.id)).status = 'archived', 'archived';
end $$;
reset role;
do $$ begin
  assert (select count(*) from notifications where announcement_id = current_setting('test.ann')::uuid and user_id = '00000000-0000-0000-0000-00000000dd02') = 1, 'the bride is notified';
  assert (select count(*) from notifications where announcement_id = current_setting('test.ann')::uuid and user_id = '00000000-0000-0000-0000-00000000dd03') = 0, 'not the member without a profile';
end $$;
-- Scheduled announcements go out when due.
insert into announcements (title, body, segment, status, scheduled_at) values ('{"en":"Due"}', '{"en":"Now"}', 'all', 'scheduled', now() - interval '1 minute');
select run_announcement_jobs() as published_jobs \gset
do $$ begin assert (select status from announcements where title ->> 'en' = 'Due') = 'published', 'scheduled job published'; end $$;
select 'ALL ADMIN-API TESTS PASSED' as result;
