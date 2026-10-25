#!/usr/bin/env bash
# FAZ-3 QA: temiz veritabanindaki kisi envanteri (FK / unique / index / check / enum).
# Kullanim: bash scripts/qa-faz3-db-probe.sh <DATABASE_URL> [psql.mjs-yolu]
set -euo pipefail
URL="${1:?DATABASE_URL gerekli}"
PSQL_MJS="${2:-scripts/qa-pg/psql.mjs}"

run() {
  node "$PSQL_MJS" "$URL" "$1"
}

echo "=== TABLO SAYISI ==="
run "SELECT count(*) AS tablo FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"

echo "=== ENUM TIPLERI ==="
run "SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS degerler FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY t.typname ORDER BY t.typname;"

echo "=== FOREIGN KEY KISITLARI (sira ON UPDATE/ON DELETE) ==="
run "SELECT conrelid::regclass AS tablo, conname, pg_get_constraintdef(oid) AS tanim FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace ORDER BY conrelid::regclass::text, conname;"

echo "=== UNIQUE KISITLAR ==="
run "SELECT conrelid::regclass AS tablo, conname, pg_get_constraintdef(oid) AS tanim FROM pg_constraint WHERE contype='u' AND connamespace='public'::regnamespace ORDER BY conrelid::regclass::text, conname;"

echo "=== CHECK KISITLARI ==="
run "SELECT conrelid::regclass AS tablo, conname, pg_get_constraintdef(oid) AS tanim FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace AND conrelid::regclass::text NOT LIKE 'pg_%' ORDER BY conrelid::regclass::text, conname;"

echo "=== PRIMARY KEY ==="
run "SELECT conrelid::regclass AS tablo, conname FROM pg_constraint WHERE contype='p' AND connamespace='public'::regnamespace ORDER BY 1;"

echo "=== INDEXLER (PK/unique haric, kismi dahil) ==="
run "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname;"

echo "=== APPEND-ONLY KORUMASI: credit_ledger tetikleyicileri ==="
run "SELECT tgname, tgrelid::regclass::text AS tablo, pg_get_triggerdef(oid) AS tanim FROM pg_trigger WHERE tgrelid='credit_ledger'::regclass AND NOT tgisinternal ORDER BY tgname;"
