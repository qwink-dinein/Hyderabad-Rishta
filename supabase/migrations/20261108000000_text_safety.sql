-- Security round 2 (owner request 2026-10-28: "try to break the security and fix it").
-- Invisible characters can spoof what a member reads: bidi overrides/isolates make "evil.com" display
-- as "moc.live" in a name or message, zero-width spaces dodge word filters, control codes break UIs.
-- ZWNJ/ZWJ (U+200C/D) and LRM/RLM (U+200E/F) stay allowed: Urdu and Telugu need them.
-- Twin of UNSAFE_TEXT in src/domain/security.ts.

create or replace function text_is_safe(t text) returns boolean language sql immutable as $$
  select t is null or t !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‪-‮⁠-⁤⁦-⁩﻿￹-￻]';
$$;
grant execute on function text_is_safe(text) to authenticated;

-- Every string anywhere in the biodata (JSON text keeps these characters literally, except control
-- codes, which jsonb stores escaped as \u00XX — checked separately).
create or replace function biodata_text_safe(b jsonb) returns boolean language sql immutable as $$
  select text_is_safe((b - 'photos')::text) and (b - 'photos')::text !~ '\\u00(0[0-8bcef]|1[0-9a-f]|7f|[89][0-9a-f])';
$$;
grant execute on function biodata_text_safe(jsonb) to authenticated;
-- NOT VALID: old rows are left alone; every new insert/update is checked.
alter table profiles add constraint biodata_text_safe check (biodata_text_safe(biodata)) not valid;

-- Interest messages and report details: strip rather than refuse (send_request already strips C0).
create or replace function trg_strip_unsafe() returns trigger language plpgsql as $$
begin
  if tg_table_name = 'contact_requests' then
    new.message := nullif(regexp_replace(new.message, '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‪-‮⁠-⁤⁦-⁩﻿￹-￻]', '', 'g'), '');
  else
    new.details := nullif(regexp_replace(new.details, '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​‪-‮⁠-⁤⁦-⁩﻿￹-￻]', '', 'g'), '');
  end if;
  return new;
end $$;
drop trigger if exists contact_requests_strip_unsafe on contact_requests;
create trigger contact_requests_strip_unsafe before insert or update of message on contact_requests for each row execute function trg_strip_unsafe();
drop trigger if exists reports_strip_unsafe on reports;
create trigger reports_strip_unsafe before insert or update of details on reports for each row execute function trg_strip_unsafe();
