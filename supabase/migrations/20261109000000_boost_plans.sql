-- Boost options (owner PRD 2026-10-29): 7 / 14 / 30-day boosts, each with its own bride and groom price,
-- all set by the admin. Stored in pricing_config.config.boostPlans:
--   [{id, days, fee:{bride:{mode,amount}, groom:{mode,amount}}, enabled, popular}]
-- The SERVER decides a boost order's price and length from this config (never the client), and the
-- order keeps that snapshot forever (later price changes never touch it). Twin of src/domain/pricing.ts.

-- Initial options (the admin changes them any time).
update pricing_config set config = config || jsonb_build_object('boostPlans', '[
  {"id":"d7","days":7,"fee":{"bride":{"mode":"free","amount":0},"groom":{"mode":"paid","amount":100}},"enabled":true,"popular":true},
  {"id":"d14","days":14,"fee":{"bride":{"mode":"paid","amount":200},"groom":{"mode":"paid","amount":200}},"enabled":true,"popular":false},
  {"id":"d30","days":30,"fee":{"bride":{"mode":"paid","amount":350},"groom":{"mode":"paid","amount":350}},"enabled":true,"popular":false}
]'::jsonb)
where not (config ? 'boostPlans');

-- Shape check for admin saves: 1–6 options, unique ids/durations, 1–90 days, sane fees, ≤1 popular.
create or replace function boost_plans_ok(c jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(c -> 'boostPlans') = 'array'
     and jsonb_array_length(c -> 'boostPlans') between 1 and 6
     and not exists (
       select 1 from jsonb_array_elements(c -> 'boostPlans') p
       where coalesce(p ->> 'id', '') !~ '^[a-z0-9_-]{1,20}$'
          or coalesce(p ->> 'days', '') !~ '^[0-9]{1,2}$' or (p ->> 'days')::int not between 1 and 90
          or jsonb_typeof(p -> 'enabled') <> 'boolean' or jsonb_typeof(p -> 'popular') <> 'boolean'
          or exists (
            select 1 from (values (p #> '{fee,bride}'), (p #> '{fee,groom}')) f(fee)
            where coalesce(f.fee ->> 'mode', '') not in ('free', 'paid', 'disabled')
               or coalesce(f.fee ->> 'amount', '') !~ '^[0-9]{1,6}$'
               or (f.fee ->> 'mode' = 'paid' and (f.fee ->> 'amount')::int <= 0)
               or (f.fee ->> 'amount')::int > 100000))
     and (select count(distinct p ->> 'id') = count(*) and count(distinct p ->> 'days') = count(*)
            and count(*) filter (where (p ->> 'popular')::boolean) <= 1
          from jsonb_array_elements(c -> 'boostPlans') p);
$$;
alter table pricing_config add constraint pricing_boost_plans_ok check (boost_plans_ok(config));

-- The price and length of option `p_plan` for this profile's type, from the live config.
-- Raises 'fee_disabled' when the option doesn't exist, is switched off, or is disabled for the type.
create or replace function boost_plan_terms(p_profile uuid, p_plan text, out days int, out amount int, out mode text)
language plpgsql stable security definer set search_path = public as $$
declare ptype text; plan jsonb;
begin
  select profile_type into ptype from profiles where id = p_profile and deleted_at is null;
  if ptype is null then raise exception 'not_found'; end if;
  select p into plan from pricing_config, jsonb_array_elements(config -> 'boostPlans') p
   where p ->> 'id' = p_plan and (p ->> 'enabled')::boolean limit 1;
  if plan is null or plan #>> array['fee', ptype, 'mode'] = 'disabled' then raise exception 'fee_disabled'; end if;
  days := (plan ->> 'days')::int;
  mode := plan #>> array['fee', ptype, 'mode'];
  amount := case when mode = 'paid' then (plan #>> array['fee', ptype, 'amount'])::int else 0 end;
end $$;
revoke all on function boost_plan_terms(uuid, text) from public, anon, authenticated;
grant execute on function boost_plan_terms(uuid, text) to service_role;

-- Every NEW boost order must match the live option exactly (amount, length, free/paid status) —
-- a forged or stale price can never be inserted, whoever inserts it. Existing orders are untouched.
create or replace function trg_boost_order_terms() returns trigger language plpgsql security definer set search_path = public as $$
declare t record;
begin
  if new.kind <> 'boost' then return new; end if;
  if coalesce(new.terms ->> 'planId', '') = '' then raise exception 'validation' using detail = 'boost order without planId'; end if;
  select * into t from boost_plan_terms(new.profile_id, new.terms ->> 'planId');
  if new.amount <> t.amount or (new.terms ->> 'boostDays')::int is distinct from t.days
     or (t.mode = 'free' and new.status <> 'free') or (t.mode = 'paid' and new.status not in ('pending', 'paid', 'failed'))
     or coalesce((new.terms ->> 'autoRenew')::boolean, false) then
    raise exception 'validation' using detail = 'boost order does not match the configured option';
  end if;
  return new;
end $$;
revoke all on function trg_boost_order_terms() from public, anon, authenticated;
drop trigger if exists orders_boost_terms on orders;
create trigger orders_boost_terms before insert on orders for each row execute function trg_boost_order_terms();

-- Keep the legacy summary columns equal to the default (shortest groom) option on every admin save.
create or replace function trg_pricing_boost_summary() returns trigger language plpgsql as $$
declare d int;
begin
  select min((p ->> 'days')::int) into d from jsonb_array_elements(new.config -> 'boostPlans') p
   where (p ->> 'enabled')::boolean and p #>> '{fee,groom,mode}' <> 'disabled';
  if d is not null then new.boost_days := d; end if;
  return new;
end $$;
drop trigger if exists pricing_boost_summary on pricing_config;
create trigger pricing_boost_summary before insert or update on pricing_config for each row execute function trg_pricing_boost_summary();

-- Profile-tab redesign: view, shortlist and payment notices open the Activity screen (counts + payments).
create or replace function trg_boost_links() returns trigger
language plpgsql as $$
begin
  if new.type like 'boost\_%' and new.deep_link = '/dashboard' then new.deep_link := '/boost'; end if;
  if new.type in ('profile_viewed', 'profile_shortlisted', 'payment') and new.deep_link = '/dashboard' then new.deep_link := '/activity'; end if;
  return new;
end $$;
