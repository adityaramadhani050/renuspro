#!/usr/bin/env bash
# ============================================================================
# Verifikasi seluruh migrasi dengan menjalankannya pada database bersih.
#
#   ./tools/verify-schema.sh                 # pakai PGHOST/PGPORT dari env
#   PGPORT=5433 ./tools/verify-schema.sh
#
# Berhenti pada error pertama (ON_ERROR_STOP) supaya kegagalan tidak lolos.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
DB="${VERIFY_DB:-renuspro_verify}"

export PGHOST PGPORT PGUSER

echo "▸ Membuat ulang database $DB"
psql -q -d postgres -c "drop database if exists $DB;" >/dev/null
psql -q -d postgres -c "create database $DB;"          >/dev/null

echo "▸ Memasang stub auth (lokal saja)"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$ROOT/supabase/tests/00_local_stubs.sql" >/dev/null

echo "▸ Menjalankan migrasi"
for f in "$ROOT"/supabase/migrations/*.sql; do
  printf '  %s ... ' "$(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
  echo "ok"
done

echo "▸ Menjalankan tes"
for f in "$ROOT"/supabase/tests/[1-9]*.sql; do
  [ -e "$f" ] || continue
  printf '  %s ... ' "$(basename "$f")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
  echo "ok"
done

echo
echo "▸ Ringkasan objek"
psql -q -d "$DB" -c "
  select
    (select count(*) from pg_tables  where schemaname = 'public') as tabel,
    (select count(*) from pg_views   where schemaname = 'public') as view,
    (select count(*) from pg_indexes where schemaname = 'public') as indeks,
    (select count(*) from pg_policies where schemaname = 'public') as policy_rls,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public') as fungsi;
"

echo "✓ Semua migrasi berhasil dijalankan pada database bersih."
