-- Supabase performance advisor follow-ups (first live project, 2026-10-29).

-- 1. auth_rls_initplan: RLS policies that call auth.uid() directly re-evaluate it for EVERY row. Wrapping it
--    as (select auth.uid()) lets Postgres evaluate it once per query. Same meaning, rewritten mechanically.
do $$
declare
  p record;
  q text;
  c text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'auth\.uid\(\)' or coalesce(with_check, '') ~ 'auth\.uid\(\)')
  loop
    -- Skip any expression that is already wrapped (deparsed as "( SELECT auth.uid() AS uid)").
    q := case when p.qual is null or p.qual ~* 'select auth\.uid\(\)' then null else replace(p.qual, 'auth.uid()', '(select auth.uid())') end;
    c := case when p.with_check is null or p.with_check ~* 'select auth\.uid\(\)' then null else replace(p.with_check, 'auth.uid()', '(select auth.uid())') end;
    if q is null and c is null then continue; end if;
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;
end $$;

-- 2. Foreign keys followed when an account or biodata is erased (cascades) — index them.
create index if not exists trusted_devices_user_idx on trusted_devices (user_id);
create index if not exists consents_grantor_user_idx on consents (grantor_user_id);
create index if not exists shortlist_notices_profile_idx on shortlist_notices (profile_id);
