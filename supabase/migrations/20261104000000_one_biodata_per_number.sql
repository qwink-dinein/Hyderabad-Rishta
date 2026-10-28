-- One mobile number = one account = one biodata (owner request 2026-10-28, "airtight").
--  * profiles.user_id is already UNIQUE (a soft-deleted profile still occupies the slot).
--  * Numbers are stored in one canonical form, and the full E.164 string is unique, so the same
--    number can't become two accounts by being typed differently.
--  * When the team removes a member's biodata, the account is marked; no new biodata can be created
--    for it — not even after the removed one is purged from Trash. Only deleting the account (which
--    deletes the app_users row) frees the number. A master restore clears the mark.

alter table app_users add column if not exists profile_removed_at timestamptz;

alter table app_users drop constraint if exists phone_canonical;
alter table app_users add constraint phone_canonical check (
  country_code ~ '^\+[1-9][0-9]{0,2}$'
  and phone ~ '^[1-9][0-9]{5,13}$'
  and char_length(country_code) - 1 + char_length(phone) <= 15
  and (country_code <> '+91' or phone ~ '^[6-9][0-9]{9}$')
);
create unique index if not exists app_users_e164_key on app_users ((country_code || phone));

-- Mark / unmark when a profile is moved to or out of Trash.
create or replace function trg_profile_removed_mark() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update app_users set profile_removed_at = new.deleted_at where id = new.user_id;
  elsif new.deleted_at is null and old.deleted_at is not null then
    update app_users set profile_removed_at = null where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists profiles_removed_mark on profiles;
create trigger profiles_removed_mark after update of deleted_at on profiles for each row execute function trg_profile_removed_mark();

-- Refuse a new biodata for a marked account, and a second one in any case (belt and braces).
create or replace function trg_one_biodata_per_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from app_users where id = new.user_id and profile_removed_at is not null) then
    raise exception 'profile_removed' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles where user_id = new.user_id) then
    raise exception 'duplicate' using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists profiles_one_per_number on profiles;
create trigger profiles_one_per_number before insert on profiles for each row execute function trg_one_biodata_per_number();
-- Owner can never move a biodata to another account.
revoke update (user_id) on profiles from authenticated, anon;

revoke all on function trg_profile_removed_mark() from public, anon, authenticated;
revoke all on function trg_one_biodata_per_number() from public, anon, authenticated;
