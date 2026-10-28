-- Security hardening after an adversarial review (supabase/tests/60_attacks.test.sql documents every attack).
-- Findings fixed here:
--  H1 display_name_of() was callable by anyone (incl. signed-out) → name lookup for any user id.
--  H2 every SECURITY DEFINER function was executable by `anon` (Supabase default grants); internal
--     helpers and pgcrypto were reachable through the API. Now: deny by default, allow-list RPCs.
--  M1 members could shortlist profiles they can't see (drafts/blocked) → existence probe + notice spam.
--  M2 biodata had no size cap (multi-MB rows) and photo URIs were free text (tracking pixels / data: URLs).
--  M3 reports: status/resolved_at forgeable on insert, unlimited duplicates, free-text reason (alert flooding).
--  L1 push token length, push-prefs payload, interest message / idempotency key sizes were unbounded.
--  L2 deep links & announcement images accepted any URL (open redirect / external content from a compromised admin).

-- ───────── H2: deny-by-default function execution ─────────
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
-- Allow-list: what signed-in members (and admins, whose RPCs check is_admin()/is_master() inside) may call.
do $$ declare f text; begin
  foreach f in array array[
    'is_admin()', 'is_master()', 'iso_date(text)',
    'search_profiles(text, int, int, text[], text[], text[], text, int, int)', 'get_profile(uuid)', 'get_featured(int)',
    'send_request(uuid, text, boolean, boolean, text)', 'respond_request(uuid, request_status)', 'withdraw_request(uuid)',
    'offer_phone(uuid, boolean, text)', 'respond_phone_offer(uuid, text)', 'withdraw_phone_offer(uuid)', 'poke_request(uuid)',
    'set_consent(uuid, boolean, boolean, boolean)', 'open_notification(uuid, boolean)',
    'register_push_device(text, text)', 'unregister_push_device(text)', 'set_push_prefs(jsonb)', 'get_push_settings()',
    'recover_master(text)',
    'admin_approve_all_pending()', 'admin_cancel_order(uuid)', 'admin_delete(text, uuid)', 'admin_delete_profile(uuid, text)',
    'admin_delete_user(uuid, text)', 'admin_recipient_report(uuid)', 'admin_search(text)', 'admin_set_profile_status(uuid, profile_status, text)',
    'admin_set_require_approval(boolean)', 'admin_set_user_deactivated(uuid, boolean)', 'admin_update_pricing(jsonb, integer, boolean)',
    'master_add_sub_admin(text, text)', 'master_cancel_recovery()', 'master_generate_recovery_codes()', 'master_purge(text, uuid)',
    'master_remove_sub_admin(uuid)', 'master_restore(text, uuid)', 'master_transfer(uuid)'
  ] loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ───────── M1: you can only shortlist what you can see ─────────
create or replace function can_view_profile(viewer uuid, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p join app_users u on u.id = p.user_id
    where p.id = p_id and p.user_id <> viewer and p.status = 'published' and p.deleted_at is null
      and u.deactivated_at is null and u.deleted_at is null and not is_blocked_between(viewer, p));
$$;
revoke all on function can_view_profile(uuid, uuid) from public, anon;
grant execute on function can_view_profile(uuid, uuid) to authenticated; -- needed by the policy below
drop policy if exists shortlists_own on shortlists;
create policy shortlists_own_read on shortlists for select using (user_id = auth.uid());
create policy shortlists_own_delete on shortlists for delete using (user_id = auth.uid());
create policy shortlists_own_insert on shortlists for insert with check (user_id = auth.uid() and can_view_profile(auth.uid(), profile_id));
revoke update on shortlists from authenticated, anon;

-- ───────── M2: biodata size cap + photos are storage paths in the owner's folder ─────────
create or replace function photos_ok(b jsonb, owner uuid) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(b -> 'photos'), 'array') = 'array' and not exists (
    select 1 from jsonb_array_elements(coalesce(b -> 'photos', '[]')) ph
    where jsonb_typeof(ph) <> 'object'
       or char_length(coalesce(ph ->> 'id', '')) not between 1 and 64
       or coalesce(ph ->> 'uri', '') !~ ('^' || owner::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$'));
$$;
grant execute on function photos_ok(jsonb, uuid) to authenticated; -- evaluated by the CHECK on member updates
alter table profiles add constraint biodata_size_cap check (octet_length(biodata::text) <= 32768);
alter table profiles add constraint photos_are_storage_paths check (photos_ok(biodata, user_id));

-- ───────── M3: reports — no forged fields, no duplicates, known reasons, daily cap ─────────
revoke insert on reports from authenticated, anon;
grant insert (reporter_user_id, profile_id, reason, details) on reports to authenticated;
alter table reports add constraint reports_reason_known check (reason in ('fake', 'inappropriate', 'harassment', 'scam', 'already_married', 'other'));
create unique index if not exists reports_one_open_per_pair on reports (reporter_user_id, profile_id) where status = 'open';
create or replace function trg_report_rate() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from reports where reporter_user_id = new.reporter_user_id and created_at > now() - interval '1 day') >= 10 then
    raise exception 'rate_limited';
  end if;
  return new;
end $$;
drop trigger if exists reports_rate on reports;
create trigger reports_rate before insert on reports for each row execute function trg_report_rate();

-- ───────── L1: bounded inputs ─────────
alter table push_devices add constraint push_token_len check (char_length(token) <= 200);
alter table contact_requests add constraint idempotency_key_len check (idempotency_key is null or char_length(idempotency_key) <= 100);
create or replace function set_push_prefs(p_patch jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); clean jsonb := '{}'; k text;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if octet_length(coalesce(p_patch, '{}')::text) > 1024 then raise exception 'validation'; end if;
  foreach k in array array['enabled','interests','activity','announcements','showNames'] loop
    if jsonb_typeof(p_patch -> k) = 'boolean' then clean := clean || jsonb_build_object(k, p_patch -> k); end if;
  end loop;
  update app_users set push_prefs = push_prefs_of(push_prefs) || clean where id = me;
  return (select push_prefs_of(push_prefs) from app_users where id = me);
end $$;
grant execute on function set_push_prefs(jsonb) to authenticated;

create or replace function send_request(p_to uuid, p_message text default null, p_offer_phone boolean default false,
  p_consent boolean default false, p_idem text default null)
returns contact_requests language plpgsql volatile security definer set search_path = public as $$
declare mine profiles; target profiles; r contact_requests; cfg pricing_config; msg text;
begin
  -- Reject oversized input before doing any work on it (cheap DoS guard).
  if char_length(coalesce(p_message, '')) > 4000 or char_length(coalesce(p_idem, '')) > 100 then raise exception 'validation'; end if;
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
grant execute on function send_request(uuid, text, boolean, boolean, text) to authenticated;

-- ───────── L2: in-app deep links only; announcement images over https only ─────────
alter table notifications add constraint notifications_deep_link_internal check (deep_link is null or deep_link ~ '^/[A-Za-z0-9/_?=&.%-]*$');
alter table announcements add constraint announcements_deep_link_internal check (deep_link is null or deep_link ~ '^/[A-Za-z0-9/_?=&.%-]*$');
alter table announcements add constraint announcements_image_https check (image_url is null or image_url ~ '^https://[^\s]{4,500}$');
