\set ON_ERROR_STOP on
-- Retention keeps growth-prone tables bounded and never touches lifetime records.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000007f1');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000007f1', '+91', '9477700001');
insert into notifications (user_id, type, created_at, read_at)
  select '00000000-0000-0000-0000-0000000007f1', 'profile_viewed', now() - (g || ' minutes')::interval, null from generate_series(1, 260) g;
insert into notifications (user_id, type, created_at, read_at)
  values ('00000000-0000-0000-0000-0000000007f1', 'poke', now() - interval '1 second', null);
insert into analytics_events (id, name, at) values ('old-ev', 'x', now() - interval '500 days'), ('new-ev', 'x', now());
insert into recovery_attempts (at, phone) values (now() - interval '60 days', 'x');
select run_retention();
do $$
declare cnt int; newest text;
begin
  select count(*) into cnt from notifications where user_id = '00000000-0000-0000-0000-0000000007f1';
  if cnt <> 200 then raise exception 'expected 200 notifications kept, got %', cnt; end if;
  select type into newest from notifications where user_id = '00000000-0000-0000-0000-0000000007f1' order by created_at desc limit 1;
  if newest <> 'poke' then raise exception 'newest notification was pruned'; end if;
  if exists (select 1 from analytics_events where id = 'old-ev') or not exists (select 1 from analytics_events where id = 'new-ev') then raise exception 'analytics retention wrong'; end if;
  if exists (select 1 from recovery_attempts where at < now() - interval '30 days') then raise exception 'old recovery attempts kept'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007f1', false);
do $$ begin
  perform run_retention();
  raise exception 'member could run retention';
exception when insufficient_privilege then null;
end $$;
reset role;
select 'ALL RETENTION TESTS PASSED' as result;
