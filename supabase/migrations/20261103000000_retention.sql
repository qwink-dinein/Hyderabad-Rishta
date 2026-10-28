-- Data retention: keeps tables that grow with every tap bounded (owner request 2026-10-28,
-- "minimise the long data sizes"). Lifetime totals members/admins see — view_events, audit_events,
-- orders, reports — are never pruned here.
--
-- Schedule (Supabase, pg_cron):  select cron.schedule('retention', '17 3 * * *', $$select run_retention()$$);

create or replace function run_retention() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare n_notes int; n_outbox int; n_analytics int; n_impr int; n_recov int;
begin
  -- Inbox: newest 200 per member (older ones are never shown) and nothing read over 180 days old.
  with ranked as (
    select id, read_at, created_at, row_number() over (partition by user_id order by created_at desc) as rn
    from notifications
  )
  delete from notifications n using ranked r
  where n.id = r.id and (r.rn > 200 or (r.read_at is not null and r.created_at < now() - interval '180 days'));
  get diagnostics n_notes = row_count;

  -- Push log: finished rows after 30 days (the hourly cap only looks back one hour).
  delete from push_outbox where status in ('sent', 'delivered', 'failed', 'skipped') and created_at < now() - interval '30 days';
  get diagnostics n_outbox = row_count;

  delete from analytics_events where at < now() - interval '400 days';
  get diagnostics n_analytics = row_count;

  delete from boost_impressions where day < current_date - 180;
  get diagnostics n_impr = row_count;

  delete from recovery_attempts where at < now() - interval '30 days';
  get diagnostics n_recov = row_count;

  return jsonb_build_object('notifications', n_notes, 'push_outbox', n_outbox, 'analytics', n_analytics, 'impressions', n_impr, 'recovery_attempts', n_recov);
end $$;
revoke all on function run_retention() from public, anon, authenticated;
