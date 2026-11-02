-- Referral-based free Boosts (owner spec 2026-11-02, designs approved the same day).
--
-- ADDITIVE ONLY. No existing table, column, function, trigger or policy is changed. Paid Boost (start_boost,
-- orders, apply_boost, payments, pricing, the order guards) works exactly as before. A free referral Boost sets
-- the SAME profile fields apply_boost() sets (boost_started_at, boost_until, boost_notices) and sends the same
-- boost_started notice, so Featured placement, rotation, the one-Boost-at-a-time rule and expiry are identical
-- to every other Boost. It writes no order (orders stay purchases); its history lives in referral_rewards.
--
-- Lifecycle (one row in `referrals` per invited account):
--   registered → (100% biodata AND live: published, i.e. approved when approval is on)
--     → review   (team checks it: setting `review`, or anything flagged)  → rewarded | rejected
--     → rewarded (no check needed)
--   rewarded → revoked (team, with a reason)
-- Reward: one free Boost for the referrer and, when `invitee_reward` is on, one for the invited family.
-- Exactly once: unique (referral_id, role) on referral_rewards + row locks; repeated approvals, triggers or
-- retries can never add a second reward.

-- ───────── settings (singleton) ─────────
create table if not exists referral_settings (
  id boolean primary key default true check (id),
  mode text not null default 'paid' check (mode in ('paid', 'referral')),   -- how members are told to get a Boost
  enabled boolean not null default true,                                     -- off = no new rewards, codes still shown
  reward_days int not null default 7 check (reward_days between 1 and 90),
  invitee_reward boolean not null default true,                              -- the invited family gets one too
  review boolean not null default true,                                      -- the team checks each referral first
  updated_at timestamptz not null default now(),
  updated_by uuid references app_users (id) on delete set null
);
insert into referral_settings (id) values (true) on conflict do nothing;

-- ───────── codes ─────────
create table if not exists referral_codes (
  user_id uuid primary key references app_users (id) on delete cascade,
  code text not null unique check (code ~ '^HR[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,6}$'),
  visits int not null default 0,
  created_at timestamptz not null default now()
);

-- Every number that ever had an account (hashed). A number deleted and signed up again is not "new".
create table if not exists referral_phone_ledger (
  phone_hash text primary key,
  first_user_id uuid not null,
  first_seen_at timestamptz not null default now()
);

-- ───────── referrals and rewards ─────────
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid references app_users (id) on delete set null,
  referred_user_id uuid unique references app_users (id) on delete set null,  -- one referral per account, ever
  code text not null,
  status text not null default 'registered' check (status in ('registered', 'review', 'rewarded', 'rejected', 'revoked')),
  flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references app_users (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 500),
  check (referrer_user_id is null or referred_user_id is null or referrer_user_id <> referred_user_id)
);
create index if not exists referrals_referrer_idx on referrals (referrer_user_id, created_at desc);
create index if not exists referrals_status_idx on referrals (status, created_at desc);

create table if not exists referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid references referrals (id) on delete set null,
  user_id uuid not null references app_users (id) on delete cascade,
  role text not null check (role in ('referrer', 'invitee')),
  days int not null check (days between 1 and 90),
  status text not null default 'available' check (status in ('available', 'used', 'revoked')),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  boost_until timestamptz,                -- when the Boost started from this reward ends (used_at = its start)
  profile_id uuid references profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references app_users (id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 500),
  unique (referral_id, role)
);
create index if not exists referral_rewards_user_idx on referral_rewards (user_id, status, created_at);

-- Server-only: members and admins reach these through the functions below.
alter table referral_settings enable row level security;
alter table referral_codes enable row level security;
alter table referral_phone_ledger enable row level security;
alter table referrals enable row level security;
alter table referral_rewards enable row level security;
revoke all on referral_settings, referral_codes, referral_phone_ledger, referrals, referral_rewards from anon, authenticated;

-- ───────── helpers ─────────
create or replace function referral_phone_hash(p_cc text, p_phone text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(digest(regexp_replace(coalesce(p_cc, '') || coalesce(p_phone, ''), '\D', '', 'g'), 'sha256'), 'hex');
$$;

create or replace function referral_new_code() returns text
language plpgsql volatile set search_path = public as $$
declare alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; c text; n int := 4; tries int := 0;
begin
  loop
    c := 'HR';
    for i in 1..n loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from referral_codes where code = c);
    tries := tries + 1;
    if tries > 20 then n := least(n + 1, 6); end if;
  end loop;
  return c;
end $$;

create or replace function referral_code_of(p_user uuid) returns text
language plpgsql volatile security definer set search_path = public as $$
declare c text;
begin
  select code into c from referral_codes where user_id = p_user;
  if c is not null then return c; end if;
  for i in 1..5 loop
    begin
      insert into referral_codes (user_id, code) values (p_user, referral_new_code()) on conflict (user_id) do nothing;
      exit;
    exception when unique_violation then null; -- two calls raced on the same new code: try another
    end;
  end loop;
  select code into c from referral_codes where user_id = p_user;
  return c;
end $$;

-- Server copy of src/domain/completion.ts (100% = every item of the completion bar). Never trust the app's %.
create or replace function referral_profile_full(b jsonb) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare nz text[];
begin
  if not biodata_complete(b) then return false; end if;
  if coalesce(jsonb_typeof(b -> 'photos'), '') <> 'array' or jsonb_array_length(b -> 'photos') < 1 then return false; end if;
  if char_length(trim(coalesce(b #>> '{basic,aboutMe}', ''))) < 20 then return false; end if;
  foreach nz slice 1 in array array[array['religion','maslak'], array['religion','namaz'], array['family','familyType']] loop
    if coalesce(trim(b #>> nz), '') = '' then return false; end if;
  end loop;
  if coalesce(trim(b #>> '{family,fatherOccupation}'), '') = '' and coalesce(trim(b #>> '{family,motherOccupation}'), '') = '' then return false; end if;
  if coalesce(jsonb_typeof(b #> '{preferences,ageMin}'), '') <> 'number' or coalesce(jsonb_typeof(b #> '{preferences,ageMax}'), '') <> 'number' then return false; end if;
  return true;
end $$;

-- Signals that send a referral to the team instead of rewarding it straight away. Never a reason to refuse
-- on its own: families share phones and Wi-Fi.
create or replace function referral_flags(r referrals) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare f text[] := '{}';
begin
  if exists (select 1 from trusted_devices a join trusted_devices b on a.id = b.id
             where a.user_id = r.referrer_user_id and b.user_id = r.referred_user_id) then
    f := f || 'same_device';
  end if;
  if (select count(*) from referrals x where x.referrer_user_id = r.referrer_user_id and x.id <> r.id
        and x.qualified_at > now() - interval '7 days') >= 5 then
    f := f || 'many_recent';
  end if;
  if exists (select 1 from reports rp join profiles p on p.id = rp.profile_id
             where p.user_id = r.referred_user_id and rp.status = 'open') then
    f := f || 'reported';
  end if;
  return f;
end $$;

-- Issue the reward(s) for one referral. Exactly once, whoever calls it and however often.
create or replace function referral_issue(p_ref uuid, p_admin uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare r referrals; s referral_settings;
begin
  select * into r from referrals where id = p_ref for update;
  if r.id is null or r.status not in ('registered', 'review') then return; end if;
  select * into s from referral_settings limit 1;
  update referrals set status = 'rewarded', decided_at = now(), decided_by = p_admin where id = r.id;
  if r.referrer_user_id is not null then
    insert into referral_rewards (referral_id, user_id, role, days) values (r.id, r.referrer_user_id, 'referrer', s.reward_days)
    on conflict (referral_id, role) do nothing;
    insert into notifications (user_id, type, params, deep_link)
    values (r.referrer_user_id, 'referral_reward', jsonb_build_object('days', s.reward_days::text), '/refer');
  end if;
  if s.invitee_reward and r.referred_user_id is not null then
    insert into referral_rewards (referral_id, user_id, role, days) values (r.id, r.referred_user_id, 'invitee', s.reward_days)
    on conflict (referral_id, role) do nothing;
    insert into notifications (user_id, type, params, deep_link)
    values (r.referred_user_id, 'referral_welcome', jsonb_build_object('days', s.reward_days::text), '/refer');
  end if;
  insert into audit_events (actor_id, action, target, meta)
  values (p_admin, 'referral.rewarded', r.id::text, jsonb_build_object('days', s.reward_days, 'invitee', s.invitee_reward));
  perform track('referral_rewarded:' || r.id, 'referral_rewarded', r.referrer_user_id, jsonb_build_object('invitee', s.invitee_reward));
end $$;

-- Looks at one invited account and moves its referral on when it qualifies. Called by triggers (profile saved,
-- published, approved) — the app's word on completion or approval is never used.
create or replace function referral_evaluate(p_user uuid) returns void
language plpgsql volatile security definer set search_path = public as $$
declare r referrals; s referral_settings; p profiles; f text[];
begin
  select * into r from referrals where referred_user_id = p_user and status = 'registered' for update;
  if r.id is null then return; end if;
  select * into s from referral_settings limit 1;
  if not s.enabled then return; end if;
  select * into p from profiles where user_id = p_user and deleted_at is null;
  if p.id is null or p.status <> 'published' or not referral_profile_full(p.biodata) then return; end if;
  f := referral_flags(r);
  update referrals set qualified_at = coalesce(qualified_at, now()), flags = f where id = r.id;
  perform track('referral_qualified:' || r.id, 'referral_qualified', r.referrer_user_id, '{}');
  if s.review or cardinality(f) > 0 then
    update referrals set status = 'review' where id = r.id;
    if r.referrer_user_id is not null then
      insert into notifications (user_id, type, params, deep_link) values (r.referrer_user_id, 'referral_completed', '{}', '/refer');
    end if;
    perform alert_admins('referral_review', jsonb_build_object('code', p.code, 'flagged', (cardinality(f) > 0)::text), '/admin/referrals');
  else
    perform referral_issue(r.id, null);
  end if;
end $$;

-- ───────── triggers (each one isolated: a referral problem can never block a sign-up or a biodata save) ─────────
create or replace function trg_referral_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into referral_phone_ledger (phone_hash, first_user_id) values (referral_phone_hash(new.country_code, new.phone), new.id)
    on conflict (phone_hash) do nothing;
    perform referral_code_of(new.id);
  exception when others then
    raise warning 'referral: new user setup skipped: %', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists app_users_referral on app_users;
create trigger app_users_referral after insert on app_users for each row execute function trg_referral_new_user();

create or replace function trg_referral_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from referrals where referred_user_id = new.user_id and status = 'registered') then
    begin
      perform referral_evaluate(new.user_id);
    exception when others then
      raise warning 'referral: evaluation skipped: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
drop trigger if exists profiles_referral on profiles;
create trigger profiles_referral after insert or update of status, biodata on profiles
  for each row execute function trg_referral_profile();

-- Existing accounts: codes and number history now (owner spec: "every existing registered user").
insert into referral_phone_ledger (phone_hash, first_user_id, first_seen_at)
select distinct on (referral_phone_hash(country_code, phone)) referral_phone_hash(country_code, phone), id, created_at
from app_users order by referral_phone_hash(country_code, phone), created_at
on conflict do nothing;
do $$ declare u uuid; begin
  for u in select id from app_users where deleted_at is null and id not in (select user_id from referral_codes) loop
    perform referral_code_of(u);
  end loop;
end $$;

-- ───────── member functions ─────────
-- Public (also before sign-up): which Boost experience to show.
create or replace function get_referral_settings() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('mode', mode, 'enabled', enabled, 'rewardDays', reward_days, 'inviteeReward', invitee_reward)
  from referral_settings limit 1;
$$;

-- A referral link was opened (counted as a visit only — never a referral). Returns whether the code exists.
create or replace function record_referral_visit(p_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare c text := upper(trim(coalesce(p_code, '')));
begin
  if c !~ '^HR[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,6}$' then return false; end if;
  update referral_codes set visits = visits + 1 where code = c;
  return found;
end $$;

-- Is this a real code? (the sign-up field shows "Valid" before the number is verified). Not a visit.
create or replace function check_referral_code(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from referral_codes where code = upper(trim(coalesce(p_code, ''))));
$$;

-- The new account attaches the code it signed up with. Once, and only for a genuinely new account.
create or replace function claim_referral(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  u app_users := me_active();
  c text := upper(trim(coalesce(p_code, '')));
  owner uuid;
  existing referrals;
  first_user uuid;
  s referral_settings;
  r referrals;
begin
  select * into s from referral_settings limit 1;
  if c !~ '^HR[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,6}$' then raise exception 'referral_invalid'; end if;
  select user_id into owner from referral_codes where code = c;
  if owner is null then raise exception 'referral_invalid'; end if;
  select * into existing from referrals where referred_user_id = u.id;
  if existing.id is not null then
    if existing.code = c then return jsonb_build_object('status', existing.status); end if; -- retry of the same claim
    raise exception 'referral_locked';
  end if;
  if not s.enabled then raise exception 'referral_closed'; end if;
  if owner = u.id then raise exception 'referral_self'; end if;
  if u.role <> 'user' or u.created_by is not null then raise exception 'referral_not_eligible'; end if;
  if u.created_at < now() - interval '3 days' then raise exception 'referral_locked'; end if;
  select first_user_id into first_user from referral_phone_ledger where phone_hash = referral_phone_hash(u.country_code, u.phone);
  if first_user is not null and first_user <> u.id then raise exception 'referral_not_eligible'; end if;
  if exists (select 1 from profiles where user_id = u.id and published_at is not null) then raise exception 'referral_locked'; end if;
  insert into referrals (referrer_user_id, referred_user_id, code) values (owner, u.id, c) returning * into r;
  insert into notifications (user_id, type, params, deep_link) values (owner, 'referral_joined', '{}', '/refer');
  insert into audit_events (actor_id, action, target, meta) values (u.id, 'referral.claimed', r.id::text, jsonb_build_object('code', c));
  perform track('referral_registered:' || r.id, 'referral_registered', owner, '{}');
  perform referral_evaluate(u.id);
  return jsonb_build_object('status', (select status from referrals where id = r.id));
end $$;

-- My code, counts, invited families (initial and stage only) and my free Boosts.
create or replace function get_my_referral() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active(); s referral_settings; c text;
begin
  select * into s from referral_settings limit 1;
  c := referral_code_of(u.id);
  return jsonb_build_object(
    'code', c,
    'mode', s.mode, 'enabled', s.enabled, 'rewardDays', s.reward_days, 'inviteeReward', s.invitee_reward,
    'invited', exists (select 1 from referrals where referred_user_id = u.id),
    'stats', jsonb_build_object(
      'referred', (select count(*) from referrals where referrer_user_id = u.id),
      'approved', (select count(*) from referrals where referrer_user_id = u.id and status = 'rewarded'),
      'earned', (select count(*) from referral_rewards where user_id = u.id and status <> 'revoked'),
      'available', (select count(*) from referral_rewards where user_id = u.id and status = 'available'),
      'used', (select count(*) from referral_rewards where user_id = u.id and status = 'used')),
    'referrals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'initial', upper(left(trim(coalesce(p.biodata #>> '{basic,fullName}', '')), 1)),
        'side', p.profile_type,
        'joinedAt', r.created_at,
        'stage', case
          when r.status = 'rewarded' then 'rewarded'
          when r.status in ('rejected', 'revoked') then 'rejected'
          when r.status = 'review' then 'pending'
          when p.id is null then 'registered'
          when not referral_profile_full(p.biodata) then 'incomplete'
          else 'pending' end) order by r.created_at desc)
      from referrals r left join profiles p on p.user_id = r.referred_user_id and p.deleted_at is null
      where r.referrer_user_id = u.id), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'role', role, 'days', days, 'status', status, 'createdAt', created_at, 'usedAt', used_at, 'boostUntil', boost_until) order by created_at desc)
      from referral_rewards where user_id = u.id), '[]'::jsonb));
end $$;

-- Start one free Boost now: the oldest available reward. Same effect on the profile as apply_boost().
create or replace function use_referral_boost() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare u app_users := me_active(); p profiles := my_profile_row(u.id); rw referral_rewards; cfg pricing_config; until_at timestamptz;
begin
  if p.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into p from profiles where id = p.id for update;
  if p.status <> 'published' then raise exception 'invalid_state'; end if;
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

-- ───────── admin functions ─────────
create or replace function admin_referral_settings_update(p_mode text, p_enabled boolean, p_days int, p_invitee boolean, p_review boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a uuid := admin_require(); before referral_settings; after referral_settings;
begin
  if p_mode not in ('paid', 'referral') or p_days is null or p_days < 1 or p_days > 90 then raise exception 'validation'; end if;
  select * into before from referral_settings limit 1 for update;
  update referral_settings set mode = p_mode, enabled = coalesce(p_enabled, true), reward_days = p_days,
    invitee_reward = coalesce(p_invitee, true), review = coalesce(p_review, true), updated_at = now(), updated_by = a
  returning * into after;
  insert into audit_events (actor_id, action, target, meta) values (a, 'referral.settings', 'referral_settings',
    jsonb_build_object('before', to_jsonb(before) - 'id', 'after', to_jsonb(after) - 'id'));
  return get_referral_settings() || jsonb_build_object('review', after.review);
end $$;

create or replace function admin_referral_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s referral_settings;
begin
  perform admin_require();
  select * into s from referral_settings limit 1;
  return jsonb_build_object(
    'settings', jsonb_build_object('mode', s.mode, 'enabled', s.enabled, 'rewardDays', s.reward_days, 'inviteeReward', s.invitee_reward, 'review', s.review),
    'visits', (select coalesce(sum(visits), 0) from referral_codes),
    'referred', (select count(*) from referrals),
    'inProgress', (select count(*) from referrals where status = 'registered'),
    'toCheck', (select count(*) from referrals where status = 'review'),
    'flagged', (select count(*) from referrals where status = 'review' and cardinality(flags) > 0),
    'approved', (select count(*) from referrals where status = 'rewarded'),
    'rejected', (select count(*) from referrals where status in ('rejected', 'revoked')),
    'rewardsIssued', (select count(*) from referral_rewards),
    'rewardsUsed', (select count(*) from referral_rewards where status = 'used'),
    'rewardsRevoked', (select count(*) from referral_rewards where status = 'revoked'),
    'paidBoosts', (select count(*) from orders where kind = 'boost' and status = 'paid'),
    'freeReferralBoosts', (select count(*) from referral_rewards where status in ('used', 'revoked') and used_at is not null));
end $$;

create or replace function admin_list_referrals(p_filter text default null, p_query text default null) returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
declare q text := nullif(lower(trim(coalesce(p_query, ''))), '');
begin
  perform admin_require();
  if q is not null and char_length(q) > 60 then raise exception 'validation'; end if;
  return query
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'flags', to_jsonb(r.flags),
    'createdAt', r.created_at, 'qualifiedAt', r.qualified_at, 'decidedAt', r.decided_at, 'reason', r.reason,
    'decidedBy', (select coalesce(dp.biodata #>> '{basic,fullName}', 'Admin') from app_users da left join profiles dp on dp.user_id = da.id where da.id = r.decided_by),
    'referrer', jsonb_build_object('userId', r.referrer_user_id, 'name', rp.biodata #>> '{basic,fullName}', 'profileCode', rp.code),
    'referred', jsonb_build_object('userId', r.referred_user_id, 'name', p.biodata #>> '{basic,fullName}', 'profileCode', p.code,
                                   'profileStatus', p.status, 'full', coalesce(referral_profile_full(p.biodata), false)),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'role', w.role, 'status', w.status, 'days', w.days, 'reason', w.reason))
                         from referral_rewards w where w.referral_id = r.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'at', e.at, 'meta', e.meta) order by e.at)
                         from audit_events e where e.target = r.id::text and e.action like 'referral.%'), '[]'::jsonb))
  from referrals r
  left join profiles p on p.user_id = r.referred_user_id and p.deleted_at is null
  left join profiles rp on rp.user_id = r.referrer_user_id and rp.deleted_at is null
  where (p_filter is null
         or (p_filter = 'review' and r.status = 'review')
         or (p_filter = 'flagged' and r.status = 'review' and cardinality(r.flags) > 0)
         or (p_filter = 'approved' and r.status = 'rewarded')
         or (p_filter = 'progress' and r.status = 'registered')
         or (p_filter = 'rejected' and r.status in ('rejected', 'revoked')))
    and (q is null or lower(r.code) like '%' || q || '%'
         or lower(coalesce(p.biodata #>> '{basic,fullName}', '')) like '%' || q || '%'
         or lower(coalesce(rp.biodata #>> '{basic,fullName}', '')) like '%' || q || '%'
         or lower(coalesce(p.code, '')) like '%' || q || '%' or lower(coalesce(rp.code, '')) like '%' || q || '%')
  order by (r.status = 'review') desc, r.created_at desc
  limit 300;
end $$;

-- Approve (rewards both, once) or reject a referral waiting for the team. A reason is kept in the audit log.
create or replace function admin_decide_referral(p_id uuid, p_approve boolean, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a uuid := admin_require(); r referrals; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is not null and char_length(v_reason) > 500 then raise exception 'validation'; end if;
  select * into r from referrals where id = p_id for update;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r.status = 'rewarded' and p_approve then return jsonb_build_object('status', 'rewarded'); end if; -- double tap
  if r.status <> 'review' then raise exception 'invalid_state'; end if;
  update referrals set reason = v_reason where id = r.id;
  if p_approve then
    perform referral_issue(r.id, a);
  else
    update referrals set status = 'rejected', decided_at = now(), decided_by = a where id = r.id;
    perform track('referral_rejected:' || r.id, 'referral_rejected', r.referrer_user_id, '{}');
  end if;
  insert into audit_events (actor_id, action, target, meta)
  values (a, case when p_approve then 'referral.approved' else 'referral.rejected' end, r.id::text, jsonb_build_object('reason', v_reason));
  return jsonb_build_object('status', (select status from referrals where id = r.id));
end $$;

-- Take back a free Boost given by mistake or fraud (reason required). An unused one disappears; one that is
-- running ends now. Only referral Boosts can be touched here — paid Boosts never.
create or replace function admin_revoke_referral_reward(p_reward uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare a uuid := admin_require(); w referral_rewards; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) > 500 then raise exception 'validation'; end if;
  select * into w from referral_rewards where id = p_reward for update;
  if w.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if w.status = 'revoked' then return jsonb_build_object('status', 'revoked'); end if;
  -- Ends the Boost only if it is still THIS reward's Boost (same start), so a later paid Boost is never cut.
  if w.status = 'used' and w.profile_id is not null then
    update profiles set boost_until = now()
    where id = w.profile_id and boost_until > now() and boost_until = w.boost_until and boost_started_at = w.used_at;
  end if;
  update referral_rewards set status = 'revoked', revoked_at = now(), revoked_by = a, reason = v_reason where id = w.id;
  update referrals set status = 'revoked', decided_at = now(), decided_by = a, reason = v_reason
  where id = w.referral_id and status = 'rewarded'
    and not exists (select 1 from referral_rewards x where x.referral_id = w.referral_id and x.status <> 'revoked');
  insert into audit_events (actor_id, action, target, meta)
  values (a, 'referral.revoked', coalesce(w.referral_id::text, w.id::text), jsonb_build_object('reward', w.id, 'role', w.role, 'reason', v_reason));
  perform track('referral_revoked:' || w.id, 'referral_revoked', w.user_id, '{}');
  return jsonb_build_object('status', 'revoked');
end $$;

-- ───────── permissions (deny by default; only these are callable) ─────────
revoke all on function referral_phone_hash(text, text), referral_new_code(), referral_code_of(uuid), referral_profile_full(jsonb),
  referral_flags(referrals), referral_issue(uuid, uuid), referral_evaluate(uuid), trg_referral_new_user(), trg_referral_profile()
  from public, anon, authenticated;
revoke all on function get_referral_settings(), record_referral_visit(text), check_referral_code(text), claim_referral(text), get_my_referral(), use_referral_boost(),
  admin_referral_settings_update(text, boolean, int, boolean, boolean), admin_referral_overview(), admin_list_referrals(text, text),
  admin_decide_referral(uuid, boolean, text), admin_revoke_referral_reward(uuid, text) from public;
grant execute on function get_referral_settings(), record_referral_visit(text), check_referral_code(text) to anon, authenticated;
grant execute on function claim_referral(text), get_my_referral(), use_referral_boost(),
  admin_referral_settings_update(text, boolean, int, boolean, boolean), admin_referral_overview(), admin_list_referrals(text, text),
  admin_decide_referral(uuid, boolean, text), admin_revoke_referral_reward(uuid, text) to authenticated;
