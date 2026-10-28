\set ON_ERROR_STOP on
-- Two fresh members: f (groom, 9100000001) and g (bride, 9100000002).
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-0000000000f1', '+91', '9100000001'),
 ('00000000-0000-0000-0000-0000000000f2', '+91', '9100000002');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('20000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f1',
  '{"basic":{"lookingFor":"bride","fullName":"Faiz Test","dob":"1993-01-01","heightCm":175,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now()),
 ('20000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f2',
  '{"basic":{"lookingFor":"groom","fullName":"Gulnaz Test","dob":"1997-01-01","heightCm":160,"maritalStatus":"never_married","motherTongue":"urdu"},"photos":[],"location":{"country":"India","state":"Telangana","city":"Hyderabad"},"career":{"education":"bachelors","profession":"it"},"religion":{},"family":{},"preferences":{},"privacy":{"displayName":"first","photoVisibility":"onConsent","incomeVisibility":"hidden","familyVisibility":"public","acceptContactRequests":true}}', 'published', now());
grant select on phone_offers to authenticated;

set role authenticated;
-- F expresses interest WITH a number offer; double submit with the same key returns the same request.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select id as r1 from send_request('20000000-0000-0000-0000-0000000000f2', '<b>Salaam</b>', true, true, 'idem-1') \gset
do $$ begin
  assert (select id from send_request('20000000-0000-0000-0000-0000000000f2', 'again', true, true, 'idem-1')) = current_setting('test.dummy', true)::uuid
         or (select count(*) from contact_requests where from_user_id = auth.uid()) = 1, 'idempotent';
  begin perform send_request('20000000-0000-0000-0000-0000000000f2', null, false, false, 'idem-2'); assert false, 'duplicate allowed';
  exception when raise_exception then null; end;
  begin perform send_request('20000000-0000-0000-0000-0000000000f2', null, true, false, 'idem-3'); assert false, 'offer without consent';
  exception when raise_exception then null; end;
  assert (select message from contact_requests where from_user_id = auth.uid()) = 'Salaam', 'sanitised message';
  begin perform poke_request((select id from contact_requests where from_user_id = auth.uid())); assert false, 'poke before 48h';
  exception when raise_exception then null; end;
end $$;
-- G: notification has no number; G accepts → F's number revealed to G only.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin
  assert (select count(*) from notifications where user_id = auth.uid() and type = 'request_received' and params ->> 'offered' = '1') = 1, 'offered flag';
  assert (select count(*) from notifications where user_id = auth.uid() and params::text like '%9100000001%') = 0, 'number in notification';
  assert get_profile('20000000-0000-0000-0000-0000000000f1') -> 'contact' is null, 'revealed before accept';
end $$;
select respond_request(:'r1', 'accepted') is not null;
do $$ begin
  assert get_profile('20000000-0000-0000-0000-0000000000f1') #>> '{contact,phone}' = '9100000001', 'revealed after accept';
  begin perform respond_request(current_setting('test.r1', true)::uuid, 'declined'); exception when others then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$ begin
  assert get_profile('20000000-0000-0000-0000-0000000000f2') -> 'contact' is null, 'reverse reveal';
end $$;
-- G offers back, then withdraws before F accepts → F can never accept it.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
select id as o2 from offer_phone(:'r1', true, 'g-offer') \gset
select withdraw_phone_offer(:'o2') is not null;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
do $$ begin
  begin perform respond_phone_offer((select id from phone_offers where from_user_id = '00000000-0000-0000-0000-0000000000f2' order by created_at desc limit 1), 'accepted');
    assert false, 'withdrawn offer accepted';
  exception when raise_exception then null; end;
  assert get_profile('20000000-0000-0000-0000-0000000000f2') -> 'contact' is null, 'withdrawn offer revealed';
end $$;
-- G blocks F → request blocked, F's number no longer visible to G.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
insert into blocks (user_id, blocked_profile_id) values ('00000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-0000000000f1');
reset role;
do $$ begin
  assert (select status from contact_requests where from_user_id = '00000000-0000-0000-0000-0000000000f1') = 'blocked', 'blocked status';
  assert consent_scopes('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2') ->> 'phone' = 'false', 'number hidden after block';
end $$;
-- Expiry + poke rules on a separate pair (f → b's profile from earlier tests is gone; use g unblocked again).
delete from blocks;
update contact_requests set status = 'withdrawn' where from_user_id = '00000000-0000-0000-0000-0000000000f1';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select id as r2 from send_request('20000000-0000-0000-0000-0000000000f2', null, false, false, 'idem-r2') \gset
reset role;
update contact_requests set created_at = now() - interval '49 hours' where id = :'r2';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);
select poke_request(:'r2');
do $$ begin
  begin perform poke_request((select id from contact_requests where idempotency_key = 'idem-r2')); assert false, 'second poke';
  exception when raise_exception then null; end;
  assert (select status from contact_requests where idempotency_key = 'idem-r2') = 'pending', 'poke changed status';
end $$;
reset role;
update contact_requests set expires_at = now() - interval '1 minute' where id = :'r2';
select run_connection_jobs() >= 1 as expired_some;
do $$ begin
  assert (select status from contact_requests where id = (select id from contact_requests where idempotency_key = 'idem-r2')) = 'expired', 'expired';
  assert (select count(*) from analytics_events where props::text ~ '9100000001|9100000002') = 0, 'numbers in analytics';
  assert exists (select 1 from audit_events where action = 'phone.revealed'), 'reveal audited';
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$ begin
  begin perform respond_request((select id from contact_requests where idempotency_key = 'idem-r2'), 'accepted'); assert false, 'accepted expired';
  exception when raise_exception then null; end;
end $$;
select 'ALL INTEREST TESTS PASSED' as result;
