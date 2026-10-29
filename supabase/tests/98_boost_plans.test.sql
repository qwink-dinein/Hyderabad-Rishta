\set ON_ERROR_STOP on
-- Owner PRD 2026-10-29: admin-configured 7/14/30-day boost options; the server sets every boost price.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000dd1'), ('00000000-0000-0000-0000-000000000dd2');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-000000000dd1', '+91', '9666300001'),
 ('00000000-0000-0000-0000-000000000dd2', '+91', '9666300002');
-- dd1 looks for a bride → is a groom profile; dd2 looks for a groom → is a bride profile.
insert into profiles (id, user_id, biodata, status, published_at) values
 ('dd000000-0000-0000-0000-000000000dd1', '00000000-0000-0000-0000-000000000dd1', '{"basic":{"lookingFor":"bride","fullName":"G"},"photos":[]}', 'published', now()),
 ('dd000000-0000-0000-0000-000000000dd2', '00000000-0000-0000-0000-000000000dd2', '{"basic":{"lookingFor":"groom","fullName":"B"},"photos":[]}', 'published', now());
do $$ declare t record; begin
  -- Initial options exist and the legacy summary follows the shortest one.
  assert (select jsonb_array_length(config -> 'boostPlans') from pricing_config) = 3, 'three options';
  select * into t from boost_plan_terms('dd000000-0000-0000-0000-000000000dd1', 'd14');
  assert t.days = 14 and t.amount = 200 and t.mode = 'paid', 'groom 14 days ₹200';
  select * into t from boost_plan_terms('dd000000-0000-0000-0000-000000000dd2', 'd7');
  assert t.amount = 0 and t.mode = 'free', 'bride 7 days free';
  begin perform boost_plan_terms('dd000000-0000-0000-0000-000000000dd1', 'nope'); assert false, 'unknown option';
  exception when raise_exception then null; end;

  -- The right order is accepted…
  insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
   ('00000000-0000-0000-0000-000000000dd1', 'dd000000-0000-0000-0000-000000000dd1', 'boost', 200, 'INR', 'pending', '{"planId":"d14","boostDays":14,"autoRenew":false,"pricingVersion":1}');
  -- …a forged price, length, free status, auto-renew or missing option is not.
  begin insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
   ('00000000-0000-0000-0000-000000000dd2', 'dd000000-0000-0000-0000-000000000dd2', 'boost', 1, 'INR', 'pending', '{"planId":"d30","boostDays":30,"autoRenew":false}'); assert false, 'forged price';
  exception when raise_exception then null; end;
  begin insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
   ('00000000-0000-0000-0000-000000000dd2', 'dd000000-0000-0000-0000-000000000dd2', 'boost', 350, 'INR', 'pending', '{"planId":"d30","boostDays":90,"autoRenew":false}'); assert false, 'forged length';
  exception when raise_exception then null; end;
  begin insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
   ('00000000-0000-0000-0000-000000000dd2', 'dd000000-0000-0000-0000-000000000dd2', 'boost', 0, 'INR', 'free', '{"planId":"d30","boostDays":30,"autoRenew":false}'); assert false, 'paid option as free';
  exception when raise_exception then null; end;
  begin insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
   ('00000000-0000-0000-0000-000000000dd2', 'dd000000-0000-0000-0000-000000000dd2', 'boost', 350, 'INR', 'pending', '{"planId":"d30","boostDays":30,"autoRenew":true}'); assert false, 'auto-renew';
  exception when raise_exception then null; end;
  begin insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
   ('00000000-0000-0000-0000-000000000dd2', 'dd000000-0000-0000-0000-000000000dd2', 'boost', 350, 'INR', 'pending', '{"boostDays":30,"autoRenew":false}'); assert false, 'no option id';
  exception when raise_exception then null; end;

  -- Admin price change: the existing order keeps its price; the summary column follows the new shortest option.
  update pricing_config set config = jsonb_set(config, '{boostPlans}', '[
    {"id":"d10","days":10,"fee":{"bride":{"mode":"free","amount":0},"groom":{"mode":"paid","amount":150}},"enabled":true,"popular":false},
    {"id":"d14","days":14,"fee":{"bride":{"mode":"paid","amount":250},"groom":{"mode":"paid","amount":250}},"enabled":true,"popular":true}]');
  assert (select amount from orders where profile_id = 'dd000000-0000-0000-0000-000000000dd1' and kind = 'boost') = 200, 'old order keeps its price';
  assert (select boost_days from pricing_config) = 10, 'summary follows the shortest option';

  -- Nonsense configs are refused.
  begin update pricing_config set config = jsonb_set(config, '{boostPlans}', '[]'); assert false, 'no options';
  exception when check_violation then null; end;
  begin update pricing_config set config = jsonb_set(config, '{boostPlans,0,days}', '0'); assert false, '0 days';
  exception when check_violation then null; end;
  begin update pricing_config set config = jsonb_set(config, '{boostPlans,0,fee,groom,amount}', '-5'); assert false, 'negative price';
  exception when check_violation then null; end;
  begin update pricing_config set config = jsonb_set(config, '{boostPlans,1,days}', '10'); assert false, 'same duration twice';
  exception when check_violation then null; end;
  begin update pricing_config set config = jsonb_set(config, '{boostPlans,0,popular}', 'true'); assert false, 'two popular';
  exception when check_violation then null; end;
  begin update pricing_config set config = jsonb_set(config, '{boostPlans,0,id}', '"<x>"'); assert false, 'bad id';
  exception when check_violation then null; end;
end $$;
-- Members can't call the price function directly (server/payment function only).
set role authenticated;
do $$ begin
  begin perform boost_plan_terms('dd000000-0000-0000-0000-000000000dd1', 'd14'); assert false, 'members cannot call boost_plan_terms';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL BOOST-PLAN TESTS PASSED' as result;
