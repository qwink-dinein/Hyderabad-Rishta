-- The admin pricing screen also edits the connection rules (interest expiry, reminder wait, reminders per
-- week). The original admin_update_pricing() dropped them; this version saves everything in one change,
-- with history and audit. The table's CHECK constraints enforce the same ranges as the app.
create or replace function admin_update_pricing(p_config jsonb, p_boost_days int, p_require_approval boolean,
  p_request_expiry_days int, p_poke_wait_hours int, p_poke_max_per_7_days int)
returns pricing_config language plpgsql volatile security definer set search_path = public as $$
declare before pricing_config; after pricing_config;
begin
  if not is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into before from pricing_config where id;
  update pricing_config set config = p_config, boost_days = p_boost_days, require_approval = p_require_approval,
    request_expiry_days = coalesce(p_request_expiry_days, request_expiry_days),
    poke_wait_hours = coalesce(p_poke_wait_hours, poke_wait_hours),
    poke_max_per_7_days = coalesce(p_poke_max_per_7_days, poke_max_per_7_days),
    version = version + 1, updated_at = now(), updated_by = auth.uid()
  where id returning * into after;
  insert into pricing_history (admin_id, before, after) values (auth.uid(), to_jsonb(before), to_jsonb(after));
  insert into audit_events (actor_id, action, meta) values (auth.uid(), 'pricing.updated', jsonb_build_object('version', after.version));
  return after;
end $$;
revoke all on function admin_update_pricing(jsonb, int, boolean, int, int, int) from public, anon;
grant execute on function admin_update_pricing(jsonb, int, boolean, int, int, int) to authenticated;
