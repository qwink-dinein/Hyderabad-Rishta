-- Number swap when BOTH offer (load test, 2 Nov 2026).
-- 100 couples were checked step by step. When both people pressed "Share my number" (together, or one after
-- the other before either tapped "Show number"), both offers stayed waiting and neither number appeared.
-- Both have agreed to share with each other, so it is a swap: both numbers show at once.
create or replace function offer_phone(p_request uuid, p_consent boolean, p_idem text default null) returns phone_offers
language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests; o phone_offers; other uuid; mutual boolean; mine uuid;
begin
  if p_idem is not null then
    select * into o from phone_offers where from_user_id = auth.uid() and idempotency_key = p_idem;
    if o.id is not null then return o; end if;
  end if;
  select * into r from contact_requests where id = p_request and auth.uid() in (from_user_id, to_user_id) for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status <> 'accepted' then raise exception 'invalid_state'; end if;
  if not p_consent then raise exception 'consent_required'; end if;
  other := case when r.from_user_id = auth.uid() then r.to_user_id else r.from_user_id end;
  -- They already offered or shared THEIR number with me on this connection: a swap, so both are shown at once.
  -- (Before 20261201 an offer still waiting for my tap did not count, so when both pressed "Share my number"
  -- neither number appeared.) The request row is locked above, so two offers at the same instant are serialised.
  -- Flip their waiting offer first (the update re-checks its status, so an offer withdrawn a moment ago is not revived).
  update phone_offers set status = 'accepted', responded_at = now()
  where request_id = r.id and from_user_id = other and to_user_id = auth.uid() and status = 'offered';
  mutual := found or exists (select 1 from phone_offers x where x.request_id = r.id and x.from_user_id = other and x.to_user_id = auth.uid() and x.status = 'accepted');
  mine := case when r.from_user_id = auth.uid() then r.from_profile_id else r.to_profile_id end;
  begin
    insert into phone_offers (request_id, from_user_id, to_user_id, consent_text, idempotency_key, status, responded_at)
    values (r.id, auth.uid(), other, 'I agree to share my phone number with this person if they accept my offer.', p_idem,
            case when mutual then 'accepted' else 'offered' end, case when mutual then now() end) returning * into o;
  exception when unique_violation then raise exception 'duplicate';
  end;
  insert into audit_events (actor_id, action, target) values (auth.uid(), 'phone.offered', r.id::text);
  if mutual then insert into audit_events (actor_id, action, target, meta) values (auth.uid(), 'phone.revealed', r.id::text, '{"mutual":true}'); end if;
  insert into notifications (user_id, type, params, deep_link)
  values (other, 'phone_offer_received', jsonb_build_object('name', display_name_of(auth.uid())) || case when mutual then '{"shared":"1"}'::jsonb else '{}'::jsonb end, '/profile/' || mine);
  perform track('offer:' || o.id, 'reciprocal_offer_sent', auth.uid(), '{}');
  return o;
end $$;
