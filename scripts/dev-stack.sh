#!/usr/bin/env bash
# PerdeGo — birleşik geliştirme yığını (FAZ 8).
#
# Sıra:
#   1) Gömülü PostgreSQL (scripts/qa-pg) ayakta değilse başlat
#   2) Migration'ları uygula (idempotent) + seed (idempotent, boşsa dolar)
#   3) NestJS API'yi 3002'de başlat (arka plan; log: /tmp/perdego-api.log)
#   4) Admin panelini 3000'de ÖN PLANDA çalıştır (sistemin dev sunucusu budur)
#
# Not: Sandbox DATABASE_URL=file:... dışarıdan sızmış olabilir; bu betik
# PostgreSQL URL'ini ZORLAR (dürüst ortam — yanlış DB'ye yazım olamaz).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/z/.local/bin:$PATH"
export DATABASE_URL="${DATABASE_URL:-postgresql://perdego:perdego_dev_pass@localhost:5432/perdego?schema=public}"
# Sandbox'ta DATABASE_URL=file:... export edilmişse override et:
case "$DATABASE_URL" in
  postgresql://*) ;;
  *) export DATABASE_URL="postgresql://perdego:perdego_dev_pass@localhost:5432/perdego?schema=public" ;;
esac

log() { echo "[dev-stack] $*"; }

# 1) PostgreSQL ---------------------------------------------------------------
if ! "$ROOT/scripts/qa-pg/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl" \
    -D "$ROOT/scripts/qa-pg/pgdata" status >/dev/null 2>&1; then
  log "PostgreSQL başlatılıyor…"
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true
fi
"$ROOT/scripts/qa-pg/node_modules/@embedded-postgres/linux-x64/native/bin/pg_ctl" \
  -D "$ROOT/scripts/qa-pg/pgdata" status >/dev/null 2>&1 && log "PostgreSQL hazır (127.0.0.1:5432)"

# perdego veritabanı yoksa oluştur
if ! node "$ROOT/scripts/qa-pg/psql.mjs" "$DATABASE_URL" "SELECT 1" >/dev/null 2>&1; then
  log "perdego veritabanı oluşturuluyor…"
  node "$ROOT/scripts/qa-pg/psql.mjs" \
    "postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/postgres" \
    "CREATE DATABASE perdego" >/dev/null 2>&1 || true
fi

# 2) Migration + seed (idempotent) ---------------------------------------------
log "Migration'lar uygulanıyor…"
(cd "$ROOT/apps/api" && npx prisma migrate deploy >/dev/null 2>&1) && log "Migration'lar güncel"
if ! node "$ROOT/scripts/qa-pg/psql.mjs" "$DATABASE_URL" "SELECT 1 FROM users LIMIT 1" >/dev/null 2>&1; then
  log "Seed çalıştırılıyor…"
  (cd "$ROOT/apps/api" && npx tsx prisma/seed.ts >/dev/null 2>&1) && log "Seed tamam (admin@perdego.dev / Admin12345)"
fi

# 3) API (3002) ----------------------------------------------------------------
if curl -sf http://127.0.0.1:3002/health >/dev/null 2>&1; then
  log "API zaten ayakta (3002)"
else
  log "API başlatılıyor (3002)…"
  (cd "$ROOT/apps/api" && DATABASE_URL="$DATABASE_URL" PORT=3002 \
    nohup npx nest start > /tmp/perdego-api.log 2>&1 &)
  for _ in $(seq 1 40); do
    curl -sf http://127.0.0.1:3002/health >/dev/null 2>&1 && break
    sleep 1
  done
  curl -sf http://127.0.0.1:3002/health >/dev/null 2>&1 \
    && log "API hazır (http://127.0.0.1:3002)" \
    || { log "HATA: API ayağa kalkmadı — /tmp/perdego-api.log"; tail -20 /tmp/perdego-api.log; }
fi

# 4) Admin paneli (3000, ön plan) ----------------------------------------------
# Port zaten hizmet veriyorsa çift başlatma yapma: ön planda bekle (sistem
# dev sürecinin canlı kalması için).
if curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1; then
  log "Admin paneli zaten ayakta (3000) — ön planda bekleniyor"
  exec tail -f /dev/null
fi

log "Admin paneli başlatılıyor (3000)…"
cd "$ROOT/apps/admin"
exec npx next dev -p 3000
