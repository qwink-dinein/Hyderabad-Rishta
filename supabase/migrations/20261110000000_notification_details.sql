-- Owner request 2026-10-29: notifications should say what happened. When an interest that carried
-- the sender's number offer is accepted, the sender's "accepted" notice says their number is now
-- visible to the other member (params.numberShared = '1'). Twin of the demo backend's respondToRequest.
create or replace function trg_request_accepted_detail() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'request_accepted' and exists (
    select 1 from phone_offers o
    where o.from_user_id = new.user_id and o.to_user_id = auth.uid()
      and o.with_interest and o.status = 'accepted' and o.responded_at = now() -- revealed in this same transaction
  ) then
    new.params := coalesce(new.params, '{}'::jsonb) || '{"numberShared":"1"}'::jsonb;
  end if;
  return new;
end $$;
revoke all on function trg_request_accepted_detail() from public, anon, authenticated;
drop trigger if exists notifications_accept_detail on notifications;
create trigger notifications_accept_detail before insert on notifications for each row execute function trg_request_accepted_detail();
