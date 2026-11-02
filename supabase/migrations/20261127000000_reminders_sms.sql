-- Onboarding reminders on WhatsApp + SMS backup for login codes (owner request 2026-11-02).
--
-- 1) Reminders: a member who verified their number but has not finished their biodata gets at most two
--    WhatsApp reminders: ~1 hour after their last activity, and once more ~20 hours later if nothing has
--    happened since. Never after the biodata is submitted, never to team-created accounts not yet claimed,
--    never to admins, only within 3 days of the last activity. The edge function `onboarding-reminders`
--    sends them (quiet hours 21:00–09:00 IST); the database decides who is due and counts each reminder
--    BEFORE it is sent, so a member can never get the same reminder twice.
-- 2) SMS backup: the login-code hook falls back to SMS when WhatsApp fails (configured in the function's
--    secrets). A member can also ask for SMS ("Send by SMS instead"): request_sms_code() leaves a one-time
--    note for the next code to that number, read and cleared by take_otp_channel() in the hook.
--    app_flags.sms_otp_enabled tells the app whether to show that button (turned on once a provider is set).

create table if not exists app_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_flags enable row level security; -- no policies: read only through auth_channels()
insert into app_flags (key, value) values ('sms_otp_enabled', 'false'::jsonb) on conflict (key) do nothing;

-- What the login screens may offer. Public (before login).
create or replace function auth_channels()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('whatsapp', true,
    'sms', coalesce((select (value)::text = 'true' from app_flags where key = 'sms_otp_enabled'), false));
$$;
revoke all on function auth_channels() from public;
grant execute on function auth_channels() to anon, authenticated;

create table if not exists otp_channel_requests (
  phone text primary key,           -- digits with country code, as Supabase Auth stores it ("919876543210")
  channel text not null check (channel in ('sms')),
  requested_at timestamptz not null default now()
);
alter table otp_channel_requests enable row level security; -- no policies: functions only

-- "Send by SMS instead": valid for the next code within 10 minutes. Harmless if misused (it only changes
-- which channel carries a code to the number's own owner); Supabase Auth still rate-limits codes.
create or replace function request_sms_code(p_country_code text, p_phone text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare
  digits text := regexp_replace(coalesce(p_country_code, '') || coalesce(p_phone, ''), '\D', '', 'g');
begin
  if digits !~ '^[1-9][0-9]{7,14}$' then return false; end if;
  if not coalesce((select (value)::text = 'true' from app_flags where key = 'sms_otp_enabled'), false) then return false; end if;
  insert into otp_channel_requests (phone, channel, requested_at) values (digits, 'sms', now())
  on conflict (phone) do update set channel = 'sms', requested_at = now();
  return true;
end $$;
revoke all on function request_sms_code(text, text) from public;
grant execute on function request_sms_code(text, text) to anon, authenticated;

-- Called by the login-code hook (service role): returns 'sms' once, then forgets it.
create or replace function take_otp_channel(p_phone text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  ch text;
begin
  delete from otp_channel_requests where requested_at < now() - interval '1 day';
  delete from otp_channel_requests where phone = digits and requested_at > now() - interval '10 minutes' returning channel into ch;
  return ch;
end $$;
revoke all on function take_otp_channel(text) from public, anon, authenticated;

-- Reminder bookkeeping: one row per member who has been reminded.
create table if not exists onboarding_reminders (
  user_id uuid primary key references app_users (id) on delete cascade,
  sent_count int not null default 0,
  last_sent_at timestamptz,
  last_error text,
  opted_out boolean not null default false
);
alter table onboarding_reminders enable row level security; -- no policies: functions only

-- Who is due right now, claimed atomically (the count goes up before sending).
create or replace function claim_onboarding_reminders(p_limit int default 50)
returns table (user_id uuid, phone text, name text, lang text, n int)
language plpgsql volatile security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select u.id, u.country_code, u.phone, u.language, p.biodata #>> '{basic,fullName}' as full_name,
           greatest(u.created_at, coalesce(p.updated_at, u.created_at)) as last_activity,
           coalesce(r.sent_count, 0) as sent, r.last_sent_at
    from app_users u
    left join profiles p on p.user_id = u.id and p.deleted_at is null
    left join onboarding_reminders r on r.user_id = u.id
    where u.role = 'user'
      and u.deleted_at is null and u.deactivated_at is null
      and u.phone is not null
      and not (u.created_by is not null and u.claimed_at is null)   -- team is still filling it in
      and coalesce(r.opted_out, false) = false
      and (p.id is null or p.status = 'draft')                       -- not submitted yet
  ), due as (
    select c.* from candidates c
    where c.last_activity > now() - interval '3 days'
      and ((c.sent = 0 and c.last_activity <= now() - interval '1 hour')
        or (c.sent = 1 and c.last_sent_at <= now() - interval '20 hours' and c.last_activity < c.last_sent_at))
    order by c.last_activity
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), marked as (
    insert into onboarding_reminders as o (user_id, sent_count, last_sent_at)
    select d.id, d.sent + 1, now() from due d
    on conflict on constraint onboarding_reminders_pkey do update set sent_count = o.sent_count + 1, last_sent_at = now(), last_error = null
    returning o.user_id, o.sent_count
  )
  select d.id, regexp_replace(coalesce(d.country_code, '') || d.phone, '\D', '', 'g'), d.full_name, d.language, m.sent_count
  from due d join marked m on m.user_id = d.id;
end $$;
revoke all on function claim_onboarding_reminders(int) from public, anon, authenticated;

create or replace function onboarding_reminder_result(p_user uuid, p_ok boolean, p_error text default null)
returns void language sql volatile security definer set search_path = public as $$
  update onboarding_reminders set last_error = case when p_ok then null else left(p_error, 120) end where user_id = p_user;
$$;
revoke all on function onboarding_reminder_result(uuid, boolean, text) from public, anon, authenticated;

-- Job secrets live in Supabase Vault (never in code or chat). The cron job reads it from Vault and sends
-- it; the edge function asks the database whether it matches.
create or replace function check_job_secret(p_name text, p_secret text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  want text;
begin
  if to_regclass('vault.decrypted_secrets') is null or coalesce(length(p_secret), 0) < 32 then return false; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into want using 'job_secret_' || p_name;
  return want is not null and want = p_secret;
end $$;
revoke all on function check_job_secret(text, text) from public, anon, authenticated;

-- Schedule: every 15 minutes, call the edge function with the Vault secret. Guarded so local test
-- databases without pg_cron / pg_net / Vault skip it.
do $$
declare
  base text := 'https://hlthzrznuztapfsloxkm.supabase.co';
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net')
     or to_regclass('vault.secrets') is null then
    raise notice 'pg_cron / pg_net / vault not available — skipping the reminder schedule';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  if not exists (select 1 from vault.secrets where name = 'job_secret_onboarding_reminders') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'job_secret_onboarding_reminders', 'onboarding-reminders cron → edge function');
  end if;
  perform cron.schedule('hr-onboarding-reminders', '*/15 * * * *', format($q$select net.http_post(
      url := %L,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-job-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'job_secret_onboarding_reminders' limit 1)),
      body := '{}'::jsonb)$q$, base || '/functions/v1/onboarding-reminders'));
end $$;
