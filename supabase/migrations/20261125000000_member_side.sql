-- Matrimony rule, enforced by the database (owner report 2026-11-01): a member only ever sees the side their
-- own biodata is looking for (a bride sees grooms, a groom sees brides). The Bride/Groom filter (p_show) can no
-- longer override it; it applies only to accounts without a biodata (e.g. the team).
-- Same signature and grants as before (create or replace keeps them).
create or replace function search_profiles(p_show text default null, p_age_min int default null, p_age_max int default null,
  p_countries text[] default null, p_states text[] default null, p_cities text[] default null, p_keyword text default null,
  p_limit int default 20, p_offset int default 0)
returns setof jsonb language sql stable security definer set search_path = public as $$
  with side as (
    select coalesce(
      (select mine.biodata #>> '{basic,lookingFor}' from profiles mine where mine.user_id = auth.uid() and mine.deleted_at is null limit 1),
      p_show) as show
  )
  select project_profile(p, auth.uid(), false) || jsonb_build_object('code', p.code)
         || coalesce(jsonb_build_object('relation', relation_with(auth.uid(), p)), '{}'::jsonb)
  from profiles p
  join app_users u on u.id = p.user_id and u.deactivated_at is null and u.deleted_at is null
  cross join side
  where auth.uid() is not null
    and p.status = 'published' and p.deleted_at is null
    and p.user_id <> auth.uid()
    and not is_blocked_between(auth.uid(), p)
    and (side.show is null or p.profile_type = side.show)
    and (p_age_min is null or p.dob <= (current_date - make_interval(years => p_age_min)))
    and (p_age_max is null or p.dob > (current_date - make_interval(years => p_age_max + 1)))
    and (p_countries is null or p.country = any (p_countries))
    and (p_states is null or p.state = any (p_states))
    and (p_cities is null or p.city = any (p_cities))
    and (p_keyword is null or (coalesce(p.education_other, '') || ' ' || coalesce(p.profession_other, '') || ' ' || coalesce(p.city, '')) ilike '%' || p_keyword || '%')
  order by (p.boost_until > now()) desc nulls last, p.published_at desc
  limit least(p_limit, 50) offset p_offset;
$$;
