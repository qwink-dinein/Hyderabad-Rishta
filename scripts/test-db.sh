#!/usr/bin/env bash
# Applies the migration to a throwaway Postgres DB and runs the RLS/privacy tests.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${TEST_DB:-rishta_test}
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"; done
for t in supabase/tests/[1-9]*.test.sql; do psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$t" | grep PASSED; done
