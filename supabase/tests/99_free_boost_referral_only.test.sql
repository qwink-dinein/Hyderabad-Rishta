\set ON_ERROR_STOP on
-- Owner rule 2026-11-07: a free Boost comes ONLY from a successful referral. Referral mode is the default;
-- in Paid mode a plan priced Free is refused by the database, whatever the app sends.
reset role;
do $$ begin
  assert (select column_default from information_schema.columns where table_name = 'referral_settings' and column_name = 'mode') like '''referral''%', 'default mode is referral';
end $$;
insert into auth.users (id, phone) values ('00000000-0000-0000-0000-00000000fb01', '919766600001');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-00000000fb01', '+91', '9766600001');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('fb000000-0000-0000-0000-00000000fb01', '00000000-0000-0000-0000-00000000fb01', '{"basic":{"lookingFor":"groom","fullName":"F"},"photos":[]}', 'published', now() - interval '3 days');
update pricing_config set config = jsonb_set(config, '{boostPlans}', jsonb_build_array(
  jsonb_build_object('id', 'd7', 'days', 7, 'enabled', true, 'popular', false, 'fee', jsonb_build_object('bride', jsonb_build_object('mode', 'free', 'amount', 0), 'groom', jsonb_build_object('mode', 'free', 'amount', 0))),
  jsonb_build_object('id', 'd14', 'days', 14, 'enabled', true, 'popular', false, 'fee', jsonb_build_object('bride', jsonb_build_object('mode', 'paid', 'amount', 200), 'groom', jsonb_build_object('mode', 'paid', 'amount', 200)))));

-- Referral mode: nothing can be started.
update referral_settings set mode = 'referral';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000fb01', false);
do $$ begin
  begin perform start_boost('d7'); assert false, 'free plan in referral mode'; exception when others then assert sqlerrm = 'boost_referral_only', sqlerrm; end;
  begin perform start_boost('d14'); assert false, 'paid plan in referral mode'; exception when others then assert sqlerrm = 'boost_referral_only', sqlerrm; end;
end $$;
-- Paid mode: the Free plan is still refused; the paid plan waits for payment.
reset role;
update referral_settings set mode = 'paid';
set role authenticated;
do $$ declare r jsonb; begin
  begin perform start_boost('d7'); assert false, 'free plan in paid mode'; exception when others then assert sqlerrm = 'boost_referral_only', sqlerrm; end;
  r := start_boost('d14');
  assert r #>> '{order,status}' = 'pending', 'paid plan waits for payment: ' || r;
  assert (select boost_until from profiles where user_id = auth.uid()) is null, 'no free boost given';
end $$;
reset role;
-- Even the owner cannot slip in a free Boost order.
do $$ begin
  begin
    insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
      ('00000000-0000-0000-0000-00000000fb01', 'fb000000-0000-0000-0000-00000000fb01', 'boost', 0, 'INR', 'free', '{"planId":"d7","boostDays":7,"autoRenew":false}');
    assert false, 'free boost order inserted';
  exception when raise_exception then assert sqlerrm = 'boost_referral_only', sqlerrm; end;
end $$;
update referral_settings set mode = 'referral';
select 'ALL FREE-BOOST-REFERRAL-ONLY TESTS PASSED' as result;
