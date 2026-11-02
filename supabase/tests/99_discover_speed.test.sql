\set ON_ERROR_STOP on
-- Load test fix (20261130): search_profiles must return exactly what the old per-row version did:
-- same people, same order (boosted first, then newest), blocks honoured both ways, paging intact.
reset role;
insert into auth.users (id, phone) select ('00000000-0000-0000-0000-0000000d500' || i)::uuid, '91961150000' || i from generate_series(1, 6) i;
insert into app_users (id, country_code, phone) select ('00000000-0000-0000-0000-0000000d500' || i)::uuid, '+91', '961150000' || i from generate_series(1, 6) i;
\set g '{"basic":{"lookingFor":"bride","fullName":"Viewer Speed","dob":"1994-01-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"public","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}'
-- 1 = viewer (groom looking for a bride); 2..6 = brides. 5 is boosted; 6 is the newest.
insert into profiles (id, user_id, biodata, status, published_at, boost_until)
select ('2000000d-0000-0000-0000-0000000d500' || i)::uuid, ('00000000-0000-0000-0000-0000000d500' || i)::uuid,
       case when i = 1 then :'g'::jsonb else jsonb_set(jsonb_set(:'g'::jsonb, '{basic,lookingFor}', '"groom"'), '{basic,fullName}', to_jsonb('Bride Speed ' || i)) end,
       'published', now() - ((10 - i) || ' minutes')::interval, case when i = 5 then now() + interval '3 days' end
from generate_series(1, 6) i;
-- Viewer blocked bride 2; bride 3 blocked the viewer.
insert into blocks (user_id, blocked_profile_id) values
  ('00000000-0000-0000-0000-0000000d5001', '2000000d-0000-0000-0000-0000000d5002'),
  ('00000000-0000-0000-0000-0000000d5003', '2000000d-0000-0000-0000-0000000d5001');

-- Reference: the pre-20261130 logic, written out as a plain query.
create temp table ref as
  select p.id, row_number() over (order by (p.boost_until > now()) desc nulls last, p.published_at desc, p.id) as n
  from profiles p join app_users u on u.id = p.user_id and u.deactivated_at is null and u.deleted_at is null
  where p.status = 'published' and p.deleted_at is null and p.profile_type = 'bride'
    and p.user_id <> '00000000-0000-0000-0000-0000000d5001'
    and not is_blocked_between('00000000-0000-0000-0000-0000000d5001', p);
grant select on ref to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000d5001', false);
create temp table got as select (r ->> 'id')::uuid as id, row_number() over () as n from search_profiles(null, null, null, null, null, null, null, 50, 0) r;
create temp table page2 as select (r ->> 'id')::uuid as id from search_profiles(null, null, null, null, null, null, null, 2, 2) r;
reset role;
do $$ begin
  assert (select count(*) from got) = least(50, (select count(*) from ref)), 'same number of people';
  assert not exists (select 1 from got g join ref r on r.n = g.n where r.id <> g.id), 'same people in the same order';
  assert (select n from got where id = '2000000d-0000-0000-0000-0000000d5005') < (select n from got where id = '2000000d-0000-0000-0000-0000000d5006'), 'boosted bride before newer unboosted one';
  assert not exists (select 1 from got where id in ('2000000d-0000-0000-0000-0000000d5002', '2000000d-0000-0000-0000-0000000d5003')), 'blocks honoured both ways';
  assert not exists (select 1 from got where id = '2000000d-0000-0000-0000-0000000d5001'), 'never shows myself';
  assert (select array_agg(id order by id) from page2) = (select array_agg(id order by id) from ref where n in (3, 4)), 'paging intact';
end $$;
select 'ALL DISCOVER-SPEED TESTS PASSED' as result;
