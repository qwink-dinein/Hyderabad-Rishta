-- Separate migration: a new enum value can't be used in the same transaction that adds it.
alter type app_role add value if not exists 'master';
