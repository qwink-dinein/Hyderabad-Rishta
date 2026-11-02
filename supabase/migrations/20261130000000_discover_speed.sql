-- Discover speed (load test, 2 Nov 2026).
-- With 5,000 members and 50 people browsing at once, search_profiles was the slowest call
-- (about 200 ms typical, 480 ms worst). Two causes:
--   1. the block check ran as a function once per candidate row (thousands of calls), and
--   2. every candidate's whole biodata was carried through the sort even though only 50 are shown.
-- Same results, same order, same privacy rules: the blocks are checked with plain NOT EXISTS
-- (index lookups the planner can batch), the 50 ids are picked first, and only those 50 are built.
-- Ties on publish time are broken by id so paging never repeats or skips a member.
create or replace function search_profiles(
  p_show text default null, p_age_min int default null, p_age_max int default null,
  p_countries text[] default null, p_states text[] default null, p_cities text[] default null,
  p_keyword text default null, p_limit int default 20, p_offset int default 0)
returns setof jsonb language sql stable security definer set search_path = public as $$
  with side as (
    select coalesce(
      (select mine.biodata #>> '{basic,lookingFor}' from profiles mine where mine.user_id = auth.uid() and mine.deleted_at is null limit 1),
      p_show) as show
  ),
  pick as (
    select p.id, (p.boost_until > now()) as boosted, p.published_at
    from profiles p
    join app_users u on u.id = p.user_id and u.deactivated_at is null and u.deleted_at is null
    cross join side
    where auth.uid() is not null
      and p.status = 'published' and p.deleted_at is null
      and p.user_id <> auth.uid()
      -- same rule as is_blocked_between(): I blocked them, or they blocked me
      and not exists (select 1 from blocks b where b.user_id = auth.uid() and b.blocked_profile_id = p.id)
      and not exists (select 1 from blocks b join profiles mine on mine.id = b.blocked_profile_id
                      where mine.user_id = auth.uid() and b.user_id = p.user_id)
      and (side.show is null or p.profile_type = side.show)
      and (p_age_min is null or p.dob <= (current_date - make_interval(years => p_age_min)))
      and (p_age_max is null or p.dob > (current_date - make_interval(years => p_age_max + 1)))
      and (p_countries is null or p.country = any (p_countries))
      and (p_states is null or p.state = any (p_states))
      and (p_cities is null or p.city = any (p_cities))
      and (p_keyword is null or (coalesce(p.education_other, '') || ' ' || coalesce(p.profession_other, '') || ' ' || coalesce(p.city, '')) ilike '%' || p_keyword || '%')
    order by (p.boost_until > now()) desc nulls last, p.published_at desc, p.id
    limit least(p_limit, 50) offset p_offset
  )
  select project_profile(p, auth.uid(), false) || jsonb_build_object('code', p.code)
         || coalesce(jsonb_build_object('relation', relation_with(auth.uid(), p)), '{}'::jsonb)
  from pick join profiles p on p.id = pick.id
  order by pick.boosted desc nulls last, pick.published_at desc, pick.id;
$$;
