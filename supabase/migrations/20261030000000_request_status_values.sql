-- Separate migration: new enum values can't be used in the transaction that adds them.
alter type request_status add value if not exists 'expired';
alter type request_status add value if not exists 'blocked';
