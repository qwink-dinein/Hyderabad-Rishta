\set ON_ERROR_STOP on
-- One boost at a time: no second boost order while one runs, one pending order max, no stacking.
reset role;
insert into auth.users values ('00000000-0000-0000-0000-000000000bb1');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-000000000bb1', '+91', '9666100001');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('b1000000-0000-0000-0000-000000000bb1', '00000000-0000-0000-0000-000000000bb1', '{"basic":{"lookingFor":"bride"},"photos":[]}', 'published', now() - interval '10 days');
insert into orders (id, user_id, profile_id, kind, amount, currency, status, terms) values
 ('b2000000-0000-0000-0000-000000000bb1', '00000000-0000-0000-0000-000000000bb1', 'b1000000-0000-0000-0000-000000000bb1', 'boost', 499, 'INR', 'pending', '{"boostDays":7}');
do $$ declare until1 timestamptz; begin
  begin
    insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
      ('00000000-0000-0000-0000-000000000bb1', 'b1000000-0000-0000-0000-000000000bb1', 'boost', 499, 'INR', 'pending', '{"boostDays":7}');
    assert false, 'second pending boost order allowed';
  exception when unique_violation then null; end;
  update orders set status = 'paid' where id = 'b2000000-0000-0000-0000-000000000bb1';
  until1 := apply_boost('b2000000-0000-0000-0000-000000000bb1');
  begin
    insert into orders (user_id, profile_id, kind, amount, currency, status, terms) values
      ('00000000-0000-0000-0000-000000000bb1', 'b1000000-0000-0000-0000-000000000bb1', 'boost', 0, 'INR', 'free', '{"boostDays":7}');
    assert false, 'new boost order allowed while a boost runs';
  exception when raise_exception then null; end;
  assert apply_boost('b2000000-0000-0000-0000-000000000bb1') = until1, 'apply_boost still idempotent per order';
end $$;
-- A paid order that slipped in anyway (e.g. created before the boost started) is refused, not stacked.
alter table orders disable trigger orders_boost_guard;
insert into orders (id, user_id, profile_id, kind, amount, currency, status, terms) values
 ('b2000000-0000-0000-0000-000000000bb2', '00000000-0000-0000-0000-000000000bb1', 'b1000000-0000-0000-0000-000000000bb1', 'boost', 499, 'INR', 'paid', '{"boostDays":7}');
alter table orders enable trigger orders_boost_guard;
do $$ declare before_until timestamptz; begin
  select boost_until into before_until from profiles where id = 'b1000000-0000-0000-0000-000000000bb1';
  begin perform apply_boost('b2000000-0000-0000-0000-000000000bb2'); assert false, 'boost stacked on a running boost';
  exception when raise_exception then null; end;
  assert (select boost_until from profiles where id = 'b1000000-0000-0000-0000-000000000bb1') = before_until, 'boost not extended';
end $$;
-- After it ends, boosting again works.
update profiles set boost_until = now() - interval '1 minute' where id = 'b1000000-0000-0000-0000-000000000bb1';
insert into orders (id, user_id, profile_id, kind, amount, currency, status, terms) values
 ('b2000000-0000-0000-0000-000000000bb3', '00000000-0000-0000-0000-000000000bb1', 'b1000000-0000-0000-0000-000000000bb1', 'boost', 0, 'INR', 'free', '{"boostDays":3}');
do $$ begin
  assert apply_boost('b2000000-0000-0000-0000-000000000bb3') > now() + interval '2 days', 'boost again after the previous one ended';
end $$;
select 'ALL ONE-BOOST TESTS PASSED' as result;
