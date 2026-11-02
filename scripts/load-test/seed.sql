-- Seed N members (half brides, half grooms), published, varied cities/education/professions; ~5% boosted.
\set ON_ERROR_STOP on
create or replace function pg_temp.bio(i int) returns jsonb language sql as $$
  select jsonb_build_object(
    'basic', jsonb_build_object('createdFor', (array['self','son','daughter','brother','sister','relative'])[1 + i % 6],
      'lookingFor', case when i % 2 = 0 then 'groom' else 'bride' end,
      'fullName', (array['Ayesha','Sana','Fatima','Zoya','Imran','Salman','Faiz','Arif','Hina','Rehan'])[1 + i % 10] || ' Load' || i,
      'dob', to_char(date '1990-01-01' + (i * 37 % 4000), 'YYYY-MM-DD'), 'heightCm', 150 + i % 40,
      'maritalStatus', case when i % 9 = 0 then 'divorced' else 'never_married' end, 'children', case when i % 9 = 0 then 0 end,
      'motherTongue', (array['urdu','dakhini','telugu','hindi','english'])[1 + i % 5], 'aboutMe', 'Load test member number ' || i || ', family oriented.'),
    'photos', '[]'::jsonb,
    'location', jsonb_build_object('country','India','state', case when i % 7 = 0 then 'Karnataka' else 'Telangana' end,
      'city', case when i % 7 = 0 then 'Bengaluru' else (array['Hyderabad','Hyderabad','Secunderabad','Warangal'])[1 + i % 4] end),
    'career', jsonb_build_object('education', (array['bachelors','masters','diploma','high_school','doctorate'])[1 + i % 5],
      'profession', (array['it','business','healthcare','education','government','engineering'])[1 + i % 6]),
    'religion', jsonb_build_object('maslak','sunni','namaz','mostly'), 'family', jsonb_build_object('familyType','nuclear','fatherOccupation','Business'),
    'preferences', jsonb_build_object('ageMin', 20, 'ageMax', 35, 'maritalStatus', '[]'::jsonb, 'education','[]'::jsonb,'profession','[]'::jsonb,'countries','[]'::jsonb,'states','[]'::jsonb,'cities','[]'::jsonb,'motherTongues','[]'::jsonb),
    'privacy', jsonb_build_object('displayName','first','photoVisibility','public','incomeVisibility','hidden','familyVisibility','public','acceptContactRequests',true));
$$;
insert into auth.users (id, phone)
select ('00000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, '9188' || lpad(i::text, 8, '0') from generate_series(1, :n) i;
insert into app_users (id, country_code, phone, role)
select ('00000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, '+91', '88' || lpad(i::text, 8, '0'), 'user' from generate_series(1, :n) i;
insert into profiles (user_id, biodata, last_step, status, published_at, boost_until)
select ('00000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, pg_temp.bio(i), 7, 'published', now() - (i || ' minutes')::interval,
       case when i % 20 = 0 then now() + interval '5 days' end
from generate_series(1, :n) i;
-- one admin
insert into auth.users (id, phone) values ('00000000-0000-4000-8000-ad0000000001', '919999000001');
insert into app_users (id, country_code, phone, role) values ('00000000-0000-4000-8000-ad0000000001', '+91', '9999000001', 'master');
select count(*) as profiles, count(*) filter (where profile_type = 'bride') brides, count(*) filter (where boost_until > now()) boosted from profiles;
