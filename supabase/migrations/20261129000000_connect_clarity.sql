-- Connections (owner report 2026-11-02): after an interest is accepted the sender could not find the
-- other member's photo or number.
-- 1) Number swap: when one member already shared their number with the other on this connection
--    (an accepted offer), the other member's offer back is shown at once (no second "accept" to miss).
--    A one-sided offer still needs the receiver's tap ("Show number"), as before.
-- 2) "Accepted" and "number" notifications now open the person's profile, where the shared photos
--    and number are, instead of the inbox.
-- Same rules as the demo backend (src/services/demo/demoBackend.ts).

create or replace function respond_request(p_id uuid, p_decision request_status)
returns contact_requests language plpgsql volatile security definer set search_path = public as $$
declare r contact_requests; o phone_offers;
begin
  if p_decision not in ('accepted', 'declined') then raise exception 'validation'; end if;
  select * into r from contact_requests where id = p_id and to_user_id = auth.uid() for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.status = 'expired' or (r.status = 'pending' and r.expires_at <= now()) then raise exception 'expired'; end if;
  if r.status <> 'pending' then raise exception 'invalid_state'; end if;
  update contact_requests set status = p_decision, responded_at = now() where id = p_id returning * into r;
  select * into o from phone_offers where request_id = r.id and from_user_id = r.from_user_id and with_interest and status = 'offered' for update;
  if o.id is not null then
    update phone_offers set status = case when p_decision = 'accepted' then 'accepted' else 'expired' end, responded_at = now() where id = o.id;
    if p_decision = 'accepted' then
      insert into audit_events (actor_id, action, target) values (auth.uid(), 'phone.revealed', r.id::text);
      perform track('reveal:' || o.id, 'number_revealed', auth.uid(), '{"withInterest":true}');
    end if;
  end if;
  -- Accepted: open the person's profile (photos / number shared there); declined: the inbox.
  insert into notifications (user_id, type, params, deep_link)
  values (r.from_user_id, case when p_decision = 'accepted' then 'request_accepted' else 'request_declined' end, jsonb_build_object('name', display_name_of(auth.uid())),
          case when p_decision = 'accepted' then '/profile/' || r.to_profile_id else '/requests' end);
  perform track(p_decision::text || ':' || r.id, case when p_decision = 'accepted' then 'request_accepted' else 'request_declined' end, auth.uid(), '{}');
  return r;
end $$;

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
  -- They already shared THEIR number with me on this connection: a swap, so mine is shown at once.
  mutual := exists (select 1 from phone_offers x where x.request_id = r.id and x.from_user_id = other and x.to_user_id = auth.uid() and x.status = 'accepted');
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
