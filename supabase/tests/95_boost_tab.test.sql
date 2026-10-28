\set ON_ERROR_STOP on
-- Weekly boost reminders: only for live, unboosted profiles; never twice a week; never right after
-- publishing or a boost; respect "boost disabled"; promotional push category.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000ba1'), ('00000000-0000-0000-0000-000000000ba2'), ('00000000-0000-0000-0000-000000000ba3'), ('00000000-0000-0000-0000-000000000ba4');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-000000000ba1', '+91', '9666000001'), ('00000000-0000-0000-0000-000000000ba2', '+91', '9666000002'),
 ('00000000-0000-0000-0000-000000000ba3', '+91', '9666000003'), ('00000000-0000-0000-0000-000000000ba4', '+91', '9666000004');
insert into profiles (id, user_id, biodata, status, published_at, boost_until) values
 ('b0000000-0000-0000-0000-000000000ba1', '00000000-0000-0000-0000-000000000ba1', '{"basic":{"lookingFor":"bride"},"photos":[]}', 'published', now() - interval '10 days', null),              -- due
 ('b0000000-0000-0000-0000-000000000ba2', '00000000-0000-0000-0000-000000000ba2', '{"basic":{"lookingFor":"bride"},"photos":[]}', 'published', now() - interval '10 days', now() + interval '3 days'), -- boosted
 ('b0000000-0000-0000-0000-000000000ba3', '00000000-0000-0000-0000-000000000ba3', '{"basic":{"lookingFor":"bride"},"photos":[]}', 'published', now() - interval '1 day', null),                -- just published
 ('b0000000-0000-0000-0000-000000000ba4', '00000000-0000-0000-0000-000000000ba4', '{"basic":{"lookingFor":"bride"},"photos":[]}', 'draft', null, null);                                           -- draft
select run_boost_jobs();
do $$
declare c1 int; c2 int; c3 int; c4 int; link text;
begin
  select count(*) into c1 from notifications where user_id = '00000000-0000-0000-0000-000000000ba1' and type = 'boost_reminder';
  select count(*) into c2 from notifications where user_id = '00000000-0000-0000-0000-000000000ba2' and type = 'boost_reminder';
  select count(*) into c3 from notifications where user_id = '00000000-0000-0000-0000-000000000ba3' and type = 'boost_reminder';
  select count(*) into c4 from notifications where user_id = '00000000-0000-0000-0000-000000000ba4' and type = 'boost_reminder';
  assert c1 = 1, 'live unboosted profile reminded once';
  assert c2 = 0 and c3 = 0 and c4 = 0, 'boosted / just published / draft not reminded';
  select deep_link into link from notifications where user_id = '00000000-0000-0000-0000-000000000ba1' and type = 'boost_reminder';
  assert link = '/boost', 'reminder opens the Boost tab';
  assert push_category('boost_reminder') = 'announcements', 'reminder is promotional, member can switch it off';
end $$;
select run_boost_jobs(); -- runs every 5 minutes: no second reminder within the week
do $$ begin
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000ba1' and type = 'boost_reminder') = 1, 'never twice in a week';
end $$;
update profiles set boost_reminded_at = now() - interval '8 days' where id = 'b0000000-0000-0000-0000-000000000ba1';
update pricing_config set config = jsonb_set(config, '{boost,groom,mode}', '"disabled"');
select run_boost_jobs();
do $$ begin
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000ba1' and type = 'boost_reminder') = 1, 'no reminder while boosting is disabled';
end $$;
update pricing_config set config = jsonb_set(config, '{boost,groom,mode}', '"paid"');
select run_boost_jobs();
do $$ begin
  assert (select count(*) from notifications where user_id = '00000000-0000-0000-0000-000000000ba1' and type = 'boost_reminder') = 2, 'next week: reminded again';
end $$;
insert into notifications (user_id, type, deep_link) values ('00000000-0000-0000-0000-000000000ba2', 'boost_started', '/dashboard');
do $$ begin
  assert (select deep_link from notifications where user_id = '00000000-0000-0000-0000-000000000ba2' and type = 'boost_started') = '/boost', 'boost notices open the Boost tab';
end $$;
select 'ALL BOOST TAB TESTS PASSED' as result;
