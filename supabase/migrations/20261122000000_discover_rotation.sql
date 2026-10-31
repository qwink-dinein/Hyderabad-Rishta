-- Persistent profile rotation in Discover (owner Mini PRD 2026-10-31). The ordering rules live in
-- src/domain/feed.ts and run in the discover-feed Edge Function; this stores what members have really seen
-- and their feed snapshots (shared across devices), and the configurable cooldowns.

alter table pricing_config add column if not exists feed_impression_cooldown_days int not null default 3 check (feed_impression_cooldown_days between 0 and 60);
alter table pricing_config add column if not exists feed_view_cooldown_days int not null default 7 check (feed_view_cooldown_days between 0 and 90);

-- One row per viewer and profile, updated in place: analytics are never inflated by repeats.
create table if not exists profile_seen (
  viewer_id uuid not null references app_users (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  first_impressed_at timestamptz,
  impressed_at timestamptz,
  impressions int not null default 0,
  viewed_at timestamptz,
  views int not null default 0,
  interaction text check (interaction in ('shortlist', 'interest')),
  interacted_at timestamptz,
  primary key (viewer_id, profile_id)
);
create index if not exists profile_seen_profile_idx on profile_seen (profile_id);
alter table profile_seen enable row level security;
create policy profile_seen_own_read on profile_seen for select using (viewer_id = (select auth.uid()));
revoke insert, update, delete on profile_seen from anon, authenticated;

-- One stored feed per member and filter set (stable order, cursor pages, resumed on reopen).
create table if not exists feed_state (
  user_id uuid not null references app_users (id) on delete cascade,
  filters_key text not null check (char_length(filters_key) between 1 and 40),
  session_id text not null check (char_length(session_id) between 1 and 60),
  ids uuid[] not null default '{}',
  created_at timestamptz not null,
  opened_at timestamptz not null,
  last_visit_at timestamptz,
  primary key (user_id, filters_key)
);
alter table feed_state enable row level security;
create policy feed_state_own_read on feed_state for select using (user_id = (select auth.uid()));
revoke insert, update, delete on feed_state from anon, authenticated;

-- Cards that were really on screen (≥ 50 % for ≥ 1 s, measured by the app). Repeats within 30 minutes
-- count once; only live profiles of other members are recorded.
create or replace function record_impressions(p_ids uuid[]) returns int
language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active(); n int;
begin
  if coalesce(array_length(p_ids, 1), 0) > 100 then raise exception 'validation' using errcode = '22023'; end if;
  insert into profile_seen as s (viewer_id, profile_id, first_impressed_at, impressed_at, impressions)
  select u.id, p.id, now(), now(), 1
  from profiles p
  where p.id = any (coalesce(p_ids, '{}')) and p.status = 'published' and p.deleted_at is null and p.user_id <> u.id
  on conflict (viewer_id, profile_id) do update
    set impressed_at = now(), impressions = s.impressions + 1, first_impressed_at = coalesce(s.first_impressed_at, now())
    where s.impressed_at is null or s.impressed_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end $$;

-- Opening a full profile (get_profile records a de-duplicated view) cools it down for longer.
create or replace function trg_seen_on_view() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile_seen as s (viewer_id, profile_id, viewed_at, views) values (new.viewer_user_id, new.profile_id, new.at, 1)
  on conflict (viewer_id, profile_id) do update set viewed_at = excluded.viewed_at, views = s.views + 1;
  return new;
end $$;
drop trigger if exists view_events_seen on view_events;
create trigger view_events_seen after insert on view_events for each row execute function trg_seen_on_view();

create or replace function trg_seen_on_shortlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile_seen as s (viewer_id, profile_id, interaction, interacted_at) values (new.user_id, new.profile_id, 'shortlist', now())
  on conflict (viewer_id, profile_id) do update set interaction = 'shortlist', interacted_at = now();
  return new;
end $$;
drop trigger if exists shortlists_seen on shortlists;
create trigger shortlists_seen after insert on shortlists for each row execute function trg_seen_on_shortlist();

create or replace function trg_seen_on_interest() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile_seen as s (viewer_id, profile_id, interaction, interacted_at) values (new.from_user_id, new.to_profile_id, 'interest', now())
  on conflict (viewer_id, profile_id) do update set interaction = 'interest', interacted_at = now();
  return new;
end $$;
drop trigger if exists contact_requests_seen on contact_requests;
create trigger contact_requests_seen after insert on contact_requests for each row execute function trg_seen_on_interest();

revoke all on function trg_seen_on_view() from public, anon, authenticated;
revoke all on function trg_seen_on_shortlist() from public, anon, authenticated;
revoke all on function trg_seen_on_interest() from public, anon, authenticated;

-- Everything the feed engine needs about the caller, in one call (the profiles themselves come from
-- search_profiles, i.e. the same privacy projection as Discover).
create or replace function get_feed_context(p_keys text[]) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u app_users := me_active(); mine profiles := my_profile_row(u.id); cfg pricing_config;
begin
  if coalesce(array_length(p_keys, 1), 0) > 4 then raise exception 'validation' using errcode = '22023'; end if;
  select * into cfg from pricing_config limit 1;
  return jsonb_build_object(
    'viewerId', u.id,
    'lookingFor', mine.biodata #>> '{basic,lookingFor}',
    'prefs', mine.biodata -> 'preferences',
    'cfg', jsonb_build_object('impressionCooldownDays', cfg.feed_impression_cooldown_days, 'viewCooldownDays', cfg.feed_view_cooldown_days),
    'seen', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('profileId', s.profile_id, 'impressedAt', s.impressed_at, 'viewedAt', s.viewed_at,
                       'interaction', s.interaction, 'interactedAt', s.interacted_at)))
                      from profile_seen s where s.viewer_id = u.id
                        and greatest(s.impressed_at, s.viewed_at, s.interacted_at) > now() - interval '180 days'), '[]'::jsonb),
    'shortlisted', coalesce((select jsonb_agg(profile_id) from shortlists where user_id = u.id), '[]'::jsonb),
    'activeRequests', coalesce((select jsonb_agg(distinct case when r.from_user_id = u.id then r.to_profile_id else r.from_profile_id end)
                                from contact_requests r where (r.from_user_id = u.id or r.to_user_id = u.id) and r.status in ('pending', 'accepted')), '[]'::jsonb),
    'snapshots', coalesce((select jsonb_object_agg(f.filters_key, jsonb_strip_nulls(jsonb_build_object('key', f.filters_key, 'sessionId', f.session_id, 'ids', to_jsonb(f.ids),
                       'createdAt', f.created_at, 'openedAt', f.opened_at, 'lastVisitAt', f.last_visit_at)))
                      from feed_state f where f.user_id = u.id and f.filters_key = any (coalesce(p_keys, '{}'))), '{}'::jsonb));
end $$;

create or replace function save_feed_state(p_key text, p_session text, p_ids uuid[], p_created timestamptz, p_opened timestamptz, p_last_visit timestamptz)
returns void language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active();
begin
  if coalesce(array_length(p_ids, 1), 0) > 2000 then raise exception 'validation' using errcode = '22023'; end if;
  insert into feed_state (user_id, filters_key, session_id, ids, created_at, opened_at, last_visit_at)
  values (u.id, p_key, p_session, coalesce(p_ids, '{}'), p_created, p_opened, p_last_visit)
  on conflict (user_id, filters_key) do update set session_id = excluded.session_id, ids = excluded.ids, created_at = excluded.created_at,
    opened_at = excluded.opened_at, last_visit_at = excluded.last_visit_at;
  -- Keep the 20 most recently opened filter sets per member.
  delete from feed_state where user_id = u.id and filters_key not in (
    select filters_key from feed_state where user_id = u.id order by opened_at desc limit 20);
end $$;

-- Pricing save now includes the two Discover cooldowns.
drop function if exists admin_update_pricing(jsonb, int, boolean, int, int, int);
create or replace function admin_update_pricing(p_config jsonb, p_boost_days int, p_require_approval boolean,
  p_request_expiry_days int, p_poke_wait_hours int, p_poke_max_per_7_days int,
  p_feed_impression_cooldown_days int default null, p_feed_view_cooldown_days int default null)
returns pricing_config language plpgsql volatile security definer set search_path = public as $$
declare before pricing_config; after pricing_config;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into before from pricing_config where id;
  update pricing_config set config = p_config, boost_days = p_boost_days, require_approval = p_require_approval,
    request_expiry_days = coalesce(p_request_expiry_days, request_expiry_days),
    poke_wait_hours = coalesce(p_poke_wait_hours, poke_wait_hours),
    poke_max_per_7_days = coalesce(p_poke_max_per_7_days, poke_max_per_7_days),
    feed_impression_cooldown_days = coalesce(p_feed_impression_cooldown_days, feed_impression_cooldown_days),
    feed_view_cooldown_days = coalesce(p_feed_view_cooldown_days, feed_view_cooldown_days),
    version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id returning * into after;
  insert into pricing_history (admin_id, before, after) values (auth.uid(), to_jsonb(before), to_jsonb(after));
  insert into audit_events (actor_id, action, meta) values (auth.uid(), 'pricing.updated', jsonb_build_object('version', after.version));
  return after;
end $$;

-- Retention: rotation history older than 180 days no longer affects anything.
create or replace function run_feed_retention() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  delete from profile_seen where greatest(impressed_at, viewed_at, interacted_at) < now() - interval '180 days';
  get diagnostics n = row_count;
  delete from feed_state where opened_at < now() - interval '30 days';
  return n;
end $$;
revoke all on function run_feed_retention() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['record_impressions(uuid[])', 'get_feed_context(text[])',
    'save_feed_state(text, text, uuid[], timestamptz, timestamptz, timestamptz)',
    'admin_update_pricing(jsonb, int, boolean, int, int, int, int, int)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $q$select cron.schedule('hr-feed-retention', '41 21 * * *', 'select public.run_feed_retention()')$q$;
  end if;
end $$;
