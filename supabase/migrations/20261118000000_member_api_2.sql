-- Member API part 2 (Phase 2 adapter, 2026-10-29): the notification list and photo access.

-- Notifications with the announcement text members may read (announcements themselves are admin-only).
create or replace function get_notifications(p_limit int default 200) returns setof jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(n) || coalesce(jsonb_build_object('announcement', jsonb_build_object(
           'id', a.id, 'title', a.title, 'body', a.body, 'priority', a.priority, 'deepLink', a.deep_link, 'imageUrl', a.image_url)), '{}'::jsonb)
  from notifications n
  left join announcements a on a.id = n.announcement_id and a.status = 'published' and (a.expires_at is null or a.expires_at > now())
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 200);
$$;

-- Which of these photo paths may the caller see? Photos are private files at <owner-uid>/<id>.jpg.
-- Allowed: your own; anything for admins; otherwise only photos the privacy projection shows you
-- (photo visibility + consent), on a profile you can see (published, or someone you have a request with)
-- and nobody has blocked. The photo-urls Edge Function signs ONLY what this returns.
create or replace function photo_paths_for(p_paths text[]) returns setof text
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); admin boolean := is_admin(); x text; p profiles; o app_users;
begin
  if me is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if coalesce(array_length(p_paths, 1), 0) > 200 then raise exception 'validation' using errcode = '22023'; end if;
  foreach x in array coalesce(p_paths, '{}') loop
    continue when x is null or x !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$';
    if split_part(x, '/', 1) = me::text or admin then return next x; continue; end if;
    select * into p from profiles where user_id::text = split_part(x, '/', 1) and deleted_at is null;
    continue when p.id is null;
    select * into o from app_users where id = p.user_id;
    continue when o.deleted_at is not null or o.deactivated_at is not null or is_blocked_between(me, p);
    continue when p.status <> 'published' and not exists (
      select 1 from contact_requests r where (r.from_user_id = me and r.to_user_id = p.user_id) or (r.to_user_id = me and r.from_user_id = p.user_id));
    if (project_profile(p, me, false) -> 'photos') @> jsonb_build_array(jsonb_build_object('uri', x)) then return next x; end if;
  end loop;
end $$;

revoke all on function get_notifications(int) from public, anon;
grant execute on function get_notifications(int) to authenticated;
revoke all on function photo_paths_for(text[]) from public, anon;
grant execute on function photo_paths_for(text[]) to authenticated;
