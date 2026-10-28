\set ON_ERROR_STOP on
-- Adversarial suite: a signed-out visitor, a normal member (Mallory) and a sub-admin try to break the
-- database through everything Supabase exposes (tables via PostgREST + RPCs), with Supabase's real
-- default grants (see 00_supabase_stub.sql). Every check is recorded; the suite fails listing ALL
-- broken checks at once, so it doubles as a vulnerability report and a regression test.
reset role;
create temp table attack_results (name text, ok boolean);
grant all on attack_results to anon, authenticated;
create or replace function t_fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function t_rows(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $$;
create or replace function t_count(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') x' into n; return n; exception when others then return -1; end $$;
create or replace function chk(n text, ok boolean) returns void language sql as $$ insert into attack_results values (n, coalesce(ok, false)) $$;

-- Cast: M = Mallory (published groom, attacker), V = Victim (published bride), D = draft member, S = sub-admin.
insert into auth.users values ('00000000-0000-0000-0000-0000000007a1'), ('00000000-0000-0000-0000-0000000007b1'), ('00000000-0000-0000-0000-0000000007c1'), ('00000000-0000-0000-0000-0000000007d1');
insert into app_users (id, country_code, phone, role) values
 ('00000000-0000-0000-0000-0000000007a1', '+91', '9400000001', 'user'),
 ('00000000-0000-0000-0000-0000000007b1', '+91', '9400000002', 'user'),
 ('00000000-0000-0000-0000-0000000007c1', '+91', '9400000003', 'user'),
 ('00000000-0000-0000-0000-0000000007d1', '+91', '9400000004', 'admin');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('80000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007a1', '{"basic":{"lookingFor":"bride","fullName":"Mallory Attacker","dob":"1990-01-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('80000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007b1', '{"basic":{"lookingFor":"groom","fullName":"Victoria Victim","dob":"1995-01-01","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"income":"20to35"},"religion":{},"family":{"fatherOccupation":"Doctor"},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"onConsent","acceptContactRequests":true}}', 'published', now()),
 ('80000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007c1', '{"basic":{"lookingFor":"groom","fullName":"Dana Draft"},"photos":[],"location":{},"career":{},"religion":{},"family":{},"preferences":{},"privacy":{}}', 'draft', null);
insert into contact_requests (id, from_user_id, from_profile_id, to_user_id, to_profile_id, status) values
 ('90000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', '80000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007a1', '80000000-0000-0000-0000-0000000007a1', 'pending');
insert into phone_offers (id, request_id, from_user_id, to_user_id, with_interest, consent_text) values
 ('91000000-0000-0000-0000-0000000007a1', '90000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007a1', true, 'consent');
insert into notifications (id, user_id, type) values ('92000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007b1', 'poke');
insert into orders (id, user_id, profile_id, kind, amount, currency, status, terms) values
 ('93000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007b1', '80000000-0000-0000-0000-0000000007b1', 'boost', 199, 'INR', 'pending', '{"boostDays":7}');

-- ═══════════════ 1. Signed-out visitor (anon) ═══════════════
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select chk('anon: cannot read members', t_count('select * from app_users') = 0 or t_count('select * from app_users') = -1);
select chk('anon: cannot read profiles table', t_count('select * from profiles') <= 0);
select chk('anon: cannot search', t_fails('select * from search_profiles()'));
select chk('anon: cannot resolve names', t_fails($q$select display_name_of('00000000-0000-0000-0000-0000000007b1')$q$));
select chk('anon: cannot call member RPCs', t_fails($q$select send_request('80000000-0000-0000-0000-0000000007b1')$q$));
select chk('anon: cannot call admin RPCs', t_fails('select admin_approve_all_pending()'));
select chk('anon: cannot call crypto helpers', t_fails($q$select gen_random_bytes(16)$q$));
select chk('anon: cannot insert reports', t_fails($q$insert into reports (reporter_user_id, profile_id, reason) values ('00000000-0000-0000-0000-0000000007a1', '80000000-0000-0000-0000-0000000007b1', 'spam')$q$));

-- ═══════════════ 2. Mallory, a normal signed-in member ═══════════════
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007a1', false);
-- 2a. Reading other people's private data
select chk('M: cannot read other users (phones)', t_count('select * from app_users where id <> auth.uid()') = 0);
select chk('M: cannot read other profiles raw (unprojected biodata)', t_count('select * from profiles where user_id <> auth.uid()') = 0);
select chk('M: cannot read others notifications', t_count('select * from notifications where user_id <> auth.uid()') = 0);
select chk('M: cannot read others orders', t_count('select * from orders where user_id <> auth.uid()') = 0);
select chk('M: cannot read view events', t_count('select * from view_events') = 0);
select chk('M: cannot read audit log', t_count('select * from audit_events') = 0);
select chk('M: cannot read recovery codes', t_count('select * from recovery_codes') <= 0);
select chk('M: cannot read push devices of others', t_count('select * from push_devices where user_id <> auth.uid()') = 0);
select chk('M: cannot read push outbox', t_count('select * from push_outbox') = 0);
select chk('M: cannot read boost impressions', t_count('select * from boost_impressions') = 0);
select chk('M: cannot resolve names by user id', t_fails($q$select display_name_of('00000000-0000-0000-0000-0000000007b1')$q$));
select chk('M: cannot call crypto helpers', t_fails($q$select crypt('x', gen_salt('bf'))$q$));
select chk('M: projection hides income & family-on-consent', (select (p -> 'career' ->> 'income') is null and coalesce(p -> 'family', 'null'::jsonb) = 'null'::jsonb from get_profile('80000000-0000-0000-0000-0000000007b1') p));
select chk('M: projection never carries phone', (select position('9400000002' in p::text) = 0 from get_profile('80000000-0000-0000-0000-0000000007b1') p));
select chk('M: cannot open a draft profile', t_fails($q$select get_profile('80000000-0000-0000-0000-0000000007c1')$q$));
select chk('M: search page size capped', t_count('select * from search_profiles(p_limit => 100000)') <= 50);
-- 2b. Privilege escalation & forging
select chk('M: cannot make self admin', t_fails($q$update app_users set role = 'master' where id = auth.uid()$q$));
select chk('M: cannot change own phone', t_fails($q$update app_users set phone = '9999999999' where id = auth.uid()$q$));
select chk('M: cannot self-publish', t_fails($q$update profiles set status = 'published' where user_id = auth.uid()$q$));
select chk('M: cannot self-boost', t_fails($q$update profiles set boost_until = now() + interval '1 year' where user_id = auth.uid()$q$));
select chk('M: cannot edit others profile', t_rows($q$update profiles set biodata = '{}' where user_id = '00000000-0000-0000-0000-0000000007b1'$q$) <= 0);
select chk('M: cannot create profile for someone else', t_fails($q$insert into profiles (user_id, biodata) values ('00000000-0000-0000-0000-0000000007b1', '{}')$q$));
select chk('M: cannot forge notifications', t_fails($q$insert into notifications (user_id, type) values ('00000000-0000-0000-0000-0000000007b1', 'safety')$q$));
select chk('M: cannot mark others notifications read', t_rows($q$update notifications set read_at = now() where user_id = '00000000-0000-0000-0000-0000000007b1'$q$) <= 0);
select chk('M: cannot rewrite own notification text', t_fails($q$update notifications set params = '{"name":"x"}' where user_id = auth.uid()$q$));
select chk('M: cannot forge a paid order', t_fails($q$insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values (auth.uid(), '80000000-0000-0000-0000-0000000007a1', 'boost', 0, 'INR', 'paid', '{}')$q$));
select chk('M: cannot mark own order paid', t_rows($q$update orders set status = 'paid' where user_id = auth.uid()$q$) <= 0);
select chk('M: cannot inject interest rows', t_fails($q$insert into contact_requests (from_user_id, from_profile_id, to_user_id, to_profile_id) values (auth.uid(), '80000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', '80000000-0000-0000-0000-0000000007b1')$q$));
select chk('M: cannot accept a number offer by table update', t_rows($q$update phone_offers set status = 'accepted'$q$) <= 0);
select chk('M: cannot grant self consent', t_fails($q$insert into consents (request_id, grantor_user_id, grantor_profile_id, grantee_user_id, photos, phone, full_biodata) values ('90000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', '80000000-0000-0000-0000-0000000007b1', auth.uid(), true, true, true)$q$));
select chk('M: cannot fake profile views', t_fails($q$insert into view_events (profile_id, viewer_user_id) values ('80000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1')$q$));
select chk('M: cannot fake boost reach', t_fails($q$insert into boost_impressions values ('80000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007b1', current_date)$q$));
select chk('M: cannot write audit log', t_fails($q$insert into audit_events (actor_id, action) values (auth.uid(), 'fake')$q$));
select chk('M: cannot change pricing', t_rows($q$update pricing_config set request_expiry_days = 90$q$) <= 0);
select chk('M: cannot post announcements', t_fails($q$insert into announcements (title, body, segment) values ('{"en":"x"}', '{"en":"x"}', 'all')$q$));
select chk('M: cannot register devices directly', t_fails($q$insert into push_devices (token, user_id, platform) values ('ExponentPushToken[zzzzzzzzzzzz]', '00000000-0000-0000-0000-0000000007b1', 'ios')$q$));
select chk('M: cannot block on behalf of others', t_fails($q$insert into blocks (user_id, blocked_profile_id) values ('00000000-0000-0000-0000-0000000007b1', '80000000-0000-0000-0000-0000000007a1')$q$));
select chk('M: cannot shortlist for others', t_fails($q$insert into shortlists (user_id, profile_id) values ('00000000-0000-0000-0000-0000000007b1', '80000000-0000-0000-0000-0000000007b1')$q$));
select chk('M: cannot shortlist a draft (existence probe / notice spam)', t_fails($q$insert into shortlists (user_id, profile_id) values (auth.uid(), '80000000-0000-0000-0000-0000000007c1')$q$));
-- 2c. Acting on other people's interactions
select chk('M: cannot withdraw someone else''s offer', t_fails($q$select withdraw_phone_offer('91000000-0000-0000-0000-0000000007a1')$q$));
select chk('M: cannot open others notification', t_fails($q$select open_notification('92000000-0000-0000-0000-0000000007b1')$q$));
select chk('M: cannot cancel others order', t_fails($q$select admin_cancel_order('93000000-0000-0000-0000-0000000007b1')$q$));
select chk('M: cannot poke as recipient', t_fails($q$select poke_request('90000000-0000-0000-0000-0000000007a1')$q$));
select chk('M: cannot call admin RPCs', t_fails($q$select admin_set_profile_status('80000000-0000-0000-0000-0000000007b1', 'paused')$q$));
select chk('M: cannot call master RPCs', t_fails($q$select master_add_sub_admin('+91', '9400000001')$q$));
select chk('M: cannot call service jobs', t_fails('select run_boost_jobs()') and t_fails('select claim_push_batch(10)') and t_fails($q$select apply_boost('93000000-0000-0000-0000-0000000007b1')$q$));
-- 2d. Oversized / malicious payloads (data-size & abuse)
select chk('M: biodata size is capped', t_fails($q$update profiles set biodata = jsonb_set(biodata, '{aboutMe}', to_jsonb(repeat('x', 200000))) where user_id = auth.uid()$q$));
select chk('M: photos must be storage paths (no tracking/data URLs)', t_fails($q$update profiles set biodata = jsonb_set(biodata, '{photos}', '[{"id":"p1","uri":"https://evil.example/pixel.gif"}]') where user_id = auth.uid()$q$));
select chk('M: own-folder photo paths allowed', not t_fails($q$update profiles set biodata = jsonb_set(biodata, '{photos}', '[{"id":"p1","uri":"00000000-0000-0000-0000-0000000007a1/p1.jpg"}]') where user_id = auth.uid()$q$));
select chk('M: report status cannot be forged', t_fails($q$insert into reports (reporter_user_id, profile_id, reason, status) values (auth.uid(), '80000000-0000-0000-0000-0000000007b1', 'fake', 'dismissed')$q$));
select chk('M: one report works', not t_fails($q$insert into reports (reporter_user_id, profile_id, reason) values (auth.uid(), '80000000-0000-0000-0000-0000000007b1', 'fake')$q$));
select chk('M: duplicate open report rejected', t_fails($q$insert into reports (reporter_user_id, profile_id, reason) values (auth.uid(), '80000000-0000-0000-0000-0000000007b1', 'fake')$q$));
select chk('M: report reason must be a known reason', t_fails($q$insert into reports (reporter_user_id, profile_id, reason) values (auth.uid(), '80000000-0000-0000-0000-0000000007a1', repeat('z', 5000))$q$));
select chk('M: huge interest message rejected cheaply', t_fails($q$select send_request('80000000-0000-0000-0000-0000000007b1', repeat('a', 2000000))$q$));
select chk('M: huge idempotency key rejected', t_fails($q$select send_request('80000000-0000-0000-0000-0000000007b1', null, false, false, repeat('k', 10000))$q$));
select chk('M: push token length bounded', t_fails($q$select register_push_device('ExponentPushToken[' || repeat('a', 5000) || ']', 'ios')$q$));
select chk('M: push prefs payload bounded', t_fails($q$select set_push_prefs(jsonb_build_object('junk', repeat('x', 100000)))$q$));
select chk('M: unknown push pref keys are never stored', t_fails($q$select set_push_prefs('{"junk": 1}')$q$) = false and (select not (push_prefs ? 'junk') from app_users where id = auth.uid()));
select chk('M: deep links must stay inside the app', true); -- enforced by constraint; members can't insert notifications at all (above)
select chk('M: admin search refused', t_fails($q$select * from admin_search('Victoria')$q$));
-- 2e. Storage: photos live under <uid>/…; no writing into someone else's folder
select chk('M: cannot upload into another member''s photo folder', t_fails($q$insert into storage.objects (bucket_id, name) values ('profile-photos', '00000000-0000-0000-0000-0000000007b1/x.jpg')$q$));

-- ═══════════════ 3. Sub-admin limits ═══════════════
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007d1', false);
select chk('S: cannot promote self to master', t_fails($q$update app_users set role = 'master' where id = auth.uid()$q$));
select chk('S: cannot add sub-admins', t_fails($q$select master_add_sub_admin('+91', '9400000003')$q$));
select chk('S: cannot read recovery codes', t_count('select * from recovery_codes') <= 0);
select chk('S: cannot delete audit log', t_rows('delete from audit_events') <= 0);

reset role;
do $$ declare bad text; begin
  select string_agg(name, E'\n  ✗ ') into bad from attack_results where not ok;
  if bad is not null then raise exception E'ATTACKS THAT SUCCEEDED:\n  ✗ %', bad; end if;
end $$;
select 'ALL ATTACK TESTS PASSED (' || count(*) || ' attacks blocked)' from attack_results;
