-- Scheduled jobs (pg_cron). Without them interests never expire, boost notices and scheduled announcements
-- never go out, Trash is never purged and retention never runs. Guarded so databases without pg_cron
-- (local tests) skip it. Re-running replaces the schedules (cron.schedule upserts by job name).
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron not available — skipping job schedules';
    return;
  end if;
  create extension if not exists pg_cron;
  execute $q$select cron.schedule('hr-boost-jobs', '*/5 * * * *', 'select public.run_boost_jobs()')$q$;
  execute $q$select cron.schedule('hr-connection-jobs', '*/10 * * * *', 'select public.run_connection_jobs()')$q$;
  execute $q$select cron.schedule('hr-governance-jobs', '*/5 * * * *', 'select public.run_governance_jobs()')$q$;
  execute $q$select cron.schedule('hr-announcement-jobs', '*/5 * * * *', 'select public.run_announcement_jobs()')$q$;
  execute $q$select cron.schedule('hr-retention', '17 21 * * *', 'select public.run_retention()')$q$;  -- 02:47 IST
end $$;
