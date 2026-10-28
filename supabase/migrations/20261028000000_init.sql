-- Hyderabad Rishta — initial schema (Supabase / PostgreSQL 15+)
-- Security model:
--   * RLS is ON for every table. Clients use the anon key + user JWT only.
--   * Other members' biodata is NEVER selectable directly. Discovery and profile views go through
--     SECURITY DEFINER RPCs that return the privacy projection (project_profile), so hidden fields
--     are never serialised (PRD §9.3). Mobile numbers live in auth.users and app_users (owner/admin only).
--   * Admin power is checked server-side with is_admin(); hiding UI is not a control (PRD §15).
-- Mirrors src/domain/* and src/services/demo/demoBackend.ts — keep them in sync.

create extension if not exists pgcrypto;

-- ───────────────────────── enums ─────────────────────────
create type app_role as enum ('user', 'admin');
create type profile_status as enum ('draft', 'pending', 'published', 'paused', 'rejected');
create type request_status as enum ('pending', 'accepted', 'declined', 'withdrawn');
create type order_kind as enum ('publication', 'boost');
create type order_status as enum ('pending', 'paid', 'failed', 'free', 'cancelled');
create type announcement_status as enum ('draft', 'scheduled', 'published', 'archived');
create type push_status as enum ('not_requested', 'not_configured', 'submitted', 'delivered', 'failed');

-- ───────────────────────── users ─────────────────────────
create table app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  country_code text not null,
  phone text not null,                 -- private: owner + admin only
  role app_role not null default 'user',
  language text not null default 'en' check (language in ('en', 'ur', 'te')),
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  unique (country_code, phone)
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where id = auth.uid() and role = 'admin' and deactivated_at is null);
$$;

-- ───────────────────────── profiles ─────────────────────────
-- text::date is only STABLE (DateStyle-dependent); biodata dates are strict ISO (YYYY-MM-DD, validated
-- client- and server-side), so this wrapper is safe to mark IMMUTABLE for generated columns.
create or replace function iso_date(t text) returns date
language sql immutable parallel safe as $$
  select case when t ~ '^\d{4}-\d{2}-\d{2}$' then to_date(t, 'YYYY-MM-DD') end
$$;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references app_users (id) on delete cascade,
  biodata jsonb not null,
  status profile_status not null default 'draft',
  admin_note text,
  last_step int not null default 0,
  published_at timestamptz,
  boost_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Denormalised search columns (generated) so filters use indexes, not JSON scans.
  profile_type text generated always as (case when biodata #>> '{basic,lookingFor}' = 'groom' then 'bride' else 'groom' end) stored,
  dob date generated always as (iso_date(biodata #>> '{basic,dob}')) stored,
  height_cm int generated always as (nullif(biodata #>> '{basic,heightCm}', '')::int) stored,
  marital_status text generated always as (biodata #>> '{basic,maritalStatus}') stored,
  mother_tongue text generated always as (biodata #>> '{basic,motherTongue}') stored,
  country text generated always as (biodata #>> '{location,country}') stored,
  state text generated always as (biodata #>> '{location,state}') stored,
  city text generated always as (biodata #>> '{location,city}') stored,
  education text generated always as (biodata #>> '{career,education}') stored,
  education_other text generated always as (biodata #>> '{career,educationOther}') stored,
  profession text generated always as (biodata #>> '{career,profession}') stored,
  profession_other text generated always as (biodata #>> '{career,professionOther}') stored,
  constraint photos_max_3 check (jsonb_array_length(coalesce(biodata -> 'photos', '[]'::jsonb)) <= 3)
);
create index profiles_discovery_idx on profiles (status, profile_type, published_at desc);
create index profiles_boost_idx on profiles (boost_until) where boost_until is not null;
create index profiles_city_idx on profiles (country, state, city);
create index profiles_custom_text_idx on profiles using gin (to_tsvector('simple', coalesce(education_other, '') || ' ' || coalesce(profession_other, '')));

-- ───────────────────────── social graph ─────────────────────────
create table shortlists (
  user_id uuid references app_users (id) on delete cascade,
  profile_id uuid references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

create table contact_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references app_users (id) on delete cascade,
  from_profile_id uuid not null references profiles (id) on delete cascade,
  to_user_id uuid not null references app_users (id) on delete cascade,
  to_profile_id uuid not null references profiles (id) on delete cascade,
  message text check (char_length(message) <= 800),
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_profile_id <> to_profile_id)
);
-- One open request per pair (either direction).
create unique index one_open_request_per_pair on contact_requests (least(from_profile_id, to_profile_id), greatest(from_profile_id, to_profile_id))
  where status in ('pending', 'accepted');

create table consents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references contact_requests (id) on delete cascade,
  grantor_user_id uuid not null references app_users (id) on delete cascade,
  grantor_profile_id uuid not null references profiles (id) on delete cascade,
  grantee_user_id uuid not null references app_users (id) on delete cascade,
  photos boolean not null default false,
  phone boolean not null default false,
  full_biodata boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, grantor_user_id)
);

create table blocks (
  user_id uuid references app_users (id) on delete cascade,
  blocked_profile_id uuid references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_profile_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references app_users (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  reason text not null,
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table view_events (
  id bigserial primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  viewer_user_id uuid not null references app_users (id) on delete cascade,
  at timestamptz not null default now()
);
create index view_events_profile_idx on view_events (profile_id, at desc);

-- ───────────────────────── money ─────────────────────────
create table pricing_config (
  id boolean primary key default true check (id), -- singleton row
  version int not null default 1,
  currency text not null default 'INR',
  config jsonb not null,                          -- {publication:{bride,groom}, boost:{bride,groom}}
  boost_days int not null default 7 check (boost_days between 1 and 90),
  require_approval boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users (id)
);
create table pricing_history (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references app_users (id),
  before jsonb not null,
  after jsonb not null,
  at timestamptz not null default now()
);
create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  kind order_kind not null,
  amount int not null check (amount >= 0),
  currency text not null,
  status order_status not null,
  terms jsonb not null,                 -- snapshot: pricingVersion, boostDays, autoRenew=false
  simulated boolean not null default false,
  provider_ref text,                    -- e.g. Razorpay order id (set by edge function)
  created_at timestamptz not null default now()
);

-- ───────────────────────── notifications & announcements ─────────────────────────
create table announcements (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null check (title ? 'en'),
  body jsonb not null check (body ? 'en'),
  image_url text,
  priority text not null default 'normal' check (priority in ('normal', 'high')),
  deep_link text,
  segment text not null check (segment in ('all', 'brides', 'grooms', 'published', 'unpublished')),
  status announcement_status not null default 'draft',
  push_enabled boolean not null default false,
  scheduled_at timestamptz,
  expires_at timestamptz,
  published_at timestamptz,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table announcement_deliveries (
  announcement_id uuid references announcements (id) on delete cascade,
  user_id uuid references app_users (id) on delete cascade,
  in_app_at timestamptz not null default now(),
  push_status push_status not null default 'not_requested',
  push_error text,
  viewed_at timestamptz,
  clicked_at timestamptz,
  primary key (announcement_id, user_id)
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  type text not null,
  params jsonb not null default '{}',
  deep_link text,
  announcement_id uuid references announcements (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

create table audit_events (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  target text,
  meta jsonb,
  at timestamptz not null default now()
);

-- ───────────────────────── RLS ─────────────────────────
alter table app_users enable row level security;
alter table profiles enable row level security;
alter table shortlists enable row level security;
alter table contact_requests enable row level security;
alter table consents enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;
alter table view_events enable row level security;
alter table pricing_config enable row level security;
alter table pricing_history enable row level security;
alter table orders enable row level security;
alter table announcements enable row level security;
alter table announcement_deliveries enable row level security;
alter table notifications enable row level security;
alter table audit_events enable row level security;

-- app_users: self read; self may change only language; admin read all.
create policy app_users_self_read on app_users for select using (id = auth.uid() or is_admin());
create policy app_users_self_update on app_users for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on app_users from authenticated;
grant update (language) on app_users to authenticated;

-- profiles: owner full CRUD on own row (status changes go through RPCs); admin all.
create policy profiles_owner_select on profiles for select using (user_id = auth.uid() or is_admin());
create policy profiles_owner_insert on profiles for insert with check (user_id = auth.uid() and status = 'draft');
create policy profiles_owner_update on profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_admin_update on profiles for update using (is_admin());
create policy profiles_owner_delete on profiles for delete using (user_id = auth.uid());
-- Owners may edit biodata/last_step only; status/boost/published_at are server-controlled.
revoke update on profiles from authenticated;
grant update (biodata, last_step, updated_at) on profiles to authenticated;

create policy shortlists_own on shortlists for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy blocks_own on blocks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reports_insert on reports for insert with check (reporter_user_id = auth.uid());
create policy reports_admin on reports for select using (is_admin());
create policy requests_parties_read on contact_requests for select using (auth.uid() in (from_user_id, to_user_id));
create policy consents_parties_read on consents for select using (auth.uid() in (grantor_user_id, grantee_user_id));
create policy notifications_own_read on notifications for select using (user_id = auth.uid());
create policy notifications_own_update on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on notifications from authenticated;
grant update (read_at) on notifications to authenticated;
create policy orders_own_read on orders for select using (user_id = auth.uid() or is_admin());
create policy pricing_read on pricing_config for select using (true);
create policy pricing_history_admin on pricing_history for select using (is_admin());
create policy announcements_admin on announcements for all using (is_admin()) with check (is_admin());
create policy deliveries_admin on announcement_deliveries for select using (is_admin());
create policy audit_admin on audit_events for select using (is_admin());
-- view_events: no direct access at all; written by get_profile(), read via my_dashboard().

-- ───────────────────────── privacy projection ─────────────────────────
create or replace function consent_scopes(grantor uuid, grantee uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when grantor = grantee then '{"photos":true,"phone":true,"fullBiodata":true}'::jsonb else
    jsonb_build_object(
      'photos', coalesce(bool_or(c.photos), false),
      'phone', coalesce(bool_or(c.phone), false),
      'fullBiodata', coalesce(bool_or(c.full_biodata), false))
  end
  from consents c join contact_requests r on r.id = c.request_id and r.status = 'accepted'
  where c.grantor_user_id = grantor and c.grantee_user_id = grantee;
$$;

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

create or replace function is_blocked_between(viewer uuid, target profiles)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where user_id = viewer and blocked_profile_id = target.id)
      or exists (select 1 from blocks b join profiles mine on mine.user_id = viewer
                 where b.user_id = target.user_id and b.blocked_profile_id = mine.id);
$$;

-- Discovery: coarse filters run in SQL on indexed columns; fine-grained optional filters are applied
-- by the same matchesFilters() logic on the projected rows in the edge function / client adapter.
create or replace function search_profiles(p_show text default null, p_age_min int default null, p_age_max int default null,
  p_countries text[] default null, p_states text[] default null, p_cities text[] default null, p_keyword text default null,
  p_limit int default 20, p_offset int default 0)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select project_profile(p, auth.uid(), false)   -- discovery never carries contact details
  from profiles p
  join app_users u on u.id = p.user_id and u.deactivated_at is null
  where auth.uid() is not null
    and p.status = 'published'
    and p.user_id <> auth.uid()
    and not is_blocked_between(auth.uid(), p)
    and (p_show is null or p.profile_type = p_show)
    and (p_age_min is null or p.dob <= (current_date - make_interval(years => p_age_min)))
    and (p_age_max is null or p.dob > (current_date - make_interval(years => p_age_max + 1)))
    and (p_countries is null or p.country = any (p_countries))
    and (p_states is null or p.state = any (p_states))
    and (p_cities is null or p.city = any (p_cities))
    and (p_keyword is null or (coalesce(p.education_other, '') || ' ' || coalesce(p.profession_other, '') || ' ' || coalesce(p.city, '')) ilike '%' || p_keyword || '%')
  order by (p.boost_until > now()) desc nulls last, p.published_at desc
  limit least(p_limit, 50) offset p_offset;
$$;

create or replace function get_profile(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p profiles; me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into p from profiles where id = p_id;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p.user_id <> me and not is_admin() then
    if p.status <> 'published' or is_blocked_between(me, p) then raise exception 'not_found' using errcode = 'P0002'; end if;
    -- de-duplicated view event (30 min)
    if not exists (select 1 from view_events where profile_id = p.id and viewer_user_id = me and at > now() - interval '30 minutes') then
      insert into view_events (profile_id, viewer_user_id) values (p.id, me);
    end if;
  end if;
  return project_profile(p, me, true);
end $$;

-- ───────────────────────── requests & consent ─────────────────────────
create or replace function send_request(p_to uuid, p_message text default null)
returns contact_requests language plpgsql volatile security definer set search_path = public as $$
declare mine profiles; target profiles; r contact_requests;
begin
  select * into mine from profiles where user_id = auth.uid();
  if mine.id is null or mine.status <> 'published' then raise exception 'invalid_state'; end if;
  select * into target from profiles where id = p_to and status = 'published';
  if target.id is null or is_blocked_between(auth.uid(), target) then raise exception 'not_found'; end if;
  if coalesce((target.biodata #>> '{privacy,acceptContactRequests}')::boolean, true) = false then raise exception 'not_accepting'; end if;
  if (select count(*) from contact_requests where from_user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into contact_requests (from_user_id, from_profile_id, to_user_id, to_profile_id, message)
  values (auth.uid(), mine.id, target.user_id, target.id, nullif(trim(p_message), ''))
  returning * into r;
  insert into notifications (user_id, type, params, deep_link)
  values (target.user_id, 'request_received', jsonb_build_object('name', project_profile(mine, target.user_id, false) ->> 'displayName'), '/requests');
  return r;
end $$;

create or replace function respond_request(p_id uuid, p_decision request_status)
returns contact_requests language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests;
begin
  if p_decision not in ('accepted', 'declined') then raise exception 'validation'; end if;
  update contact_requests set status = p_decision, responded_at = now()
  where id = p_id and to_user_id = auth.uid() and status = 'pending' returning * into r;
  if r.id is null then raise exception 'not_found'; end if;
  insert into notifications (user_id, type, deep_link)
  values (r.from_user_id, case when p_decision = 'accepted' then 'request_accepted' else 'request_declined' end, '/requests');
  return r;
end $$;

create or replace function set_consent(p_request uuid, p_photos boolean, p_phone boolean, p_full boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests; grantee uuid; grantor_profile uuid; before jsonb;
begin
  select * into r from contact_requests where id = p_request and auth.uid() in (from_user_id, to_user_id);
  if r.id is null then raise exception 'not_found'; end if;
  if r.status <> 'accepted' then raise exception 'invalid_state'; end if;
  grantee := case when r.to_user_id = auth.uid() then r.from_user_id else r.to_user_id end;
  grantor_profile := case when r.to_user_id = auth.uid() then r.to_profile_id else r.from_profile_id end;
  select jsonb_build_object('photos', photos, 'phone', phone, 'fullBiodata', full_biodata) into before
  from consents where request_id = r.id and grantor_user_id = auth.uid();
  insert into consents (request_id, grantor_user_id, grantor_profile_id, grantee_user_id, photos, phone, full_biodata)
  values (r.id, auth.uid(), grantor_profile, grantee, p_photos, p_phone, p_full)
  on conflict (request_id, grantor_user_id) do update
    set photos = excluded.photos, phone = excluded.phone, full_biodata = excluded.full_biodata, updated_at = now();
  insert into audit_events (actor_id, action, target, meta)
  values (auth.uid(), 'consent.updated', r.id::text, jsonb_build_object('before', before, 'after', jsonb_build_object('photos', p_photos, 'phone', p_phone, 'fullBiodata', p_full)));
  if (p_photos and not coalesce((before ->> 'photos')::boolean, false)) or (p_phone and not coalesce((before ->> 'phone')::boolean, false))
     or (p_full and not coalesce((before ->> 'fullBiodata')::boolean, false)) then
    insert into notifications (user_id, type, deep_link) values (grantee, 'contact_shared', '/profile/' || grantor_profile);
  end if;
end $$;

-- ───────────────────────── admin ─────────────────────────
create or replace function admin_set_profile_status(p_id uuid, p_status profile_status, p_note text default null)
returns profiles language plpgsql volatile security definer set search_path = public as $$
declare p profiles; prev profile_status;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select status into prev from profiles where id = p_id;
  update profiles set status = p_status, admin_note = p_note, updated_at = now(),
    published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
  where id = p_id returning * into p;
  if p.id is null then raise exception 'not_found'; end if;
  if p_status = 'published' then insert into notifications (user_id, type, deep_link) values (p.user_id, 'profile_approved', '/dashboard'); end if;
  if p_status = 'rejected' then insert into notifications (user_id, type, params, deep_link) values (p.user_id, 'profile_rejected', jsonb_build_object('note', coalesce(p_note, '')), '/biodata'); end if;
  insert into audit_events (actor_id, action, target, meta) values (auth.uid(), 'profile.status', p.id::text, jsonb_build_object('before', prev, 'after', p_status, 'note', p_note));
  return p;
end $$;

create or replace function admin_update_pricing(p_config jsonb, p_boost_days int, p_require_approval boolean)
returns pricing_config language plpgsql volatile security definer set search_path = public as $$
declare before pricing_config; after pricing_config;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into before from pricing_config where id;
  update pricing_config set config = p_config, boost_days = p_boost_days, require_approval = p_require_approval,
    version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id returning * into after;
  insert into pricing_history (admin_id, before, after) values (auth.uid(), to_jsonb(before), to_jsonb(after));
  insert into audit_events (actor_id, action, meta) values (auth.uid(), 'pricing.updated', jsonb_build_object('version', after.version));
  return after;
end $$;

create or replace function admin_recipient_report(p_announcement uuid)
returns table (user_id uuid, masked_phone text, in_app_at timestamptz, push_status push_status, viewed_at timestamptz, clicked_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'announcement.recipient_report_viewed', p_announcement::text);
  return query
    select d.user_id, repeat('•', greatest(length(u.phone) - 4, 0)) || right(u.phone, 4), d.in_app_at, d.push_status, d.viewed_at, d.clicked_at
    from announcement_deliveries d join app_users u on u.id = d.user_id where d.announcement_id = p_announcement;
end $$;

-- Marks an announcement viewed only from an explicit user open (never on fetch).
create or replace function open_notification(p_id uuid, p_clicked boolean default false)
returns void language plpgsql volatile security definer set search_path = public as $$
declare n notifications;
begin
  update notifications set read_at = coalesce(read_at, now()) where id = p_id and user_id = auth.uid() returning * into n;
  if n.id is null then raise exception 'not_found'; end if;
  if n.announcement_id is not null then
    update announcement_deliveries set viewed_at = coalesce(viewed_at, now()),
      clicked_at = case when p_clicked then coalesce(clicked_at, now()) else clicked_at end
    where announcement_id = n.announcement_id and user_id = auth.uid();
  end if;
end $$;

-- Lock down: authenticated users call RPCs; they cannot call internals directly.
revoke all on function project_profile(profiles, uuid, boolean) from public, anon, authenticated;
revoke all on function consent_scopes(uuid, uuid) from public, anon, authenticated;
revoke all on function is_blocked_between(uuid, profiles) from public, anon, authenticated;
revoke all on function search_profiles(text, int, int, text[], text[], text[], text, int, int) from public, anon;
revoke all on function get_profile(uuid) from public, anon;
-- Explicit grants (don't rely on platform default privileges).
grant execute on function is_admin() to authenticated;
grant execute on function search_profiles(text, int, int, text[], text[], text[], text, int, int) to authenticated;
grant execute on function get_profile(uuid) to authenticated;
grant execute on function send_request(uuid, text) to authenticated;
grant execute on function respond_request(uuid, request_status) to authenticated;
grant execute on function set_consent(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function open_notification(uuid, boolean) to authenticated;
grant execute on function admin_set_profile_status(uuid, profile_status, text) to authenticated;   -- checks is_admin()
grant execute on function admin_update_pricing(jsonb, int, boolean) to authenticated;               -- checks is_admin()
grant execute on function admin_recipient_report(uuid) to authenticated;                             -- checks is_admin()

-- ───────────────────────── seed config ─────────────────────────
insert into pricing_config (config) values (
  '{"publication":{"bride":{"mode":"free","amount":0},"groom":{"mode":"free","amount":0}},"boost":{"bride":{"mode":"free","amount":0},"groom":{"mode":"paid","amount":499}}}'
);

-- ───────────────────────── storage ─────────────────────────
-- Private bucket; files at profile-photos/<user_id>/<uuid>.jpg. Owners write their own folder.
-- Other members get short-lived signed URLs from an edge function that first checks project_profile() photo visibility.
insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', false) on conflict do nothing;
create policy photos_owner_rw on storage.objects for all
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
