-- Boost becomes the centre tab (owner request 2026-10-28) with gentle reminders while a live profile
-- isn't boosted. Same rule as src/domain/featured.ts boostReminderDue():
--   published, not deleted, owner active, boost not disabled for this profile type,
--   published ≥ 2 days ago, last boost ended ≥ 7 days ago, last reminder ≥ 7 days ago.
-- Reminders are promotional: push category 'announcements' (member can switch them off; hourly cap applies).

alter table profiles add column if not exists boost_reminded_at timestamptz;

create or replace function push_category(t text) returns text language sql immutable as $$
  select case
    when t in ('request_received','request_accepted','request_declined','request_expired','phone_offer_received',
               'phone_offer_accepted','phone_offer_declined','phone_offer_withdrawn','poke','contact_shared') then 'interests'
    when t in ('profile_viewed','profile_shortlisted') then 'activity'
    when t in ('announcement', 'boost_reminder') then 'announcements'
    else 'account' -- approvals, payments, boost lifecycle, safety, security, admin alerts: always delivered
  end
$$;

-- Boost notices open the Boost tab now.
create or replace function trg_boost_links() returns trigger
language plpgsql as $$
begin
  if new.type like 'boost\_%' and new.deep_link = '/dashboard' then new.deep_link := '/boost'; end if;
  return new;
end $$;
drop trigger if exists notifications_boost_links on notifications;
create trigger notifications_boost_links before insert on notifications for each row execute function trg_boost_links();

-- Lifecycle notices (unchanged) + weekly reminders. pg_cron every 5 min.
create or replace function run_boost_jobs() returns int
language plpgsql volatile security definer set search_path = public as $$
declare p profiles; n int := 0; kind text; cfg jsonb := (select config from pricing_config limit 1);
begin
  for p in select * from profiles where boost_until is not null and deleted_at is null for update skip locked loop
    kind := case
      when now() >= p.boost_until and coalesce(p.boost_notices ->> 'ended', '') <> to_jsonb(p.boost_until) #>> '{}' then 'ended'
      when now() < p.boost_until and p.boost_until - now() <= interval '24 hours'
           and coalesce(p.boost_notices ->> 'ending', '') <> to_jsonb(p.boost_until) #>> '{}' then 'ending'
    end;
    if kind is null then continue; end if;
    update profiles set boost_notices = boost_notices || jsonb_build_object(kind, to_jsonb(p.boost_until)) where id = p.id;
    insert into notifications (user_id, type, params, deep_link) values (p.user_id, 'boost_' || kind, jsonb_build_object('until', p.boost_until), '/boost');
    n := n + 1;
  end loop;
  for p in
    select pr.* from profiles pr join app_users u on u.id = pr.user_id
    where pr.status = 'published' and pr.deleted_at is null
      and u.deactivated_at is null and u.deleted_at is null
      and coalesce(cfg #>> array['boost', pr.profile_type, 'mode'], '') <> 'disabled'
      and (pr.published_at is null or pr.published_at <= now() - interval '2 days')
      and (pr.boost_until is null or pr.boost_until <= now() - interval '7 days')
      and (pr.boost_reminded_at is null or pr.boost_reminded_at <= now() - interval '7 days')
    for update of pr skip locked
  loop
    update profiles set boost_reminded_at = now() where id = p.id;
    insert into notifications (user_id, type, deep_link) values (p.user_id, 'boost_reminder', '/boost');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function run_boost_jobs() from public, anon, authenticated;
revoke all on function trg_boost_links() from public, anon, authenticated;
