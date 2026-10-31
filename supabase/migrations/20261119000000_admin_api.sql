-- Admin console API for the Supabase adapter (Phase 2, 2026-10-31). Mirrors DemoBackend's admin methods.
-- Every function re-checks is_admin() (or is_master()) itself; phones leave the database masked.

create or replace function admin_require() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return auth.uid();
end $$;
revoke all on function admin_require() from public, anon, authenticated;

create or replace function masked_phone(cc text, phone text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(cc, '') || ' ' || repeat('•', greatest(length(coalesce(phone, '')) - 4, 0)) || right(coalesce(phone, ''), 4);
$$;

create or replace function admin_member_row(u app_users) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'userId', u.id, 'profileId', p.id, 'code', p.code, 'name', p.biodata #>> '{basic,fullName}',
    'phoneMasked', masked_phone(u.country_code, u.phone), 'role', u.role, 'profileStatus', p.status,
    'city', p.biodata #>> '{location,city}', 'deactivatedAt', u.deactivated_at, 'deactivatedBy', u.deactivated_by,
    'deletedAt', u.deleted_at, 'addedByTeam', u.created_by is not null, 'claimedAt', u.claimed_at))
  from (select 1) one
  left join lateral (select * from profiles x where x.user_id = u.id order by (x.deleted_at is null) desc, x.created_at desc limit 1) p on true;
$$;
revoke all on function admin_member_row(app_users) from public, anon, authenticated;

-- ───────── dashboard ─────────
create or replace function admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  rq_total int; accepted int; poked int; poked_answered int; shared int; median_h numeric;
begin
  perform admin_require();
  select count(*), count(*) filter (where status = 'accepted' or (status = 'blocked' and responded_at is not null)),
         count(*) filter (where cardinality(pokes) > 0),
         count(*) filter (where cardinality(pokes) > 0 and responded_at > pokes[1])
    into rq_total, accepted, poked, poked_answered from contact_requests;
  select count(distinct request_id) into shared from phone_offers where status = 'accepted';
  select percentile_disc(0.5) within group (order by extract(epoch from responded_at - created_at) / 3600)
    into median_h from contact_requests where responded_at is not null;
  return jsonb_build_object(
    'users', (select count(*) from app_users where role = 'user' and deleted_at is null),
    'activeUsers', (select count(*) from app_users where role = 'user' and deleted_at is null and deactivated_at is null),
    'profiles', (select jsonb_build_object(
        'draft', count(*) filter (where status = 'draft'), 'pending', count(*) filter (where status = 'pending'),
        'published', count(*) filter (where status = 'published'), 'paused', count(*) filter (where status = 'paused'),
        'rejected', count(*) filter (where status = 'rejected')) from profiles where deleted_at is null),
    'brides', (select count(*) from profiles where deleted_at is null and profile_type = 'bride'),
    'grooms', (select count(*) from profiles where deleted_at is null and profile_type = 'groom'),
    'trash', (select count(*) from profiles where deleted_at is not null) + (select count(*) from app_users where deleted_at is not null),
    'openReports', (select count(*) from reports where status = 'open'),
    'revenue', (select coalesce(sum(amount), 0) from orders where status = 'paid' and not simulated),
    'simulatedRevenue', (select coalesce(sum(amount), 0) from orders where status = 'paid' and simulated),
    'requests', rq_total,
    'acceptedRequests', (select count(*) from contact_requests where status = 'accepted'),
    'requireApproval', (select require_approval from pricing_config limit 1),
    'boosts', jsonb_build_object(
        'active', (select count(*) from profiles where deleted_at is null and boost_until > now()),
        'visible', (select count(*) from profiles p where is_featurable(p))),
    'push', jsonb_build_object(
        'devices', (select count(*) from push_devices),
        'usersWithDevices', (select count(distinct user_id) from push_devices),
        'queued', (select count(*) from push_outbox where status = 'queued'),
        'sent', (select count(*) from push_outbox where status = 'sent'),
        'delivered', (select count(*) from push_outbox where status = 'delivered'),
        'failed', (select count(*) from push_outbox where status = 'failed'),
        'skipped', (select count(*) from push_outbox where status = 'skipped' and coalesce(reason, '') <> 'not_configured'),
        'notConfigured', (select count(*) from push_outbox where reason = 'not_configured')),
    'connections', jsonb_strip_nulls(jsonb_build_object(
        'interests', rq_total, 'accepted', accepted,
        'declined', (select count(*) from contact_requests where status = 'declined'),
        'expired', (select count(*) from contact_requests where status = 'expired'),
        'blocked', (select count(*) from contact_requests where status = 'blocked'),
        'phoneOffers', (select count(*) from phone_offers),
        'phoneShared', (select count(*) from phone_offers where status = 'accepted'),
        'pokes', poked, 'pokedThenAnswered', poked_answered,
        'acceptanceRate', case when rq_total > 0 then accepted::numeric / rq_total else 0 end,
        'sharingRate', case when accepted > 0 then shared::numeric / accepted else 0 end,
        'pokeResponseRate', case when poked > 0 then poked_answered::numeric / poked else 0 end,
        'medianResponseHours', round(median_h))));
end $$;

-- ───────── lists ─────────
create or replace function admin_list_profiles(p_status profile_status default null) returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select to_jsonb(p) || jsonb_build_object('phone_masked', masked_phone(u.country_code, u.phone))
  from profiles p join app_users u on u.id = p.user_id
  where p.deleted_at is null and (p_status is null or p.status = p_status)
  order by p.updated_at desc limit 1000;
end $$;

create or replace function admin_list_users() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select (to_jsonb(u) - 'phone') || jsonb_build_object('phone', ltrim(masked_phone(null, u.phone)), 'profile_status', p.status, 'profile_code', p.code)
  from app_users u
  left join lateral (select status, code from profiles x where x.user_id = u.id and x.deleted_at is null limit 1) p on true
  where u.deleted_at is null
  order by u.created_at desc limit 2000;
end $$;

create or replace function admin_list_orders() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select to_jsonb(o) || jsonb_build_object('profile_code', coalesce(p.code, '—'))
  from orders o left join profiles p on p.id = o.profile_id
  order by o.created_at desc limit 2000;
end $$;

create or replace function admin_list_reports() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select to_jsonb(r) || jsonb_build_object('profile_name', coalesce(p.biodata #>> '{basic,fullName}', '—'), 'profile_code', coalesce(p.code, '—'), 'profile_user_id', p.user_id)
  from reports r left join profiles p on p.id = r.profile_id
  order by r.created_at desc limit 2000;
end $$;

create or replace function admin_resolve_report(p_id uuid, p_status text, p_pause boolean default false) returns void
language plpgsql volatile security definer set search_path = public as $$
declare a uuid := admin_require(); r reports; p profiles;
begin
  if p_status not in ('resolved', 'dismissed') then raise exception 'validation' using errcode = '22023'; end if;
  update reports set status = p_status, resolved_at = now() where id = p_id returning * into r;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_pause then
    update profiles set status = 'paused', updated_at = now() where id = r.profile_id and deleted_at is null returning * into p;
    if p.id is not null then insert into notifications (user_id, type, deep_link) values (p.user_id, 'safety', '/dashboard'); end if;
  end if;
  insert into audit_events (actor_id, action, target, meta) values (a, 'report.' || p_status, p_id::text, jsonb_build_object('pauseProfile', coalesce(p_pause, false)));
end $$;

create or replace function admin_list_requests() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select (to_jsonb(r) - 'idempotency_key') || jsonb_build_object(
    'from_name', coalesce(fp.biodata #>> '{basic,fullName}', '—'), 'to_name', coalesce(tp.biodata #>> '{basic,fullName}', '—'),
    'from_code', coalesce(fp.code, '—'), 'to_code', coalesce(tp.code, '—'))
  from contact_requests r left join profiles fp on fp.id = r.from_profile_id left join profiles tp on tp.id = r.to_profile_id
  order by r.created_at desc limit 2000;
end $$;

create or replace function admin_get_member(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u app_users; m jsonb; p profiles;
begin
  perform admin_require();
  select * into u from app_users where id = p_user;
  if u.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  m := admin_member_row(u);
  select * into p from profiles where id = (m ->> 'profileId')::uuid;
  return jsonb_build_object(
    'member', m,
    'user', (to_jsonb(u) - 'phone') || jsonb_build_object('phone_masked', m ->> 'phoneMasked'),
    'profile', case when p.id is not null then to_jsonb(p) end,
    'requests', coalesce((select jsonb_agg(x order by x ->> 'created_at' desc) from admin_list_requests() x
                          where x ->> 'from_user_id' = u.id::text or x ->> 'to_user_id' = u.id::text), '[]'::jsonb),
    'reportsAbout', coalesce((select jsonb_agg(to_jsonb(r)) from reports r where p.id is not null and r.profile_id = p.id), '[]'::jsonb),
    'reportsBy', coalesce((select jsonb_agg(to_jsonb(r)) from reports r where r.reporter_user_id = u.id), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from orders o where o.user_id = u.id), '[]'::jsonb));
end $$;

-- The number is normalised by the app (src/domain/phone.ts); the answer never reveals more than the id.
create or replace function admin_check_phone(p_cc text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return (
  select jsonb_build_object('available', u.id is null, 'existingUserId', u.id)
  from (select 1) one left join app_users u on u.country_code || u.phone = p_cc || p_phone);
end $$;

create or replace function admin_audit_log() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select to_jsonb(e) || jsonb_build_object('target_label', (
      select code from profiles p where p.id::text = e.target or p.user_id::text = e.target order by p.created_at desc limit 1))
  from audit_events e
  order by e.at desc limit 200;
end $$;

create or replace function admin_list_trash() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select x from (
    select jsonb_build_object('kind', 'user', 'id', u.id,
             'label', coalesce((select code from profiles where user_id = u.id order by created_at desc limit 1), 'No profile') || ' · ' || masked_phone(u.country_code, u.phone),
             'deletedAt', u.deleted_at, 'deletedBy', u.deleted_by, 'reason', u.delete_reason, 'purgeAt', u.deleted_at + interval '30 days') x, u.deleted_at d
    from app_users u where u.deleted_at is not null
    union all
    select jsonb_build_object('kind', 'profile', 'id', p.id, 'label', p.code || ' · ' || coalesce(p.biodata #>> '{basic,fullName}', ''),
             'deletedAt', p.deleted_at, 'deletedBy', p.deleted_by, 'reason', p.delete_reason, 'purgeAt', p.deleted_at + interval '30 days'), p.deleted_at
    from profiles p join app_users o on o.id = p.user_id and o.deleted_at is null where p.deleted_at is not null
  ) t
  order by d desc;
end $$;

create or replace function admin_remove_photo(p_profile uuid, p_photo text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare a uuid := admin_require(); p profiles;
begin
  select * into p from profiles where id = p_profile and deleted_at is null;
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update profiles set biodata = jsonb_set(biodata, '{photos}', coalesce((select jsonb_agg(ph) from jsonb_array_elements(biodata -> 'photos') ph where ph ->> 'id' <> p_photo), '[]'::jsonb)), updated_at = now()
  where id = p.id;
  insert into notifications (user_id, type, deep_link) values (p.user_id, 'safety', '/biodata');
  insert into audit_events (actor_id, action, target, meta) values (a, 'photo.removed', p.id::text, jsonb_build_object('photo', p_photo));
end $$;

-- ───────── team & security (sub-admins may look; only masters change things) ─────────
create or replace function master_list_admins() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select jsonb_strip_nulls(jsonb_build_object('id', u.id, 'role', u.role, 'phoneMasked', masked_phone(u.country_code, u.phone),
           'createdAt', u.created_at, 'deactivatedAt', u.deactivated_at))
  from app_users u
  where u.role in ('admin', 'master') and u.deleted_at is null
  order by (u.role = 'master') desc, u.created_at;
end $$;

create or replace function master_security_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return (
  select jsonb_strip_nulls(jsonb_build_object(
    'codesRemaining', (select count(*) from recovery_codes where used_at is null),
    'codesGeneratedAt', s.codes_generated_at,
    'backupPhoneMasked', case when s.backup_phone is not null then masked_phone(s.backup_country_code, s.backup_phone) end,
    'pendingRecovery', case when s.pending_phone is not null then jsonb_build_object('phoneMasked', masked_phone(s.pending_country_code, s.pending_phone),
                         'startedAt', s.pending_started_at, 'completesAt', s.pending_completes_at) end))
  from master_security s where s.id);
end $$;

-- ───────── announcements ─────────
create or replace function announcement_audience(p_segment text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select u.id from app_users u
  left join lateral (select * from profiles x where x.user_id = u.id and x.deleted_at is null limit 1) p on true
  where u.role = 'user' and u.deactivated_at is null and u.deleted_at is null
    and case p_segment
      when 'all' then true
      when 'brides' then p.profile_type = 'bride'
      when 'grooms' then p.profile_type = 'groom'
      when 'published' then p.status = 'published'
      when 'unpublished' then p.id is null or p.status <> 'published'
      else false end;
$$;
revoke all on function announcement_audience(text) from public, anon, authenticated;

create or replace function admin_audience_count(p_segment text) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return (
  select count(*)::int from announcement_audience(p_segment));
end $$;

create or replace function announcement_fan_out(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare a announcements;
begin
  update announcements set status = 'published', published_at = now(), updated_at = now() where id = p_id returning * into a;
  insert into announcement_deliveries (announcement_id, user_id, push_status)
    select a.id, x, case when a.push_enabled then 'not_configured'::push_status else 'not_requested'::push_status end
    from announcement_audience(a.segment) x
  on conflict do nothing;
  insert into notifications (user_id, type, deep_link, announcement_id)
    select x, 'announcement', a.deep_link, a.id from announcement_audience(a.segment) x;
end $$;
revoke all on function announcement_fan_out(uuid) from public, anon, authenticated;

create or replace function admin_save_announcement(p jsonb) returns announcements
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := admin_require(); a announcements; v text;
begin
  if coalesce(trim(p #>> '{title,en}'), '') = '' or coalesce(trim(p #>> '{body,en}'), '') = '' then raise exception 'validation: English title and body are required' using errcode = '22023'; end if;
  for v in select value from jsonb_each_text(coalesce(p -> 'title', '{}')) loop
    if length(v) > 200 or not text_is_safe(v) then raise exception 'validation: title' using errcode = '22023'; end if;
  end loop;
  for v in select value from jsonb_each_text(coalesce(p -> 'body', '{}')) loop
    if length(v) > 4000 or not text_is_safe(v) then raise exception 'validation: message' using errcode = '22023'; end if;
  end loop;
  if coalesce(p ->> 'deepLink', '') <> '' and (p ->> 'deepLink' !~ '^/[A-Za-z0-9/_?=&.-]*$' or p ->> 'deepLink' like '//%') then raise exception 'validation: links must be an in-app path' using errcode = '22023'; end if;
  if coalesce(p ->> 'imageUrl', '') <> '' and p ->> 'imageUrl' !~ '^https://' then raise exception 'validation: images must use https' using errcode = '22023'; end if;
  if coalesce(p ->> 'segment', '') not in ('all', 'brides', 'grooms', 'published', 'unpublished') then raise exception 'validation: segment' using errcode = '22023'; end if;
  if p ? 'id' and p ->> 'id' is not null then
    select * into a from announcements where id = (p ->> 'id')::uuid for update;
    if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
    if a.status not in ('draft', 'scheduled') then raise exception 'invalid_state: only drafts can be edited'; end if;
    update announcements set title = p -> 'title', body = p -> 'body', image_url = nullif(p ->> 'imageUrl', ''), priority = coalesce(p ->> 'priority', priority),
      deep_link = nullif(p ->> 'deepLink', ''), segment = p ->> 'segment', push_enabled = coalesce((p ->> 'pushEnabled')::boolean, false),
      expires_at = (p ->> 'expiresAt')::timestamptz, updated_at = now()
    where id = a.id returning * into a;
    insert into audit_events (actor_id, action, target) values (me, 'announcement.updated', a.id::text);
  else
    insert into announcements (title, body, image_url, priority, deep_link, segment, status, push_enabled, expires_at, created_by)
    values (p -> 'title', p -> 'body', nullif(p ->> 'imageUrl', ''), coalesce(p ->> 'priority', 'normal'), nullif(p ->> 'deepLink', ''), p ->> 'segment', 'draft',
            coalesce((p ->> 'pushEnabled')::boolean, false), (p ->> 'expiresAt')::timestamptz, me)
    returning * into a;
    insert into audit_events (actor_id, action, target) values (me, 'announcement.created', a.id::text);
  end if;
  return a;
end $$;

create or replace function admin_publish_announcement(p_id uuid, p_at timestamptz default null) returns announcements
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := admin_require(); a announcements;
begin
  select * into a from announcements where id = p_id for update;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if a.status not in ('draft', 'scheduled') then raise exception 'invalid_state'; end if;
  if p_at is not null and p_at > now() then
    update announcements set status = 'scheduled', scheduled_at = p_at, updated_at = now() where id = a.id returning * into a;
  else
    perform announcement_fan_out(a.id);
    select * into a from announcements where id = p_id;
  end if;
  insert into audit_events (actor_id, action, target) values (me, 'announcement.' || a.status, a.id::text);
  return a;
end $$;

create or replace function admin_archive_announcement(p_id uuid) returns announcements
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := admin_require(); a announcements;
begin
  update announcements set status = 'archived', updated_at = now() where id = p_id returning * into a;
  if a.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into audit_events (actor_id, action, target) values (me, 'announcement.archived', a.id::text);
  return a;
end $$;

create or replace function admin_list_announcements() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select to_jsonb(a) || jsonb_build_object('stats', jsonb_build_object(
    'targeted', count(d.user_id), 'inAppAvailable', count(d.in_app_at),
    'pushSubmitted', count(*) filter (where d.push_status in ('submitted', 'delivered', 'failed')),
    'pushDelivered', count(*) filter (where d.push_status = 'delivered'),
    'pushFailed', count(*) filter (where d.push_status = 'failed'),
    'pushNotConfigured', count(*) filter (where d.push_status = 'not_configured'),
    'uniqueViewers', count(d.viewed_at), 'unread', count(d.user_id) - count(d.viewed_at), 'clicks', count(d.clicked_at),
    'viewRate', case when count(d.user_id) > 0 then count(d.viewed_at)::numeric / count(d.user_id) else 0 end))
  from announcements a left join announcement_deliveries d on d.announcement_id = a.id
  group by a.id
  order by a.updated_at desc;
end $$;

-- pg_cron (every 5 minutes): publish scheduled announcements that are due.
create or replace function run_announcement_jobs() returns int
language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from announcements where status = 'scheduled' and scheduled_at <= now() loop
    perform announcement_fan_out(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function run_announcement_jobs() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array['admin_stats()', 'admin_list_profiles(profile_status)', 'admin_list_users()', 'admin_list_orders()', 'admin_list_reports()',
    'admin_resolve_report(uuid, text, boolean)', 'admin_list_requests()', 'admin_get_member(uuid)', 'admin_check_phone(text, text)', 'admin_audit_log()',
    'admin_list_trash()', 'admin_remove_photo(uuid, text)', 'master_list_admins()', 'master_security_status()', 'admin_audience_count(text)',
    'admin_save_announcement(jsonb)', 'admin_publish_announcement(uuid, timestamptz)', 'admin_archive_announcement(uuid)', 'admin_list_announcements()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function masked_phone(text, text) from public, anon, authenticated;
