-- Roman Urdu (owner request 2026-11-02): a fourth display language, 'ur-Latn' — Urdu written in English letters.
-- Only the allowed values of the existing app_users.language preference change: no new table or column,
-- and no profile data is touched. Push copy for 'ur-Latn' lives in the push-dispatch function.
alter table app_users drop constraint if exists app_users_language_check;
alter table app_users add constraint app_users_language_check check (language in ('en', 'ur', 'ur-Latn', 'te'));
