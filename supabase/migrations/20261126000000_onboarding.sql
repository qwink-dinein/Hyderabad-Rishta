-- Onboarding redesign (owner request 2026-11-01).
-- 1) Two optional biodata answers for members who were married before and have children:
--    basic.childrenLiveWith ('yes' | 'no' | 'sometimes') and basic.childrenNote (short text).
--    project_profile (the ONLY way another member's biodata leaves the DB) now includes them, exactly
--    like src/domain/privacy.ts#projectProfile: only when previously married AND children > 0.
--    family.marriedBrothers / marriedSisters travel inside `family`, so they follow the family
--    visibility rule with no change here.
-- 2) match_preview: what a visitor sees BEFORE signing up — a count and at most 3 safe rows
--    (first letter of the name, age, profession, city). Never names, photos, codes or contact.

-- Mirror of src/domain/privacy.ts#projectProfile. The ONLY way other members' biodata leaves the DB.
create or replace function project_profile(p profiles, viewer uuid, include_contact boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  b jsonb := p.biodata;
  s jsonb := consent_scopes(p.user_id, viewer);
  full_access boolean := (s ->> 'fullBiodata')::boolean;
  photos_ok boolean;
  income_ok boolean;
  family_ok boolean;
  vis_photo text := b #>> '{privacy,photoVisibility}';
  vis_income text := b #>> '{privacy,incomeVisibility}';
  vis_family text := b #>> '{privacy,familyVisibility}';
  name_pref text := coalesce(b #>> '{privacy,displayName}', 'first');
  full_name text := b #>> '{basic,fullName}';
  display text;
  career jsonb := (b -> 'career') - 'income' - 'employer';
  owner app_users;
begin
  photos_ok := vis_photo = 'public' or (vis_photo = 'onConsent' and ((s ->> 'photos')::boolean or full_access));
  income_ok := vis_income = 'public' or (vis_income = 'onConsent' and full_access);
  family_ok := vis_family = 'public' or (vis_family = 'onConsent' and full_access);
  display := case
    when full_access then full_name
    when name_pref = 'full' then full_name
    when name_pref = 'first' then split_part(full_name, ' ', 1)
    else (select string_agg(upper(left(w, 1)) || '.', ' ') from regexp_split_to_table(trim(full_name), '\s+') w)
  end;
  if income_ok and coalesce(b #>> '{career,income}', 'undisclosed') <> 'undisclosed' then
    career := career || jsonb_build_object('income', b #>> '{career,income}');
  end if;
  if full_access and b #>> '{career,employer}' is not null then
    career := career || jsonb_build_object('employer', b #>> '{career,employer}');
  end if;
  if include_contact and (s ->> 'phone')::boolean then
    select * into owner from app_users where id = p.user_id;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'profileType', p.profile_type,
    'displayName', display,
    'age', date_part('year', age(p.dob))::int,
    'heightCm', p.height_cm,
    'maritalStatus', p.marital_status,
    'children', case when p.marital_status <> 'never_married' then (b #>> '{basic,children}')::int end,
    'childrenLiveWith', case when p.marital_status <> 'never_married' and coalesce((b #>> '{basic,children}')::int, 0) > 0 then b #>> '{basic,childrenLiveWith}' end,
    'childrenNote', case when p.marital_status <> 'never_married' and coalesce((b #>> '{basic,children}')::int, 0) > 0 then b #>> '{basic,childrenNote}' end,
    'acceptsRequests', coalesce((b #>> '{privacy,acceptContactRequests}')::boolean, true),
    'motherTongue', p.mother_tongue,
    'aboutMe', b #>> '{basic,aboutMe}',
    'createdFor', b #>> '{basic,createdFor}',
    'photos', case when photos_ok then coalesce(b -> 'photos', '[]') else '[]' end,
    'photosHidden', not photos_ok and jsonb_array_length(coalesce(b -> 'photos', '[]')) > 0,
    'location', b -> 'location',
    'career', career,
    'religion', coalesce(b -> 'religion', '{}'),
    'family', case when family_ok then b -> 'family' end,
    'familyHidden', not family_ok,
    'preferences', b -> 'preferences',
    'boosted', coalesce(p.boost_until > now(), false),
    'publishedAt', p.published_at,
    'contact', case when owner.id is not null then jsonb_build_object('countryCode', owner.country_code, 'phone', owner.phone) end,
    'granted', s
  ));
end $$;

revoke all on function project_profile(profiles, uuid, boolean) from public, anon, authenticated;

-- Pre-sign-up preview. p_show = the side being looked for ('bride' | 'groom'); p_region:
-- 'hyd' (Telangana), 'india', 'abroad' (outside India) or null/'anywhere'.
create or replace function match_preview(p_show text, p_age_min int default null, p_age_max int default null, p_region text default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with pool as (
    select p.published_at, p.dob, p.city, p.profession, p.profession_other,
           upper(left(trim(p.biodata #>> '{basic,fullName}'), 1)) as initial
    from profiles p
    join app_users u on u.id = p.user_id and u.deactivated_at is null and u.deleted_at is null
    where p_show in ('bride', 'groom')
      and p.status = 'published' and p.deleted_at is null
      and p.profile_type = p_show
      and (p_age_min is null or p.dob <= (current_date - make_interval(years => greatest(18, least(p_age_min, 80)))))
      and (p_age_max is null or p.dob > (current_date - make_interval(years => greatest(18, least(p_age_max, 80)) + 1)))
      and (p_region is null or p_region = 'anywhere'
           or (p_region = 'hyd' and p.country = 'India' and p.state = 'Telangana')
           or (p_region = 'india' and p.country = 'India')
           or (p_region = 'abroad' and p.country <> 'India'))
  )
  select jsonb_build_object(
    'count', (select count(*) from pool),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('initial', initial, 'age', date_part('year', age(dob))::int,
                                          'profession', profession, 'professionOther', profession_other, 'city', city))
      from (select * from pool order by published_at desc nulls last limit 3) top), '[]'::jsonb));
$$;
revoke all on function match_preview(text, int, int, text) from public;
grant execute on function match_preview(text, int, int, text) to anon, authenticated;
