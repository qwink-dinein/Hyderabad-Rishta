-- Boost visibility, Featured profiles and fair exposure (owner Mini PRD 2026-10-31).
-- The new admin settings live in pricing_config.config (the same document the admin saves):
--   boostEnabled (bool)        master switch — off: no NEW boost can start; running boosts keep their terms
--   boostRequirePhoto (bool)   eligibility — a profile needs at least one photo to be boosted
--   featuredEnabled (bool)     Featured section on Home / Discover
--   featuredMaxCards (1–30)    cards in the Featured section
--   featuredCapDaysPer7 (1–7)  a boosted profile is featured to the same member on at most N days in any 7
--   boostPlans[].promoLabel    optional promotional label per option (≤ 24 characters)
-- Missing keys mean the defaults (true, false, true, 12, 3), so older saved configs keep working.

create or replace function pricing_boost_rules_ok(c jsonb) returns boolean
language sql immutable set search_path = public as $$
  select
    coalesce(jsonb_typeof(c -> 'boostEnabled'), 'boolean') = 'boolean'
    and coalesce(jsonb_typeof(c -> 'boostRequirePhoto'), 'boolean') = 'boolean'
    and coalesce(jsonb_typeof(c -> 'featuredEnabled'), 'boolean') = 'boolean'
    and case when c -> 'featuredMaxCards' is null then true
             when coalesce(c ->> 'featuredMaxCards', '') ~ '^[0-9]{1,2}$' then (c ->> 'featuredMaxCards')::int between 1 and 30
             else false end
    and case when c -> 'featuredCapDaysPer7' is null then true
             when coalesce(c ->> 'featuredCapDaysPer7', '') ~ '^[0-9]$' then (c ->> 'featuredCapDaysPer7')::int between 1 and 7
             else false end
    and not exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(c -> 'boostPlans') = 'array' then c -> 'boostPlans' else '[]'::jsonb end) p
      where p ? 'promoLabel' and jsonb_typeof(p -> 'promoLabel') <> 'null'
        and (jsonb_typeof(p -> 'promoLabel') <> 'string' or char_length(p ->> 'promoLabel') > 24 or p ->> 'promoLabel' ~ '[<>[:cntrl:]]'));
$$;
alter table pricing_config drop constraint if exists pricing_boost_rules_ok;
alter table pricing_config add constraint pricing_boost_rules_ok check (pricing_boost_rules_ok(config));

-- The price and length of option `p_plan` for this profile, from the live config. Every NEW boost order
-- goes through here (start_boost and the order-insert trigger), so the switch and eligibility rules hold
-- whoever inserts the order. Orders already placed are never re-checked: they keep their terms.
create or replace function boost_plan_terms(p_profile uuid, p_plan text, out days int, out amount int, out mode text)
language plpgsql stable security definer set search_path = public as $$
declare ptype text; photos jsonb; plan jsonb; cfg jsonb;
begin
  select profile_type, biodata -> 'photos' into ptype, photos from profiles where id = p_profile and deleted_at is null;
  if ptype is null then raise exception 'not_found'; end if;
  select config into cfg from pricing_config limit 1;
  if coalesce((cfg ->> 'boostEnabled')::boolean, true) = false then raise exception 'fee_disabled'; end if;
  select p into plan from jsonb_array_elements(cfg -> 'boostPlans') p
   where p ->> 'id' = p_plan and (p ->> 'enabled')::boolean limit 1;
  if plan is null or plan #>> array['fee', ptype, 'mode'] = 'disabled' then raise exception 'fee_disabled'; end if;
  if coalesce((cfg ->> 'boostRequirePhoto')::boolean, false)
     and coalesce(jsonb_array_length(case when jsonb_typeof(photos) = 'array' then photos end), 0) = 0 then
    raise exception 'photo_required' using errcode = '22023';
  end if;
  days := (plan ->> 'days')::int;
  mode := plan #>> array['fee', ptype, 'mode'];
  amount := case when mode = 'paid' then (plan #>> array['fee', ptype, 'amount'])::int else 0 end;
end $$;
revoke all on function boost_plan_terms(uuid, text) from public, anon, authenticated;
grant execute on function boost_plan_terms(uuid, text) to service_role;

-- Featured with fair exposure (mirrors src/domain/featured.ts#pickFeatured):
--  * only active boosts the caller may see (is_featurable, no blocks, the side they are looking for);
--  * p_only limits it to the profiles matching the caller's Discover filters (computed by discover-feed
--    from search_profiles, i.e. the caller's own privacy projection) — it can narrow, never widen;
--  * frequency cap: a profile already featured to this caller today stays for the day; otherwise it is
--    skipped once featured on featuredCapDaysPer7 of the last 7 days;
--  * a stable per-caller daily rotation; at most featuredMaxCards; nothing when Featured is switched off.
drop function if exists get_featured(int);
create or replace function get_featured(p_limit int default 12, p_only uuid[] default null)
returns setof jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  looking text;
  today date := (now() at time zone 'utc')::date;
  cfg jsonb;
  cap int;
  n int;
  r profiles;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if coalesce(array_length(p_only, 1), 0) > 2000 then raise exception 'validation' using errcode = '22023'; end if;
  select config into cfg from pricing_config limit 1;
  if coalesce((cfg ->> 'featuredEnabled')::boolean, true) = false then return; end if;
  cap := least(greatest(coalesce((cfg ->> 'featuredCapDaysPer7')::int, 3), 1), 7);
  n := least(greatest(coalesce(p_limit, 12), 1), least(greatest(coalesce((cfg ->> 'featuredMaxCards')::int, 12), 1), 30));
  select biodata #>> '{basic,lookingFor}' into looking from profiles where user_id = me and deleted_at is null;
  for r in
    select p.* from profiles p
    where p.user_id <> me and is_featurable(p) and not is_blocked_between(me, p)
      and (looking is null or p.profile_type = looking)
      and (p_only is null or p.id = any (p_only))
      and (exists (select 1 from boost_impressions i where i.profile_id = p.id and i.viewer_user_id = me and i.day = today)
           or (select count(*) from boost_impressions i
                where i.profile_id = p.id and i.viewer_user_id = me and i.day > today - 7 and i.day <= today) < cap)
    order by md5(me::text || ':' || today::text || ':' || p.id::text)
    limit n
  loop
    insert into boost_impressions (profile_id, viewer_user_id, day) values (r.id, me, today) on conflict do nothing;
    return next project_profile(r, me, false) || jsonb_build_object('code', r.code)
                || coalesce(jsonb_build_object('relation', relation_with(me, r)), '{}'::jsonb);
  end loop;
end $$;
revoke all on function get_featured(int, uuid[]) from public, anon;
grant execute on function get_featured(int, uuid[]) to authenticated;
