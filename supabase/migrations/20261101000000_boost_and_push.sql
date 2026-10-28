-- Boost guarantees + phone push pipeline. Mirrors src/services/demo/demoBackend.ts,
-- src/domain/featured.ts and src/domain/push.ts (the dispatcher imports the same push.ts).
--
-- Boost (owner request 2026-10-28): every eligible viewer sees every active, published boost in
-- Featured, independent of their filters; fair daily rotation; impressions recorded as proof;
-- "ending soon"/"ended" notices exactly once; members can never grant themselves a boost.
--
-- Push: every in-app notification is a push candidate (single funnel = trigger on notifications).
-- Preferences, inactive accounts, device ownership, hourly caps and retries are enforced here; the
-- edge function `push-dispatch` only renders lock-screen-safe text and talks to Expo's push service.

-- ═════════════════════════ BOOST ═════════════════════════
alter table profiles add column if not exists boost_started_at timestamptz;
alter table profiles add column if not exists boost_notices jsonb not null default '{}';

-- Members create drafts only: whatever a client sends, boost/publication/deletion fields start empty
-- and the profile ID comes from the sequence. (Column grants already block these on UPDATE.)
create or replace function harden_profile_insert() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' then
    new.status := 'draft';
    new.boost_until := null;
    new.boost_started_at := null;
    new.boost_notices := '{}';
    new.published_at := null;
    new.deleted_at := null;
    new.admin_note := null;
    new.code := 'HR-' || nextval('profile_code_seq');
  end if;
  return new;
end $$;
drop trigger if exists profiles_harden_insert on profiles;
create trigger profiles_harden_insert before insert on profiles for each row execute function harden_profile_insert();

create table if not exists boost_impressions (
  profile_id uuid not null references profiles (id) on delete cascade,
  viewer_user_id uuid not null references app_users (id) on delete cascade,
  day date not null,
  primary key (profile_id, viewer_user_id, day)
);
alter table boost_impressions enable row level security;
create policy boost_impressions_admin on boost_impressions for select using (is_admin());

create or replace function is_featurable(p profiles) returns boolean
language sql stable security definer set search_path = public as $$
  select p.status = 'published' and p.deleted_at is null and p.boost_until > now()
     and exists (select 1 from app_users u where u.id = p.user_id and u.deactivated_at is null and u.deleted_at is null);
$$;

-- Featured feed: ignores the viewer's filters on purpose; same eligibility as discovery otherwise.
create or replace function get_featured(p_limit int default 12)
returns setof jsonb language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); looking text; day date := (now() at time zone 'utc')::date; r profiles;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select biodata #>> '{basic,lookingFor}' into looking from profiles where user_id = me and deleted_at is null;
  for r in
    select p.* from profiles p
    where p.user_id <> me and is_featurable(p) and not is_blocked_between(me, p)
      and (looking is null or p.profile_type = looking)
    -- fair rotation: stable per viewer per day, different across viewers
    order by md5(me::text || ':' || day::text || ':' || p.id::text)
    limit least(greatest(coalesce(p_limit, 12), 1), 50)
  loop
    insert into boost_impressions (profile_id, viewer_user_id, day) values (r.id, me, day) on conflict do nothing;
    return next project_profile(r, me, false) || jsonb_build_object('code', r.code)
                || coalesce(jsonb_build_object('relation', relation_with(me, r)), '{}'::jsonb);
  end loop;
end $$;
revoke all on function get_featured(int) from public, anon;
grant execute on function get_featured(int) to authenticated;
revoke all on function is_featurable(profiles) from public, anon, authenticated;

-- Applies a PAID or FREE boost order (called by the payment webhook / free-boost path, never by clients).
create or replace function apply_boost(p_order uuid) returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare o orders; p profiles; days int; base timestamptz;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.kind <> 'boost' or o.status not in ('paid', 'free') then raise exception 'invalid_state'; end if;
  if exists (select 1 from audit_events where action = 'boost.applied' and target = p_order::text) then
    select boost_until into base from profiles where id = o.profile_id; return base; -- idempotent
  end if;
  select * into p from profiles where id = o.profile_id for update;
  days := coalesce((o.terms ->> 'boostDays')::int, (select boost_days from pricing_config limit 1), 7);
  base := greatest(now(), coalesce(p.boost_until, now()));
  update profiles set
    boost_started_at = case when p.boost_until is null or p.boost_until <= now() then now() else p.boost_started_at end,
    boost_until = base + make_interval(days => days),
    boost_notices = case when days <= 1 then jsonb_build_object('ending', to_jsonb(base + make_interval(days => days))) else '{}'::jsonb end
  where id = p.id;
  insert into audit_events (actor_id, action, target, meta) values (o.user_id, 'boost.applied', p_order::text, jsonb_build_object('days', days));
  insert into notifications (user_id, type, params, deep_link)
    values (p.user_id, 'boost_started', jsonb_build_object('until', base + make_interval(days => days)), '/dashboard');
  return base + make_interval(days => days);
end $$;
revoke all on function apply_boost(uuid) from public, anon, authenticated;

-- Lifecycle notices, exactly once per boost end-time (pg_cron every 5 min).
create or replace function run_boost_jobs() returns int
language plpgsql volatile security definer set search_path = public as $$
declare p profiles; n int := 0; kind text;
begin
  for p in select * from profiles where boost_until is not null and deleted_at is null for update skip locked loop
    kind := case
      when now() >= p.boost_until and coalesce(p.boost_notices ->> 'ended', '') <> to_jsonb(p.boost_until) #>> '{}' then 'ended'
      when now() < p.boost_until and p.boost_until - now() <= interval '24 hours'
           and coalesce(p.boost_notices ->> 'ending', '') <> to_jsonb(p.boost_until) #>> '{}' then 'ending'
    end;
    if kind is null then continue; end if;
    update profiles set boost_notices = boost_notices || jsonb_build_object(kind, to_jsonb(p.boost_until)) where id = p.id;
    insert into notifications (user_id, type, params, deep_link) values (p.user_id, 'boost_' || kind, jsonb_build_object('until', p.boost_until), '/dashboard');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function run_boost_jobs() from public, anon, authenticated;

-- ═════════════════════════ ACTIVITY NOTICES ═════════════════════════
-- Anonymous, batched profile-view notice: at most one per owner per 6 hours.
create or replace function trg_notice_views() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid; last_at timestamptz; cnt int;
begin
  select user_id into owner from profiles where id = new.profile_id;
  if owner is null or owner = new.viewer_user_id then return new; end if;
  select max(created_at) into last_at from notifications where user_id = owner and type = 'profile_viewed';
  if last_at is not null and last_at > now() - interval '6 hours' then return new; end if;
  select count(distinct viewer_user_id) into cnt from view_events
    where profile_id = new.profile_id and viewer_user_id <> owner and at >= coalesce(last_at, now() - interval '6 hours');
  insert into notifications (user_id, type, params, deep_link) values (owner, 'profile_viewed', jsonb_build_object('count', greatest(cnt, 1)::text), '/dashboard');
  return new;
end $$;
drop trigger if exists view_events_notice on view_events;
create trigger view_events_notice after insert on view_events for each row execute function trg_notice_views();

-- Anonymous "someone shortlisted you" — once per (shortlister, profile), ever.
create table if not exists shortlist_notices (
  user_id uuid not null references app_users (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  primary key (user_id, profile_id)
);
alter table shortlist_notices enable row level security; -- no policies: trigger-only

create or replace function trg_notice_shortlist() returns trigger
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  insert into shortlist_notices (user_id, profile_id) values (new.user_id, new.profile_id) on conflict do nothing;
  if not found then return new; end if;
  select user_id into owner from profiles where id = new.profile_id;
  if owner is not null and owner <> new.user_id then
    insert into notifications (user_id, type, deep_link) values (owner, 'profile_shortlisted', '/dashboard');
  end if;
  return new;
end $$;
drop trigger if exists shortlists_notice on shortlists;
create trigger shortlists_notice after insert on shortlists for each row execute function trg_notice_shortlist();

-- ═════════════════════════ PUSH ═════════════════════════
alter table app_users add column if not exists push_prefs jsonb not null default '{}';

create table if not exists push_devices (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[^]]{6,}\]$'),
  user_id uuid not null references app_users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_devices_user_idx on push_devices (user_id);
alter table push_devices enable row level security;
create policy push_devices_own_read on push_devices for select using (user_id = auth.uid());

create table if not exists push_outbox (
  id bigserial primary key,
  notification_id uuid not null references notifications (id) on delete cascade,
  user_id uuid not null references app_users (id) on delete cascade,
  token text,
  category text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  reason text,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  ticket_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (notification_id, token)
);
create index if not exists push_outbox_due_idx on push_outbox (status, next_attempt_at);
create index if not exists push_outbox_user_idx on push_outbox (user_id, created_at desc);
alter table push_outbox enable row level security;
create policy push_outbox_admin on push_outbox for select using (is_admin());

create or replace function push_category(t text) returns text language sql immutable as $$
  select case
    when t in ('request_received','request_accepted','request_declined','request_expired','phone_offer_received',
               'phone_offer_accepted','phone_offer_declined','phone_offer_withdrawn','poke','contact_shared') then 'interests'
    when t in ('profile_viewed','profile_shortlisted') then 'activity'
    when t = 'announcement' then 'announcements'
    else 'account' -- approvals, payments, boosts, safety, security, admin alerts: always delivered
  end
$$;

-- Same defaults as DEFAULT_PUSH_PREFS in src/domain/push.ts.
create or replace function push_prefs_of(p jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('enabled', true, 'interests', true, 'activity', true, 'announcements', true, 'showNames', false) || coalesce(p, '{}')
$$;

create or replace function trg_enqueue_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare u app_users; prefs jsonb; cat text := push_category(new.type); recent int; d record;
begin
  select * into u from app_users where id = new.user_id;
  if not found or not exists (select 1 from push_devices where user_id = new.user_id) then return new; end if;
  if u.deleted_at is not null or u.deactivated_at is not null then
    insert into push_outbox (notification_id, user_id, category, status, reason) values (new.id, new.user_id, cat, 'skipped', 'account_inactive');
    return new;
  end if;
  prefs := push_prefs_of(u.push_prefs);
  if cat <> 'account' and not (prefs ->> 'enabled')::boolean then
    insert into push_outbox (notification_id, user_id, category, status, reason) values (new.id, new.user_id, cat, 'skipped', 'disabled');
    return new;
  end if;
  if cat <> 'account' and not coalesce((prefs ->> cat)::boolean, true) then
    insert into push_outbox (notification_id, user_id, category, status, reason) values (new.id, new.user_id, cat, 'skipped', 'category_off');
    return new;
  end if;
  if cat <> 'account' then
    select count(distinct notification_id) into recent from push_outbox
      where user_id = new.user_id and category <> 'account' and status <> 'skipped' and created_at > now() - interval '1 hour';
    if recent >= 12 then
      insert into push_outbox (notification_id, user_id, category, status, reason) values (new.id, new.user_id, cat, 'skipped', 'rate_limited');
      return new;
    end if;
  end if;
  for d in select token from push_devices where user_id = new.user_id loop
    insert into push_outbox (notification_id, user_id, token, category) values (new.id, new.user_id, d.token, cat) on conflict do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists notifications_enqueue_push on notifications;
create trigger notifications_enqueue_push after insert on notifications for each row execute function trg_enqueue_push();

-- One phone ↔ one account (a shared phone stops getting the previous account's alerts); ≤ 5 phones each.
create or replace function register_push_device(p_token text, p_platform text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  delete from push_devices where token = p_token and user_id <> me;
  insert into push_devices (token, user_id, platform) values (p_token, me, p_platform)
    on conflict (token) do update set last_seen_at = now(), platform = excluded.platform;
  delete from push_devices where user_id = me and token in (
    select token from push_devices where user_id = me order by last_seen_at desc offset 5);
end $$;

create or replace function unregister_push_device(p_token text) returns void
language sql volatile security definer set search_path = public as $$
  delete from push_devices where token = p_token and user_id = auth.uid();
$$;

create or replace function set_push_prefs(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); clean jsonb := '{}'; k text;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  foreach k in array array['enabled','interests','activity','announcements','showNames'] loop
    if jsonb_typeof(p_patch -> k) = 'boolean' then clean := clean || jsonb_build_object(k, p_patch -> k); end if;
  end loop;
  update app_users set push_prefs = push_prefs_of(push_prefs) || clean where id = me;
  return (select push_prefs_of(push_prefs) from app_users where id = me);
end $$;

create or replace function get_push_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('prefs', push_prefs_of(u.push_prefs), 'devices', (select count(*) from push_devices d where d.user_id = u.id))
  from app_users u where u.id = auth.uid();
$$;

revoke all on function register_push_device(text, text) from public, anon;
revoke all on function unregister_push_device(text) from public, anon;
revoke all on function set_push_prefs(jsonb) from public, anon;
revoke all on function get_push_settings() from public, anon;
grant execute on function register_push_device(text, text) to authenticated;
grant execute on function unregister_push_device(text) to authenticated;
grant execute on function set_push_prefs(jsonb) to authenticated;
grant execute on function get_push_settings() to authenticated;

-- ───────── dispatcher API (service role only) ─────────
-- Claims due rows atomically so parallel dispatchers never double-send.
create or replace function claim_push_batch(p_limit int default 500)
returns table (id bigint, token text, type text, params jsonb, deep_link text, notification_id uuid, lang text, show_names boolean)
language plpgsql volatile security definer set search_path = public as $$
begin
  return query
  with due as (
    select o.id from push_outbox o
    where o.status = 'queued' and o.next_attempt_at <= now()
    order by o.created_at limit least(greatest(p_limit, 1), 1000)
    for update skip locked
  ), upd as (
    update push_outbox o set status = 'sending', attempts = o.attempts + 1 from due where o.id = due.id returning o.*
  )
  select upd.id, upd.token, n.type, n.params, n.deep_link, n.id, u.language, (push_prefs_of(u.push_prefs) ->> 'showNames')::boolean
  from upd join notifications n on n.id = upd.notification_id join app_users u on u.id = upd.user_id
  -- the token may have moved to another account since enqueue: never deliver across accounts
  where exists (select 1 from push_devices d where d.token = upd.token and d.user_id = upd.user_id);
  update push_outbox o set status = 'skipped', reason = 'device_moved'
    where o.status = 'sending' and not exists (select 1 from push_devices d where d.token = o.token and d.user_id = o.user_id);
end $$;

-- Records Expo's answer for one message. Invalid tokens are removed; transient errors retry with backoff.
create or replace function push_result(p_id bigint, p_ok boolean, p_ticket text, p_error text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare o push_outbox;
begin
  select * into o from push_outbox where id = p_id for update;
  if not found then return; end if;
  if p_ok then
    update push_outbox set status = 'sent', ticket_id = p_ticket, sent_at = now(), reason = null where id = p_id;
  elsif p_error = 'DeviceNotRegistered' then
    delete from push_devices where token = o.token;
    update push_outbox set status = 'failed', reason = p_error where id = p_id;
  elsif o.attempts < 5 and coalesce(p_error, 'network') in ('network', 'MessageRateExceeded', 'ExpoError', 'InternalError') then
    update push_outbox set status = 'queued', reason = p_error, next_attempt_at = now() + make_interval(secs => 30 * power(2, o.attempts)) where id = p_id;
  else
    update push_outbox set status = 'failed', reason = coalesce(p_error, 'unknown') where id = p_id;
  end if;
end $$;

-- Receipts (checked ~15 min after sending) confirm delivery to Apple/Google or reveal dead tokens.
create or replace function push_receipt(p_ticket text, p_ok boolean, p_error text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare o push_outbox;
begin
  select * into o from push_outbox where ticket_id = p_ticket for update;
  if not found then return; end if;
  if p_ok then update push_outbox set status = 'delivered' where id = o.id;
  else
    if p_error = 'DeviceNotRegistered' then delete from push_devices where token = o.token; end if;
    update push_outbox set status = 'failed', reason = p_error where id = o.id;
  end if;
end $$;

create or replace function due_push_receipts(p_limit int default 1000) returns setof text
language sql stable security definer set search_path = public as $$
  select ticket_id from push_outbox where status = 'sent' and ticket_id is not null and sent_at < now() - interval '15 minutes'
  order by sent_at limit least(greatest(p_limit, 1), 1000);
$$;

revoke all on function claim_push_batch(int) from public, anon, authenticated;
revoke all on function push_result(bigint, boolean, text, text) from public, anon, authenticated;
revoke all on function push_receipt(text, boolean, text) from public, anon, authenticated;
revoke all on function due_push_receipts(int) from public, anon, authenticated;

-- Scheduling (Supabase: enable pg_cron + pg_net, then):
--   select cron.schedule('boost-jobs', '*/5 * * * *', $$select run_boost_jobs()$$);
--   select cron.schedule('push-dispatch', '* * * * *', $$select net.http_post(
--     url := '<project-url>/functions/v1/push-dispatch',
--     headers := jsonb_build_object('Authorization', 'Bearer ' || '<PUSH_CRON_SECRET>'))$$);
