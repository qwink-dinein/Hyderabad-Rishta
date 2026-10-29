-- Member-side API for the Supabase adapter (Phase 2, 2026-10-29).
-- Owners may only edit biodata/last_step directly; every status change goes through these functions,
-- which mirror src/services/demo/demoBackend.ts (the tested specification).

-- The caller's active account (raises like the demo's me()).
create or replace function me_active() returns app_users
language plpgsql stable security definer set search_path = public as $$
declare u app_users;
begin
  select * into u from app_users where id = auth.uid();
  if u.id is null or u.deleted_at is not null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if u.deactivated_at is not null then raise exception 'forbidden: account deactivated' using errcode = '42501'; end if;
  return u;
end $$;
revoke all on function me_active() from public, anon, authenticated;

create or replace function my_profile_row(p_user uuid) returns profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where user_id = p_user and deleted_at is null limit 1;
$$;
revoke all on function my_profile_row(uuid) from public, anon, authenticated;

-- Server copy of src/domain/validation.ts#firstInvalidStep for the fields that decide publishability.
create or replace function biodata_complete(b jsonb) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare
  dob date := iso_date(b #>> '{basic,dob}');
  age int;
  min_age int := case when b #>> '{basic,lookingFor}' = 'groom' then 18 else 21 end;
  h numeric;
  nz text[];
begin
  if coalesce(b #>> '{basic,lookingFor}', '') not in ('bride', 'groom') then return false; end if;
  foreach nz slice 1 in array array[
    array['basic','createdFor'], array['basic','fullName'], array['basic','maritalStatus'], array['basic','motherTongue'],
    array['location','country'], array['location','state'], array['location','city'],
    array['career','education'], array['career','profession']] loop
    if coalesce(trim(b #>> nz), '') = '' then return false; end if;
  end loop;
  if length(trim(b #>> '{basic,fullName}')) < 2 or length(b #>> '{basic,fullName}') > 80 then return false; end if;
  if dob is null then return false; end if;
  age := date_part('year', age(dob))::int;
  if age < min_age or age > 80 then return false; end if;
  if jsonb_typeof(b #> '{basic,heightCm}') <> 'number' then return false; end if;
  h := (b #>> '{basic,heightCm}')::numeric;
  if h < 120 or h > 230 then return false; end if;
  if b #>> '{basic,maritalStatus}' <> 'never_married' and jsonb_typeof(b #> '{basic,children}') <> 'number' then return false; end if;
  if b #>> '{career,education}' = 'other' and coalesce(trim(b #>> '{career,educationOther}'), '') = '' then return false; end if;
  if b #>> '{career,profession}' = 'other' and coalesce(trim(b #>> '{career,professionOther}'), '') = '' then return false; end if;
  if jsonb_typeof(b -> 'privacy') <> 'object' then return false; end if;
  return true;
end $$;

-- Live (or pending approval) — the demo's goLive().
create or replace function go_live(p profiles) returns profiles
language plpgsql volatile security definer set search_path = public as $$
declare cfg pricing_config;
begin
  select * into cfg from pricing_config limit 1;
  if cfg.require_approval then
    update profiles set status = 'pending', updated_at = now() where id = p.id returning * into p;
  else
    update profiles set status = 'published', published_at = coalesce(published_at, now()), updated_at = now() where id = p.id returning * into p;
    insert into notifications (user_id, type, deep_link) values (p.user_id, 'profile_published', '/dashboard');
  end if;
  return p;
end $$;
revoke all on function go_live(profiles) from public, anon, authenticated;

create or replace function submit_for_publication() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  u app_users := me_active();
  p profiles := my_profile_row(u.id);
  cfg pricing_config;
  fee jsonb;
  has_paid boolean;
  o orders;
begin
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not biodata_complete(p.biodata) then raise exception 'incomplete_biodata'; end if;
  if p.status in ('published', 'pending') then return jsonb_build_object('profile', to_jsonb(p)); end if;
  select * into cfg from pricing_config limit 1;
  fee := cfg.config #> array['publication', p.profile_type];
  if coalesce(fee ->> 'mode', 'free') = 'disabled' then raise exception 'fee_disabled'; end if;
  has_paid := exists (select 1 from orders where profile_id = p.id and kind = 'publication' and status in ('paid', 'free'));
  if fee ->> 'mode' = 'paid' and not has_paid then
    select * into o from orders where profile_id = p.id and kind = 'publication' and status = 'pending' order by created_at desc limit 1;
    if o.id is null then
      insert into orders (user_id, profile_id, kind, amount, currency, status, terms, simulated)
      values (u.id, p.id, 'publication', (fee ->> 'amount')::int, cfg.currency, 'pending',
              jsonb_build_object('pricingVersion', cfg.version, 'autoRenew', false), false)
      returning * into o;
    end if;
    return jsonb_build_object('profile', to_jsonb(p), 'order', to_jsonb(o));
  end if;
  if coalesce(fee ->> 'mode', 'free') = 'free' and not has_paid then
    insert into orders (user_id, profile_id, kind, amount, currency, status, terms, simulated)
    values (u.id, p.id, 'publication', 0, cfg.currency, 'free', jsonb_build_object('pricingVersion', cfg.version, 'autoRenew', false), false);
  end if;
  p := go_live(p);
  return jsonb_build_object('profile', to_jsonb(p));
end $$;

create or replace function set_paused(p_paused boolean) returns profiles
language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active(); p profiles := my_profile_row(u.id);
begin
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_paused and p.status <> 'published' then raise exception 'invalid_state'; end if;
  if not p_paused and p.status <> 'paused' then raise exception 'invalid_state'; end if;
  update profiles set status = case when p_paused then 'paused'::profile_status else 'published'::profile_status end, updated_at = now()
  where id = p.id returning * into p;
  return p;
end $$;

-- One boost at a time; price and length always from the live config (never the client).
create or replace function start_boost(p_plan text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  u app_users := me_active();
  p profiles := my_profile_row(u.id);
  cfg pricing_config;
  plan_id text := p_plan;
  t record;
  o orders;
begin
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p.status <> 'published' then raise exception 'invalid_state'; end if;
  if p.boost_until > now() then raise exception 'boost_active' using hint = p.boost_until::text; end if;
  if plan_id is not null and (length(plan_id) > 20) then raise exception 'validation'; end if;
  select * into cfg from pricing_config limit 1;
  if plan_id is null then
    -- Default: the shortest option available for this profile type.
    select x ->> 'id' into plan_id from jsonb_array_elements(cfg.config -> 'boostPlans') x
     where (x ->> 'enabled')::boolean and x #>> array['fee', p.profile_type, 'mode'] <> 'disabled'
     order by (x ->> 'days')::int limit 1;
    if plan_id is null then raise exception 'fee_disabled'; end if;
  end if;
  select * into t from boost_plan_terms(p.id, plan_id);
  -- A boost already waiting for payment is reused; choosing another option replaces it.
  select * into o from orders where profile_id = p.id and kind = 'boost' and status = 'pending' for update;
  if o.id is not null then
    if o.terms ->> 'planId' = plan_id and o.amount = t.amount and t.mode = 'paid' then
      return jsonb_build_object('profile', to_jsonb(p), 'order', to_jsonb(o));
    end if;
    update orders set status = 'cancelled' where id = o.id;
  end if;
  insert into orders (user_id, profile_id, kind, amount, currency, status, terms, simulated)
  values (u.id, p.id, 'boost', t.amount, cfg.currency, case when t.mode = 'paid' then 'pending'::order_status else 'free'::order_status end,
          jsonb_build_object('pricingVersion', cfg.version, 'boostDays', t.days, 'planId', plan_id, 'autoRenew', false), false)
  returning * into o;
  if o.status = 'free' then
    perform apply_boost(o.id);
    select * into p from profiles where id = p.id;
  end if;
  return jsonb_build_object('profile', to_jsonb(p), 'order', to_jsonb(o));
end $$;

-- Inputs for src/domain/metrics.ts#dashboardMetrics. Viewer identities are replaced by per-call numbers,
-- so the owner sees counts and timing but never who viewed them.
create or replace function get_my_activity() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u app_users := me_active(); p profiles := my_profile_row(u.id);
begin
  if p.id is null then return jsonb_build_object('views', '[]'::jsonb, 'shortlistedBy', 0, 'impressions', '[]'::jsonb); end if;
  return jsonb_build_object(
    'views', coalesce((select jsonb_agg(jsonb_build_object('v', dense_rank, 'at', at) order by at)
                       from (select at, dense_rank() over (order by viewer_user_id) from view_events
                             where profile_id = p.id and viewer_user_id <> p.user_id) x), '[]'::jsonb),
    'shortlistedBy', (select count(*) from shortlists where profile_id = p.id and user_id <> p.user_id),
    'impressions', coalesce((select jsonb_agg(jsonb_build_object('v', dense_rank, 'day', day))
                             from (select day, dense_rank() over (order by viewer_user_id) from boost_impressions where profile_id = p.id) x), '[]'::jsonb));
end $$;

-- The Requests screen in one call: each request with the other party's privacy projection, my consent,
-- the latest phone offer each way and whether the recipient accepts reminders. p_profile limits it to
-- the latest request with one profile (the profile screen's "interest sent" state).
create or replace function get_requests(p_profile uuid default null) returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare u app_users := me_active(); mine profiles := my_profile_row(u.id); r contact_requests; other profiles; recipient profiles;
begin
  for r in
    select * from contact_requests c
    where (c.from_user_id = u.id or c.to_user_id = u.id)
      and (p_profile is null or (mine.id is not null and ((c.from_profile_id = mine.id and c.to_profile_id = p_profile) or (c.to_profile_id = mine.id and c.from_profile_id = p_profile))))
    order by c.created_at desc
    limit case when p_profile is null then 500 else 1 end
  loop
    select * into other from profiles where id = case when r.to_user_id = u.id then r.from_profile_id else r.to_profile_id end and deleted_at is null;
    continue when other.id is null;
    select * into recipient from profiles where id = r.to_profile_id;
    return next jsonb_build_object(
      'request', to_jsonb(r) - 'idempotency_key',
      'other', project_profile(other, u.id, true) || jsonb_build_object('code', other.code),
      'direction', case when r.to_user_id = u.id then 'received' else 'sent' end,
      'myConsent', (select jsonb_build_object('photos', coalesce(bool_or(photos), false), 'phone', coalesce(bool_or(phone), false), 'fullBiodata', coalesce(bool_or(full_biodata), false))
                    from consents where request_id = r.id and grantor_user_id = u.id),
      'myOffer', (select to_jsonb(o) - 'idempotency_key' from phone_offers o where o.request_id = r.id and o.from_user_id = u.id order by o.created_at desc limit 1),
      'theirOffer', (select to_jsonb(o) - 'idempotency_key' from phone_offers o where o.request_id = r.id and o.from_user_id <> u.id order by o.created_at desc limit 1),
      'recipientAllowsReminders', coalesce((recipient.biodata #>> '{privacy,allowReminders}')::boolean, true),
      'myPhoneMasked', repeat('•', greatest(length(u.phone) - 4, 0)) || right(u.phone, 4));
  end loop;
end $$;

create or replace function get_shortlist() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select project_profile(p, auth.uid(), false) || jsonb_build_object('code', p.code)
         || coalesce(jsonb_build_object('relation', relation_with(auth.uid(), p)), '{}'::jsonb)
  from shortlists s
  join profiles p on p.id = s.profile_id and p.status = 'published' and p.deleted_at is null
  join app_users o on o.id = p.user_id and o.deactivated_at is null and o.deleted_at is null
  where s.user_id = auth.uid() and not is_blocked_between(auth.uid(), p)
  order by s.created_at desc;
$$;

create or replace function get_blocked_profiles() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('profileId', b.blocked_profile_id, 'code', coalesce(p.code, '—'),
    'name', coalesce(case coalesce(p.biodata #>> '{privacy,displayName}', 'first')
      when 'full' then p.biodata #>> '{basic,fullName}'
      when 'first' then split_part(p.biodata #>> '{basic,fullName}', ' ', 1)
      else (select string_agg(upper(left(w, 1)) || '.', ' ') from regexp_split_to_table(trim(p.biodata #>> '{basic,fullName}'), '\s+') w) end, '—'))
  from blocks b left join profiles p on p.id = b.blocked_profile_id
  where b.user_id = auth.uid()
  order by b.created_at desc;
$$;

create or replace function set_allow_reminders(p_allow boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active(); p profiles := my_profile_row(u.id);
begin
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  update profiles set biodata = jsonb_set(biodata, '{privacy,allowReminders}', to_jsonb(coalesce(p_allow, true)), true), updated_at = now() where id = p.id;
end $$;

-- Self-deactivation (undone by logging in again — the app calls reactivate_self() after OTP/PIN).
create or replace function deactivate_account() returns void
language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active();
begin
  if u.role = 'master' then raise exception 'forbidden: transfer the master role before deactivating' using errcode = '42501'; end if;
  update app_users set deactivated_at = now(), deactivated_by = u.id where id = u.id;
  update profiles set status = 'paused', updated_at = now() where user_id = u.id and status = 'published' and deleted_at is null;
  insert into audit_events (actor_id, action, target) values (u.id, 'account.deactivated', u.id::text);
end $$;

create or replace function reactivate_self() returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare u app_users;
begin
  select * into u from app_users where id = auth.uid();
  if u.id is null or u.deleted_at is not null then raise exception 'account_removed'; end if;
  if u.deactivated_at is null then return false; end if;
  if u.deactivated_by is distinct from u.id then raise exception 'account_suspended'; end if;
  update app_users set deactivated_at = null, deactivated_by = null where id = u.id;
  insert into audit_events (actor_id, action, target) values (u.id, 'account.reactivated', u.id::text);
  return true;
end $$;

do $$
declare f text;
begin
  foreach f in array array['submit_for_publication()', 'set_paused(boolean)', 'start_boost(text)', 'get_my_activity()', 'get_requests(uuid)',
                           'get_shortlist()', 'get_blocked_profiles()', 'set_allow_reminders(boolean)', 'deactivate_account()', 'reactivate_self()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function biodata_complete(jsonb) from public, anon, authenticated;
