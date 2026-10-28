-- Feature: Express Interest, consent-based phone sharing (offers) & Poke.
-- Mirrors src/services/demo/demoBackend.ts and __tests__/interest.test.ts.
--
-- Rules enforced here (not just in the UI):
--   * a number is revealed ONLY by an offer its owner made and the viewer accepted, on an accepted request
--   * accepting an interest reveals only an offer made WITH that interest and still 'offered' (row-locked)
--   * withdrawn / expired offers can never be accepted; blocking closes everything between the pair
--   * pokes: sender only, pending & unexpired, after N hours, one per request, ≤ M per recipient per 7 days, opt-out
--   * idempotency keys make double taps / retries safe; analytics never store numbers or message text

-- ───────── config ─────────
alter table pricing_config add column if not exists request_expiry_days int not null default 14 check (request_expiry_days between 1 and 90);
alter table pricing_config add column if not exists poke_wait_hours int not null default 48 check (poke_wait_hours between 1 and 336);
alter table pricing_config add column if not exists poke_max_per_7_days int not null default 2 check (poke_max_per_7_days between 0 and 7);

-- ───────── requests ─────────
alter table contact_requests add column if not exists expires_at timestamptz not null default now() + interval '14 days';
alter table contact_requests add column if not exists pokes timestamptz[] not null default '{}';
alter table contact_requests add column if not exists idempotency_key text;
create unique index if not exists contact_requests_idem on contact_requests (from_user_id, idempotency_key) where idempotency_key is not null;
drop index if exists one_open_request_per_pair;
create unique index one_open_request_per_pair on contact_requests (least(from_profile_id, to_profile_id), greatest(from_profile_id, to_profile_id))
  where status in ('pending', 'accepted', 'blocked');

-- ───────── phone offers ─────────
create table if not exists phone_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references contact_requests (id) on delete cascade,
  from_user_id uuid not null references app_users (id) on delete cascade,
  to_user_id uuid not null references app_users (id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'withdrawn', 'expired')),
  with_interest boolean not null default false,
  consent_text text not null,
  consent_at timestamptz not null default now(),
  idempotency_key text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index if not exists phone_offers_one_live on phone_offers (request_id, from_user_id) where status in ('offered', 'accepted');
create unique index if not exists phone_offers_idem on phone_offers (from_user_id, idempotency_key) where idempotency_key is not null;
alter table phone_offers enable row level security;
create policy phone_offers_parties_read on phone_offers for select using (auth.uid() in (from_user_id, to_user_id));

create table if not exists analytics_events (
  id text primary key,                 -- deterministic id → retries can't double count
  name text not null,
  user_id uuid,
  props jsonb not null default '{}',   -- never phone numbers or free text
  at timestamptz not null default now()
);
alter table analytics_events enable row level security;
create policy analytics_admin_read on analytics_events for select using (is_admin());

create or replace function track(p_id text, p_name text, p_user uuid, p_props jsonb default '{}') returns void
language sql volatile security definer set search_path = public as $$
  insert into analytics_events (id, name, user_id, props) values (p_id, p_name, p_user, p_props) on conflict (id) do nothing;
$$;
revoke all on function track(text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function display_name_of(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select project_profile(p, p.user_id, false) ->> 'displayName' from profiles p where p.user_id = p_user and p.deleted_at is null;
$$;

-- Phone scope now comes ONLY from accepted offers on accepted requests.
create or replace function consent_scopes(grantor uuid, grantee uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when grantor = grantee then '{"photos":true,"phone":true,"fullBiodata":true}'::jsonb else
    jsonb_build_object(
      'photos', coalesce((select bool_or(c.photos) from consents c join contact_requests r on r.id = c.request_id and r.status = 'accepted'
                          where c.grantor_user_id = grantor and c.grantee_user_id = grantee), false),
      'phone', exists (select 1 from phone_offers o join contact_requests r on r.id = o.request_id and r.status = 'accepted'
                       where o.from_user_id = grantor and o.to_user_id = grantee and o.status = 'accepted'),
      'fullBiodata', coalesce((select bool_or(c.full_biodata) from consents c join contact_requests r on r.id = c.request_id and r.status = 'accepted'
                               where c.grantor_user_id = grantor and c.grantee_user_id = grantee), false))
  end;
$$;

drop function if exists send_request(uuid, text);
create or replace function send_request(p_to uuid, p_message text default null, p_offer_phone boolean default false,
  p_consent boolean default false, p_idem text default null)
returns contact_requests language plpgsql volatile security definer set search_path = public as $$
declare mine profiles; target profiles; r contact_requests; cfg pricing_config; msg text;
begin
  if p_idem is not null then
    select * into r from contact_requests where from_user_id = auth.uid() and idempotency_key = p_idem;
    if r.id is not null then return r; end if;
  end if;
  select * into mine from profiles where user_id = auth.uid() and deleted_at is null;
  if mine.id is null or mine.status <> 'published' then raise exception 'invalid_state'; end if;
  select * into target from profiles where id = p_to and status = 'published' and deleted_at is null;
  if target.id is null or is_blocked_between(auth.uid(), target) then raise exception 'not_found'; end if;
  if coalesce((target.biodata #>> '{privacy,acceptContactRequests}')::boolean, true) = false then raise exception 'not_accepting'; end if;
  if p_offer_phone and not p_consent then raise exception 'consent_required'; end if;
  msg := nullif(trim(regexp_replace(regexp_replace(coalesce(p_message, ''), '<[^>]*>', '', 'g'), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  if char_length(msg) > 800 then raise exception 'validation'; end if;
  if exists (select 1 from contact_requests where from_user_id = auth.uid() and to_profile_id = target.id and status = 'declined'
             and coalesce(responded_at, created_at) > now() - interval '30 days') then raise exception 'declined_recently'; end if;
  if (select count(*) from contact_requests where from_user_id = auth.uid() and created_at > now() - interval '1 day') >= 20 then raise exception 'rate_limited'; end if;
  select * into cfg from pricing_config where id;
  begin
    insert into contact_requests (from_user_id, from_profile_id, to_user_id, to_profile_id, message, expires_at, idempotency_key)
    values (auth.uid(), mine.id, target.user_id, target.id, msg, now() + make_interval(days => cfg.request_expiry_days), p_idem)
    returning * into r;
  exception when unique_violation then raise exception 'duplicate';
  end;
  if p_offer_phone then
    insert into phone_offers (request_id, from_user_id, to_user_id, with_interest, consent_text)
    values (r.id, auth.uid(), target.user_id, true, 'I agree to share my phone number with this person if they accept my offer.');
    insert into audit_events (actor_id, action, target, meta) values (auth.uid(), 'phone.offered', r.id::text, '{"withInterest":true}');
  end if;
  insert into notifications (user_id, type, params, deep_link)
  values (target.user_id, 'request_received', jsonb_build_object('name', display_name_of(auth.uid()), 'offered', case when p_offer_phone then '1' else '' end), '/requests');
  perform track('interest:' || r.id, 'interest_initiated', auth.uid(), jsonb_build_object('offerPhone', p_offer_phone, 'withMessage', msg is not null));
  return r;
end $$;

-- Row locks make accept/decline/withdraw races deterministic: whoever commits first wins.
create or replace function respond_request(p_id uuid, p_decision request_status)
returns contact_requests language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests; o phone_offers;
begin
  if p_decision not in ('accepted', 'declined') then raise exception 'validation'; end if;
  select * into r from contact_requests where id = p_id and to_user_id = auth.uid() for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status = 'expired' or (r.status = 'pending' and r.expires_at <= now()) then raise exception 'expired'; end if;
  if r.status <> 'pending' then raise exception 'invalid_state'; end if;
  update contact_requests set status = p_decision, responded_at = now() where id = p_id returning * into r;
  select * into o from phone_offers where request_id = r.id and from_user_id = r.from_user_id and with_interest and status = 'offered' for update;
  if o.id is not null then
    update phone_offers set status = case when p_decision = 'accepted' then 'accepted' else 'expired' end, responded_at = now() where id = o.id;
    if p_decision = 'accepted' then
      insert into audit_events (actor_id, action, target) values (auth.uid(), 'phone.revealed', r.id::text);
      perform track('reveal:' || o.id, 'number_revealed', auth.uid(), '{"withInterest":true}');
    end if;
  end if;
  insert into notifications (user_id, type, params, deep_link)
  values (r.from_user_id, case when p_decision = 'accepted' then 'request_accepted' else 'request_declined' end, jsonb_build_object('name', display_name_of(auth.uid())), '/requests');
  perform track(p_decision::text || ':' || r.id, case when p_decision = 'accepted' then 'request_accepted' else 'request_declined' end, auth.uid(), '{}');
  return r;
end $$;

create or replace function withdraw_request(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  update contact_requests set status = 'withdrawn' where id = p_id and from_user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'invalid_state'; end if;
  update phone_offers set status = 'withdrawn', responded_at = now() where request_id = p_id and status = 'offered';
end $$;

create or replace function offer_phone(p_request uuid, p_consent boolean, p_idem text default null) returns phone_offers
language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests; o phone_offers; other uuid;
begin
  if p_idem is not null then
    select * into o from phone_offers where from_user_id = auth.uid() and idempotency_key = p_idem;
    if o.id is not null then return o; end if;
  end if;
  select * into r from contact_requests where id = p_request and auth.uid() in (from_user_id, to_user_id) for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status <> 'accepted' then raise exception 'invalid_state'; end if;
  if not p_consent then raise exception 'consent_required'; end if;
  other := case when r.from_user_id = auth.uid() then r.to_user_id else r.from_user_id end;
  begin
    insert into phone_offers (request_id, from_user_id, to_user_id, consent_text, idempotency_key)
    values (r.id, auth.uid(), other, 'I agree to share my phone number with this person if they accept my offer.', p_idem) returning * into o;
  exception when unique_violation then raise exception 'duplicate';
  end;
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'phone.offered', r.id::text);
  insert into notifications (user_id, type, params, deep_link) values (other, 'phone_offer_received', jsonb_build_object('name', display_name_of(auth.uid())), '/requests');
  perform track('offer:' || o.id, 'reciprocal_offer_sent', auth.uid(), '{}');
  return o;
end $$;

create or replace function respond_phone_offer(p_offer uuid, p_decision text) returns phone_offers
language plpgsql volatile security definer set search_path = public as $$
declare o phone_offers;
begin
  if p_decision not in ('accepted', 'declined') then raise exception 'validation'; end if;
  select * into o from phone_offers where id = p_offer and to_user_id = auth.uid() for update;
  if o.id is null then raise exception 'not_found'; end if;
  if o.status <> 'offered' or not exists (select 1 from contact_requests where id = o.request_id and status = 'accepted') then raise exception 'invalid_state'; end if;
  update phone_offers set status = p_decision, responded_at = now() where id = o.id returning * into o;
  if p_decision = 'accepted' then
    insert into audit_events (actor_id, action, target) values (auth.uid(), 'phone.revealed', o.request_id::text);
    perform track('reveal:' || o.id, 'number_revealed', auth.uid(), '{"withInterest":false}');
  end if;
  insert into notifications (user_id, type, params, deep_link)
  values (o.from_user_id, case when p_decision = 'accepted' then 'phone_offer_accepted' else 'phone_offer_declined' end, jsonb_build_object('name', display_name_of(auth.uid())), '/requests');
  return o;
end $$;

create or replace function withdraw_phone_offer(p_offer uuid) returns phone_offers
language plpgsql volatile security definer set search_path = public as $$
declare o phone_offers;
begin
  select * into o from phone_offers where id = p_offer and from_user_id = auth.uid() for update;
  if o.id is null then raise exception 'not_found'; end if;
  if o.status <> 'offered' then raise exception 'invalid_state'; end if;
  update phone_offers set status = 'withdrawn', responded_at = now() where id = o.id returning * into o;
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'phone.offer_withdrawn', o.request_id::text);
  insert into notifications (user_id, type, params, deep_link) values (o.to_user_id, 'phone_offer_withdrawn', jsonb_build_object('name', display_name_of(auth.uid())), '/requests');
  return o;
end $$;

create or replace function poke_request(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests; cfg pricing_config; target profiles; recent int;
begin
  select * into r from contact_requests where id = p_id for update;
  if r.id is null or r.from_user_id <> auth.uid() then raise exception 'not_found'; end if;
  if r.status <> 'pending' or r.expires_at <= now() then raise exception 'invalid_state'; end if;
  select * into target from profiles where id = r.to_profile_id and deleted_at is null;
  if target.id is null or is_blocked_between(auth.uid(), target) then raise exception 'invalid_state'; end if;
  if coalesce((target.biodata #>> '{privacy,allowReminders}')::boolean, true) = false then raise exception 'poke_optout'; end if;
  if cardinality(r.pokes) >= 1 then raise exception 'poke_used'; end if;
  select * into cfg from pricing_config where id;
  if r.created_at > now() - make_interval(hours => cfg.poke_wait_hours) then raise exception 'poke_wait'; end if;
  select count(*) into recent from contact_requests x, unnest(x.pokes) t
    where x.from_user_id = r.from_user_id and x.to_user_id = r.to_user_id and t > now() - interval '7 days';
  if recent >= cfg.poke_max_per_7_days then raise exception 'poke_limit'; end if;
  update contact_requests set pokes = pokes || now() where id = r.id;          -- status unchanged
  insert into notifications (user_id, type, deep_link) values (r.to_user_id, 'poke', '/requests');   -- anonymous, no params
  perform track('poke:' || r.id, 'poke_sent', auth.uid(), '{}');
end $$;

-- set_consent: photos / full biodata only (phone is offers-only now)
create or replace function set_consent(p_request uuid, p_photos boolean, p_phone boolean, p_full boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests; grantee uuid; grantor_profile uuid;
begin
  select * into r from contact_requests where id = p_request and auth.uid() in (from_user_id, to_user_id);
  if r.id is null then raise exception 'not_found'; end if;
  if r.status <> 'accepted' then raise exception 'invalid_state'; end if;
  grantee := case when r.to_user_id = auth.uid() then r.from_user_id else r.to_user_id end;
  grantor_profile := case when r.to_user_id = auth.uid() then r.to_profile_id else r.from_profile_id end;
  insert into consents (request_id, grantor_user_id, grantor_profile_id, grantee_user_id, photos, phone, full_biodata)
  values (r.id, auth.uid(), grantor_profile, grantee, p_photos, false, p_full)
  on conflict (request_id, grantor_user_id) do update set photos = excluded.photos, phone = false, full_biodata = excluded.full_biodata, updated_at = now();
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'consent.updated', r.id::text);
end $$;

-- Blocking closes every pending/accepted request between the pair and withdraws open offers.
create or replace function on_block() returns trigger
language plpgsql security definer set search_path = public as $$
declare mine uuid; theirs_user uuid;
begin
  select id into mine from profiles where user_id = new.user_id and deleted_at is null;
  select user_id into theirs_user from profiles where id = new.blocked_profile_id;
  update contact_requests set status = 'blocked'
  where status in ('pending', 'accepted')
    and ((from_profile_id = mine and to_profile_id = new.blocked_profile_id) or (to_profile_id = mine and from_profile_id = new.blocked_profile_id));
  update phone_offers set status = 'withdrawn', responded_at = now()
  where status = 'offered' and request_id in (select id from contact_requests where status = 'blocked'
    and ((from_user_id = new.user_id and to_user_id = theirs_user) or (from_user_id = theirs_user and to_user_id = new.user_id)));
  perform track('block:' || new.user_id || ':' || new.blocked_profile_id, 'user_blocked', new.user_id, '{}');
  return new;
end $$;
drop trigger if exists blocks_close_requests on blocks;
create trigger blocks_close_requests after insert on blocks for each row execute function on_block();

-- Expiry job (pg_cron every 5 min, alongside run_governance_jobs).
create or replace function run_connection_jobs() returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  with ex as (
    update contact_requests set status = 'expired' where status = 'pending' and expires_at <= now() returning id, from_user_id
  ), off as (
    update phone_offers set status = 'expired' where status = 'offered' and request_id in (select id from ex) returning 1
  ), notes as (
    insert into notifications (user_id, type, deep_link) select from_user_id, 'request_expired', '/requests' from ex returning 1
  ), ev as (
    insert into analytics_events (id, name, user_id) select 'expired:' || id, 'request_expired', from_user_id from ex on conflict do nothing returning 1
  )
  select count(*) into n from ex;
  return n;
end $$;
revoke all on function run_connection_jobs() from public, anon, authenticated;

grant execute on function send_request(uuid, text, boolean, boolean, text) to authenticated;
grant execute on function withdraw_request(uuid) to authenticated;
grant execute on function offer_phone(uuid, boolean, text) to authenticated;
grant execute on function respond_phone_offer(uuid, text) to authenticated;
grant execute on function withdraw_phone_offer(uuid) to authenticated;
grant execute on function poke_request(uuid) to authenticated;
