-- Admin console: human profile IDs (HR-10001…), relation badges on cards, admin member search,
-- and the admin bell (alerts for reports, payments, approvals, deletions and security changes).

-- ───────── profile IDs ─────────
-- Sequential and never reused (a sequence never hands out a value twice, even after deletes).
create sequence if not exists profile_code_seq start 10001;
alter table profiles add column if not exists code text;
update profiles set code = 'HR-' || nextval('profile_code_seq') where code is null;
alter table profiles alter column code set default 'HR-' || nextval('profile_code_seq');
alter table profiles alter column code set not null;
create unique index if not exists profiles_code_key on profiles (code);
-- Members can never choose or change their ID.
create or replace function keep_profile_code() returns trigger language plpgsql as $$
begin
  if new.code is distinct from old.code then raise exception 'profile code is immutable'; end if;
  return new;
end $$;
drop trigger if exists profiles_code_immutable on profiles;
create trigger profiles_code_immutable before update of code on profiles for each row execute function keep_profile_code();

-- ───────── relation between the viewer and a profile (for "Connected / Interest sent / Declined" badges) ─────────
create or replace function relation_with(viewer uuid, target profiles) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', r.status,
    'direction', case when r.from_user_id = viewer then 'sent' else 'received' end,
    'at', coalesce(r.responded_at, r.created_at))
  from contact_requests r
  where (r.from_user_id = viewer and r.to_profile_id = target.id) or (r.to_user_id = viewer and r.from_profile_id = target.id)
  order by r.created_at desc
  limit 1;
$$;
revoke all on function relation_with(uuid, profiles) from public, anon, authenticated;

-- Discovery and profile view now carry the profile ID and the viewer's relation (same filters as before).
create or replace function search_profiles(p_show text default null, p_age_min int default null, p_age_max int default null,
  p_countries text[] default null, p_states text[] default null, p_cities text[] default null, p_keyword text default null,
  p_limit int default 20, p_offset int default 0)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select project_profile(p, auth.uid(), false) || jsonb_build_object('code', p.code)
         || coalesce(jsonb_build_object('relation', relation_with(auth.uid(), p)), '{}'::jsonb)
  from profiles p
  join app_users u on u.id = p.user_id and u.deactivated_at is null and u.deleted_at is null
  where auth.uid() is not null
    and p.status = 'published' and p.deleted_at is null
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
declare p profiles; me uuid := auth.uid(); owner app_users;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into p from profiles where id = p_id and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into owner from app_users where id = p.user_id;
  if p.user_id <> me and not is_admin() then
    if p.status <> 'published' or owner.deleted_at is not null or owner.deactivated_at is not null or is_blocked_between(me, p) then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if not exists (select 1 from view_events where profile_id = p.id and viewer_user_id = me and at > now() - interval '30 minutes') then
      insert into view_events (profile_id, viewer_user_id) values (p.id, me);
    end if;
  end if;
  return project_profile(p, me, true) || jsonb_build_object('code', p.code)
         || coalesce(jsonb_build_object('relation', relation_with(me, p)), '{}'::jsonb);
end $$;

-- ───────── admin search ─────────
-- By profile ID, name, city or phone digits. Phone look-ups are audited (last 4 digits only) and
-- results never contain a full number.
create or replace function admin_search(p_query text)
returns table (user_id uuid, profile_id uuid, code text, name text, phone_masked text, role app_role,
               profile_status profile_status, city text, deactivated_at timestamptz, deleted_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare q text := lower(btrim(coalesce(p_query, ''))); digits text := regexp_replace(coalesce(p_query, ''), '\D', '', 'g');
        by_code boolean; by_phone boolean;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(q) < 2 then return; end if;
  by_code := q ~ '^hr-?\d+$';
  by_phone := not by_code and q ~ '^[+\d\s-]+$' and char_length(digits) >= 4;
  if by_phone then
    insert into audit_events (actor_id, action, meta) values (auth.uid(), 'admin.search_phone', jsonb_build_object('lastDigits', right(digits, 4)));
  end if;
  return query
    select u.id, p.id, p.code, p.biodata #>> '{basic,fullName}',
           u.country_code || ' ' || repeat('•', greatest(char_length(u.phone) - 4, 0)) || right(u.phone, 4),
           u.role, p.status, p.city, u.deactivated_at, u.deleted_at
    from app_users u
    left join profiles p on p.user_id = u.id
    where case
      when by_code then lower(p.code) like 'hr-' || digits || '%'
      when by_phone then regexp_replace(u.country_code || u.phone, '\D', '', 'g') like '%' || digits || '%'
      else lower(concat_ws(' ', p.biodata #>> '{basic,fullName}', p.city, p.biodata #>> '{location,locality}', p.code)) like '%' || q || '%'
    end
    order by p.code nulls last
    limit 50;
end $$;
revoke all on function admin_search(text) from public, anon;
grant execute on function admin_search(text) to authenticated;

-- ───────── admin bell ─────────
create or replace function alert_admins(p_kind text, p_params jsonb, p_link text) returns void
language sql volatile security definer set search_path = public as $$
  insert into notifications (user_id, type, params, deep_link)
  select id, 'admin_alert', jsonb_build_object('kind', p_kind) || coalesce(p_params, '{}'), p_link
  from app_users where role in ('admin', 'master') and deactivated_at is null and deleted_at is null;
$$;
revoke all on function alert_admins(text, jsonb, text) from public, anon, authenticated;

create or replace function trg_alert_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform alert_admins('report', jsonb_build_object('code', (select code from profiles where id = new.profile_id), 'reason', new.reason), '/admin/reports');
  return new;
end $$;
drop trigger if exists reports_alert on reports;
create trigger reports_alert after insert on reports for each row execute function trg_alert_report();

create or replace function trg_alert_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('paid', 'failed') and old.status is distinct from new.status then
    perform alert_admins('payment', jsonb_build_object('code', (select code from profiles where id = new.profile_id),
      'status', new.status, 'amount', new.amount::text, 'item', new.kind), '/admin/orders');
  end if;
  return new;
end $$;
drop trigger if exists orders_alert on orders;
create trigger orders_alert after update of status on orders for each row execute function trg_alert_payment();

create or replace function trg_alert_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' and old.status is distinct from 'pending' and new.deleted_at is null then
    perform alert_admins('pending_profile', jsonb_build_object('code', new.code), '/admin/member/' || new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists profiles_pending_alert on profiles;
create trigger profiles_pending_alert after update of status on profiles for each row execute function trg_alert_pending();

-- A member deleting their own account (hard delete). Purging something already in Trash does not alert.
create or replace function trg_alert_account_deleted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is null and old.role = 'user' then
    perform alert_admins('account_deleted', jsonb_build_object('code', coalesce((select code from profiles where user_id = old.id), '—')), '/admin/audit');
  end if;
  return old;
end $$;
drop trigger if exists app_users_deleted_alert on app_users;
create trigger app_users_deleted_alert before delete on app_users for each row execute function trg_alert_account_deleted();

-- Security changes to the admin team / master role.
create or replace function trg_alert_security() returns trigger
language plpgsql security definer set search_path = public as $$
declare ev text := case new.action
  when 'admin.added' then 'admin_added' when 'admin.removed' then 'admin_removed'
  when 'master.transferred' then 'master_transferred' when 'master.recovered' then 'master_recovered'
  when 'master.recovery_started' then 'recovery_started' when 'master.recovery_cancelled' then 'recovery_cancelled' end;
begin
  if ev is not null then perform alert_admins('security', jsonb_build_object('event', ev), '/admin/team'); end if;
  return new;
end $$;
drop trigger if exists audit_security_alert on audit_events;
create trigger audit_security_alert after insert on audit_events for each row execute function trg_alert_security();
