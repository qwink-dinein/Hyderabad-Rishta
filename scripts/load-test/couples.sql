-- 100 couples (groom 1xxx, bride 2xxx) + 1 stranger (3001). Brides keep photos private until they share.
delete from profiles where user_id::text like '00000000-0000-4000-8000-5a%';
delete from app_users where id::text like '00000000-0000-4000-8000-5a%';
delete from auth.users where id::text like '00000000-0000-4000-8000-5a%';
create temp table pp as
  select ('00000000-0000-4000-8000-5a000000' || k)::uuid id, k, case when k < 2000 or k = 3001 then 'g' else 'b' end side
  from (select 1000 + i k from generate_series(1, 100) i union all select 2000 + i from generate_series(1, 100) i union all select 3001) x;
insert into auth.users (id, phone) select id, '9177' || lpad(k::text, 8, '0') from pp;
insert into app_users (id, country_code, phone, role) select id, '+91', '77' || lpad(k::text, 8, '0'), 'user' from pp;
insert into profiles (user_id, biodata, last_step, status, published_at)
select id, jsonb_build_object(
  'basic', jsonb_build_object('createdFor','self','lookingFor', case when side='g' then 'bride' else 'groom' end,
     'fullName', case when side='g' then 'Groom Pair' else 'Bride Pair' end || k, 'dob','1995-05-05','heightCm',170,'maritalStatus','never_married','motherTongue','urdu'),
  'photos', case when side='b' then jsonb_build_array(jsonb_build_object('id','p1','uri', id::text || '/pair' || k || '.jpg')) else '[]'::jsonb end,
  'location', jsonb_build_object('country','India','state','Telangana','city','Hyderabad'),
  'career', jsonb_build_object('education','bachelors','profession','it'), 'religion','{}'::jsonb, 'family','{}'::jsonb, 'preferences','{}'::jsonb,
  'privacy', jsonb_build_object('displayName','first','photoVisibility', 'onConsent','incomeVisibility','hidden','familyVisibility','public','acceptContactRequests',true)),
  7, 'published', now()
from pp;
select count(*) from profiles where user_id::text like '00000000-0000-4000-8000-5a%';
