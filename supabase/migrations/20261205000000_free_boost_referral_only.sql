-- Free Boosts come ONLY from a successful referral (owner 2026-11-07): "this boost must not be given for free to
-- any new user; it is bound only by the referral programme — sell them to refer to get a Boost".
-- 1) No Boost order can ever be free, in any mode: a plan priced Free is refused by the database itself,
--    whatever app version calls start_boost(). Earned referral Boosts never create orders (use_referral_boost).
-- 2) Referral mode stays as before: no Boost order at all (paid or free).
-- 3) Referral mode is the default, and the live setting is switched to it.
create or replace function orders_referral_mode_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'boost' and (new.status = 'free' or exists (select 1 from referral_settings where mode = 'referral')) then
    raise exception 'boost_referral_only';
  end if;
  return new;
end $$;
revoke all on function orders_referral_mode_guard() from public, anon, authenticated;
create or replace trigger orders_referral_mode before insert on orders for each row execute function orders_referral_mode_guard();

alter table referral_settings alter column mode set default 'referral';
update referral_settings set mode = 'referral', updated_at = now() where mode <> 'referral';
