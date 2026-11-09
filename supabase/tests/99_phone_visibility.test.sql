\set ON_ERROR_STOP on
-- Owner 2026-11-09: a member's phone number is shown on their profile only if THEY chose "Everyone"
-- (privacy.phoneVisibility = 'public') or shared it with that family. Existing members (no setting) stay private.
reset role;
insert into auth.users (id, phone) values
 ('00000000-0000-0000-0000-0000000ff701', '919766700001'),
 ('00000000-0000-0000-0000-0000000ff702', '919766700002'),
 ('00000000-0000-0000-0000-0000000ff703', '919766700003');
insert into app_users (id, country_code, phone) values
 ('00000000-0000-0000-0000-0000000ff701', '+91', '9766700001'),
 ('00000000-0000-0000-0000-0000000ff702', '+91', '9766700002'),
 ('00000000-0000-0000-0000-0000000ff703', '+91', '9766700003');
insert into profiles (id, user_id, biodata, status, published_at) values
 ('ff700000-0000-0000-0000-0000000ff701', '00000000-0000-0000-0000-0000000ff701', '{"basic":{"lookingFor":"bride","fullName":"Public Groom"},"photos":[],"privacy":{"photoVisibility":"public","phoneVisibility":"public"}}', 'published', now()),
 ('ff700000-0000-0000-0000-0000000ff702', '00000000-0000-0000-0000-0000000ff702', '{"basic":{"lookingFor":"groom","fullName":"Private Bride"},"photos":[],"privacy":{"photoVisibility":"onConsent","phoneVisibility":"onConsent"}}', 'published', now()),
 ('ff700000-0000-0000-0000-0000000ff703', '00000000-0000-0000-0000-0000000ff703', '{"basic":{"lookingFor":"bride","fullName":"Old Groom"},"photos":[],"privacy":{"photoVisibility":"public"}}', 'published', now());
do $$ declare viewer uuid := '00000000-0000-0000-0000-0000000ff702'; begin
  assert (select project_profile(p, viewer) #>> '{contact,phone}' from profiles p where id = 'ff700000-0000-0000-0000-0000000ff701') = '9766700001', 'public number shown';
  assert (select project_profile(p, '00000000-0000-0000-0000-0000000ff701') -> 'contact' from profiles p where id = 'ff700000-0000-0000-0000-0000000ff702') is null, 'onConsent number hidden';
  assert (select project_profile(p, viewer) -> 'contact' from profiles p where id = 'ff700000-0000-0000-0000-0000000ff703') is null, 'existing member without a setting stays private';
  assert (select project_profile(p, viewer, false) -> 'contact' from profiles p where id = 'ff700000-0000-0000-0000-0000000ff701') is null, 'lists that exclude contact still exclude it';
end $$;
-- Only the two allowed values can be stored.
do $$ begin
  begin
    update profiles set biodata = jsonb_set(biodata, '{privacy,phoneVisibility}', '"everyone"') where id = 'ff700000-0000-0000-0000-0000000ff701';
    assert false, 'invalid phoneVisibility stored';
  exception when check_violation then null; end;
  begin
    update pricing_config set config = jsonb_set(config, '{privacyDefaults}', '{"groom":{"photo":"public","phone":"hidden"},"bride":{"photo":"onConsent","phone":"onConsent"}}');
    assert false, 'invalid privacy defaults stored';
  exception when check_violation then null; end;
end $$;
update pricing_config set config = jsonb_set(config, '{privacyDefaults}', '{"groom":{"photo":"public","phone":"public"},"bride":{"photo":"onConsent","phone":"onConsent"}}');
select 'ALL PHONE-VISIBILITY TESTS PASSED' as result;
