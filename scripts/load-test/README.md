# Load test (safe copy only — never point this at the live project)

Simulates members using the app at the same time against a **local** Postgres that has all migrations applied:
open Discover (feed context, search, featured, save state, impressions), view profiles, shortlist,
send interests (some with a number offer), accept/decline, share numbers, notifications, activity —
plus one admin opening the console. Every call runs as role `authenticated` with the member's id, like PostgREST.

```bash
createdb rishta_load
psql -d rishta_load -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -q -d rishta_load -f "$f"; done
psql -d rishta_load -v n=5000 -f scripts/load-test/seed.sql      # n members, ids 00000000-0000-4000-8000-<hex>
npm i --prefix /tmp/lt pg@8 && NODE_PATH=/tmp/lt/node_modules \
  PGPASSWORD=... node scripts/load-test/load.mjs 5000 60 50          # members, seconds, at-once
```

Results of 2 Nov 2026 (4-CPU test machine, app and database on the same box):

| Members | At once | Calls/s | Discover search typical / slow (p50 / p95) | Errors |
|---|---|---|---|---|
| 150 | 50 | 1,270 | 59 / 99 ms | 0 real (only rule refusals: duplicate interest, declined recently) |
| 5,000 (before fix) | 50 | 876 | 205 / 334 ms | 0 real |
| 5,000 (after 20261130) | 50 | 1,203 | 84 / 137 ms | 0 real |
