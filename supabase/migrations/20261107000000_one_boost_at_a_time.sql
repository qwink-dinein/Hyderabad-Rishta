-- One boost at a time (owner rule 2026-10-28): a member cannot boost again while a boost is running.
--  * No new boost order while the profile's boost is active.
--  * At most ONE unpaid (pending) boost order per profile — repeat taps / two phones reuse it.
--  * apply_boost never stacks on a running boost (it used to extend). A payment that arrives for a
--    second order anyway is refused here, so the payment webhook can refund it instead of applying it.

create unique index if not exists orders_one_open_boost on orders (profile_id) where kind = 'boost' and status = 'pending';

create or replace function trg_boost_order_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'boost' and exists (select 1 from profiles where id = new.profile_id and boost_until > now()) then
    raise exception 'boost_active' using errcode = 'P0001', hint = 'A boost is already running for this profile';
  end if;
  return new;
end $$;
drop trigger if exists orders_boost_guard on orders;
create trigger orders_boost_guard before insert on orders for each row execute function trg_boost_order_guard();

create or replace function apply_boost(p_order uuid) returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare o orders; p profiles; days int; until_at timestamptz;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.kind <> 'boost' or o.status not in ('paid', 'free') then raise exception 'invalid_state'; end if;
  if exists (select 1 from audit_events where action = 'boost.applied' and target = p_order::text) then
    select boost_until into until_at from profiles where id = o.profile_id; return until_at; -- idempotent
  end if;
  select * into p from profiles where id = o.profile_id for update;
  if p.boost_until > now() then
    raise exception 'boost_active' using errcode = 'P0001', hint = 'Refund this order: a boost is already running';
  end if;
  days := coalesce((o.terms ->> 'boostDays')::int, (select boost_days from pricing_config limit 1), 7);
  until_at := now() + make_interval(days => days);
  update profiles set
    boost_started_at = now(),
    boost_until = until_at,
    boost_notices = case when days <= 1 then jsonb_build_object('ending', to_jsonb(until_at)) else '{}'::jsonb end
  where id = p.id;
  insert into audit_events (actor_id, action, target, meta) values (o.user_id, 'boost.applied', p_order::text, jsonb_build_object('days', days));
  insert into notifications (user_id, type, params, deep_link)
    values (p.user_id, 'boost_started', jsonb_build_object('until', until_at), '/boost');
  return until_at;
end $$;
revoke all on function apply_boost(uuid) from public, anon, authenticated;
revoke all on function trg_boost_order_guard() from public, anon, authenticated;
