-- Supabase security advisor follow-ups (first live project, 2026-10-29).

-- 1. can_view_profile(viewer, p_id) is executable by members (the shortlist INSERT policy needs it). It must
--    only ever answer for the caller: otherwise a member could ask "can B see C?" and learn whether B and C
--    blocked each other. The policy always passes auth.uid(); service-role callers (no JWT) are unaffected.
create or replace function can_view_profile(viewer uuid, p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or viewer = auth.uid()) and exists (
    select 1 from profiles p join app_users u on u.id = p.user_id
    where p.id = p_id and p.user_id <> viewer and p.status = 'published' and p.deleted_at is null
      and u.deactivated_at is null and u.deleted_at is null and not is_blocked_between(viewer, p));
$$;
revoke all on function can_view_profile(uuid, uuid) from public, anon;
grant execute on function can_view_profile(uuid, uuid) to authenticated;

-- 2. Trigger functions are never called through the API.
revoke all on function trg_report_rate() from public, anon, authenticated;

-- 3. Pin search_path on every public function that does not set one (advisor 0011).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;
