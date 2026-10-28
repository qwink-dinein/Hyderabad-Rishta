\set ON_ERROR_STOP on
-- One mobile number = one account = one biodata. Every attempt to get a second biodata must fail;
-- the only way to start again is deleting the account.
reset role;
create temp table ob_results (name text, ok boolean);
grant all on ob_results to anon, authenticated;
create or replace function ob_fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create or replace function ob(n text, ok boolean) returns void language sql as $$ insert into ob_results values (n, coalesce(ok, false)) $$;
create or replace function ob_bio(name text) returns jsonb language sql as $$
  select jsonb_build_object('basic', jsonb_build_object('lookingFor', 'bride', 'fullName', name), 'photos', '[]'::jsonb,
    'location', '{}'::jsonb, 'career', '{}'::jsonb, 'religion', '{}'::jsonb, 'family', '{}'::jsonb, 'preferences', '{}'::jsonb, 'privacy', '{}'::jsonb) $$;
grant execute on function ob_fails(text), ob(text, boolean), ob_bio(text) to authenticated;

insert into auth.users values ('00000000-0000-0000-0000-0000000008a1'), ('00000000-0000-0000-0000-0000000008a2'), ('00000000-0000-0000-0000-0000000008a3');

-- ── Same number typed differently can never become a second account ──
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a1', '+91', '9555500001');
select ob('number stored once: leading zero rejected', ob_fails($q$insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a2', '+91', '09555500001')$q$));
select ob('number stored once: +091 rejected', ob_fails($q$insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a2', '+091', '9555500001')$q$));
select ob('number stored once: country code repeated rejected', ob_fails($q$insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a2', '+91', '919555500001')$q$));
select ob('number stored once: spaces rejected', ob_fails($q$insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a2', '+91', '95555 00001')$q$));
select ob('number stored once: exact duplicate rejected', ob_fails($q$insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a2', '+91', '9555500001')$q$));
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a2', '+1', '2025550123');
select ob('same E.164 split differently (+1 202… vs +12 02…) rejected', ob_fails($q$insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a3', '+12', '025550123')$q$));
select ob('same E.164 split differently (+120 25…) rejected', ob_fails($q$insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008a3', '+120', '25550123')$q$));

-- ── One biodata per account ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008a1', false);
insert into profiles (id, user_id, biodata) values ('81000000-0000-0000-0000-0000000008a1', auth.uid(), ob_bio('First Try'));
select ob('member: second biodata on the same number rejected', ob_fails($q$insert into profiles (user_id, biodata) values (auth.uid(), ob_bio('Second Try'))$q$));
select ob('member: cannot move biodata to another account', ob_fails($q$update profiles set user_id = '00000000-0000-0000-0000-0000000008a2' where user_id = auth.uid()$q$));
select ob('member: cannot clear the removed mark', ob_fails($q$update app_users set profile_removed_at = null where id = auth.uid()$q$));
select ob('member: cannot change own phone number', ob_fails($q$update app_users set phone = '9555500999' where id = auth.uid()$q$));
select ob('member: cannot create a biodata for someone else', ob_fails($q$insert into profiles (user_id, biodata) values ('00000000-0000-0000-0000-0000000008a2', ob_bio('Sneaky'))$q$));

-- ── Team removes the biodata → no fresh one, even after it is purged from Trash ──
reset role;
select set_config('request.jwt.claim.sub', (select id::text from app_users where role = 'master' limit 1), false);
set role authenticated;
select admin_delete_profile('81000000-0000-0000-0000-0000000008a1', 'fake profile');
reset role;
select ob('removal marks the account', (select to_jsonb(u) ->> 'profile_removed_at' is not null from app_users u where id = '00000000-0000-0000-0000-0000000008a1'));
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008a1', false);
select ob('member: new biodata after removal rejected (in Trash)', ob_fails($q$insert into profiles (user_id, biodata) values (auth.uid(), ob_bio('Fresh Start'))$q$));
reset role;
delete from profiles where id = '81000000-0000-0000-0000-0000000008a1'; -- purged from Trash
set role authenticated;
select ob('member: new biodata after purge still rejected', ob_fails($q$insert into profiles (user_id, biodata) values (auth.uid(), ob_bio('Fresh Start'))$q$));

-- ── Deleting the account frees the number: a brand-new account may have one biodata ──
reset role;
delete from app_users where id = '00000000-0000-0000-0000-0000000008a1';
delete from auth.users where id = '00000000-0000-0000-0000-0000000008a1';
insert into auth.users values ('00000000-0000-0000-0000-0000000008b1');
insert into app_users (id, country_code, phone) values ('00000000-0000-0000-0000-0000000008b1', '+91', '9555500001');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008b1', false);
select ob('after account deletion the same number can start one new biodata', not ob_fails($q$insert into profiles (user_id, biodata) values (auth.uid(), ob_bio('New Account'))$q$));
select ob('…and still only one', ob_fails($q$insert into profiles (user_id, biodata) values (auth.uid(), ob_bio('Another'))$q$));

reset role;
do $$
declare bad text;
begin
  select string_agg('  ✗ ' || name, E'\n') into bad from ob_results where not ok;
  if bad is not null then raise exception E'ONE-BIODATA RULE BROKEN:\n%', bad; end if;
end $$;
select 'ALL ONE-BIODATA TESTS PASSED (' || count(*) || ' checks)' as result from ob_results;
