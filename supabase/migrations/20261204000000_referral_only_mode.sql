-- Referral mode is referral ONLY (owner 2026-11-02): "if admin enables refer & boost, these plans should be removed;
-- a free Boost only if they refer and the profile is 100%".
-- 1) While referral_settings.mode = 'referral', no Boost order can be created at all (paid or free plans), so
--    start_boost() — unchanged — is refused by the database itself, whatever app version calls it.
--    Paid mode is untouched: the guard does nothing there.
-- 2) Using an earned free Boost also needs the member's OWN biodata to be 100% complete.
create or replace function orders_referral_mode_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'boost' and exists (select 1 from referral_settings where mode = 'referral') then
    raise exception 'boost_referral_only';
  end if;
  return new;
end $$;
revoke all on function orders_referral_mode_guard() from public, anon, authenticated;
drop trigger if exists orders_referral_mode on orders;
create trigger orders_referral_mode before insert on orders for each row execute function orders_referral_mode_guard();

create or replace function use_referral_boost() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active(); p profiles := my_profile_row(u.id); rw referral_rewards; cfg pricing_config; until_at timestamptz;
begin
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from profiles where id = p.id for update;
  if p.status <> 'published' then raise exception 'invalid_state'; end if;
  if not referral_profile_full(p.biodata) then raise exception 'referral_profile_incomplete'; end if; -- own biodata 100% too
  if p.boost_until > now() then raise exception 'boost_active' using hint = p.boost_until::text; end if;
  select * into cfg from pricing_config limit 1;
  if coalesce((cfg.config ->> 'boostRequirePhoto')::boolean, false)
     and (coalesce(jsonb_typeof(p.biodata -> 'photos'), '') <> 'array' or jsonb_array_length(p.biodata -> 'photos') = 0) then
    raise exception 'photo_required';
  end if;
  select * into rw from referral_rewards where user_id = u.id and status = 'available' order by created_at limit 1 for update;
  if rw.id is null then raise exception 'no_free_boost'; end if;
  until_at := now() + make_interval(days => rw.days);
  update profiles set
    boost_started_at = now(),
    boost_until = until_at,
    boost_notices = case when rw.days <= 1 then jsonb_build_object('ending', to_jsonb(until_at)) else '{}'::jsonb end
  where id = p.id returning * into p;
  update referral_rewards set status = 'used', used_at = now(), boost_until = until_at, profile_id = p.id where id = rw.id;
  insert into audit_events (actor_id, action, target, meta) values (u.id, 'boost.applied', 'referral:' || rw.id, jsonb_build_object('days', rw.days, 'source', 'referral'));
  insert into notifications (user_id, type, params, deep_link) values (u.id, 'boost_started', jsonb_build_object('until', until_at), '/boost');
  perform track('referral_boost_used:' || rw.id, 'referral_boost_used', u.id, jsonb_build_object('days', rw.days));
  return jsonb_build_object('profile', to_jsonb(p), 'reward', jsonb_build_object('id', rw.id, 'days', rw.days, 'boostUntil', until_at));
end $$;
