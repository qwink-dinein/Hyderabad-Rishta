-- Phone-number visibility and privacy defaults for new members (owner 2026-11-09).
-- 1) privacy.phoneVisibility: 'public' ("Everyone": every signed-in member sees the number on the profile) or
--    'onConsent' (only after the member shares it). Missing = 'onConsent', so every existing member stays
--    private. project_profile — the ONLY way another member's data leaves the DB — mirrors
--    src/domain/privacy.ts#projectProfile.
-- 2) pricing_config.config.privacyDefaults = { groom: {photo, phone}, bride: {photo, phone} }: the starting
--    choice for NEW members (applied by the app at sign-up; members change it any time; never forced).
--    Validated here so a bad value can't be saved. Missing = grooms public/public, brides onConsent/onConsent.

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
  -- 'public' = the member chose "Everyone"; anything else (incl. missing = every member before this setting)
  -- keeps the number private until they share it with a family.
  phone_public boolean := coalesce(b #>> '{privacy,phoneVisibility}', 'onConsent') = 'public';
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
  if include_contact and ((s ->> 'phone')::boolean or phone_public) then
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

create or replace function privacy_defaults_ok(c jsonb) returns boolean
language sql immutable set search_path = public as $$
  select c -> 'privacyDefaults' is null or (
    jsonb_typeof(c -> 'privacyDefaults') = 'object'
    and coalesce(c #>> '{privacyDefaults,groom,photo}', '') in ('public', 'onConsent', 'hidden')
    and coalesce(c #>> '{privacyDefaults,bride,photo}', '') in ('public', 'onConsent', 'hidden')
    and coalesce(c #>> '{privacyDefaults,groom,phone}', '') in ('public', 'onConsent')
    and coalesce(c #>> '{privacyDefaults,bride,phone}', '') in ('public', 'onConsent'));
$$;
alter table pricing_config drop constraint if exists privacy_defaults_ok;
alter table pricing_config add constraint privacy_defaults_ok check (privacy_defaults_ok(config));

-- A member's phone setting can only be one of the two values.
create or replace function phone_visibility_ok(b jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(b #>> '{privacy,phoneVisibility}', 'onConsent') in ('public', 'onConsent');
$$;
alter table profiles drop constraint if exists phone_visibility_ok;
alter table profiles add constraint phone_visibility_ok check (phone_visibility_ok(biodata));
