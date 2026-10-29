-- Hot-path indexes (expert-team load pass, 2026-10-29).
-- Postgres does not index foreign keys on its own. These are the columns every member screen and every
-- RLS policy filters by (my requests, consents given to me, my orders, who blocked me, who shortlisted
-- me), plus the cascade paths used when an account or biodata is erased. Without them each of those
-- reads is a full-table scan that grows with the community.
create index if not exists contact_requests_from_user_idx on contact_requests (from_user_id, created_at desc);
create index if not exists contact_requests_to_user_idx on contact_requests (to_user_id, created_at desc);
create index if not exists contact_requests_from_profile_idx on contact_requests (from_profile_id);
create index if not exists contact_requests_to_profile_idx on contact_requests (to_profile_id);
create index if not exists contact_requests_pending_expiry_idx on contact_requests (expires_at) where status = 'pending';
create index if not exists consents_grantee_idx on consents (grantee_user_id, grantor_user_id);
create index if not exists consents_grantor_profile_idx on consents (grantor_profile_id);
create index if not exists blocks_blocked_profile_idx on blocks (blocked_profile_id);
create index if not exists shortlists_profile_idx on shortlists (profile_id);
create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_profile_idx on orders (profile_id);
create index if not exists phone_offers_request_idx on phone_offers (request_id);
create index if not exists phone_offers_to_user_idx on phone_offers (to_user_id);
create index if not exists reports_profile_idx on reports (profile_id);
create index if not exists reports_reporter_idx on reports (reporter_user_id);
create index if not exists view_events_viewer_idx on view_events (viewer_user_id);
create index if not exists boost_impressions_viewer_idx on boost_impressions (viewer_user_id, day);
create index if not exists announcement_deliveries_user_idx on announcement_deliveries (user_id);
