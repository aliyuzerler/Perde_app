#!/usr/bin/env bash
# FAZ 8 kabul koşumu — Admin Panel uçtan uca.
# Sandbox dersi: arka plan süreçleri çağrı bitiminde temizlendiği için
# PG + API + admin production + probe + DB denetimi TEK koşumda biter.
set -uo pipefail

ROOT=/home/z/my-project
API="$ROOT/apps/api"
ADMIN="$ROOT/apps/admin"
OUT="$ROOT/scripts/qa-faz8-acceptance-output.txt"
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
PSQL="$ROOT/scripts/qa-pg/psql.mjs"

log() { echo "[faz8-runner] $*"; }

# QA ortamı: probe koşumu 10+ giriş yapar; auth hız sınırı (varsayılan 5/dk)
# QA'da gevşetilir (yalnız bu koşumun env'i). 429 davranışının kendisi zaten
# ayrı bir koşumda kanıtlandı (FAZ 3b). Not: prod davranışı değişmez.
QA_LIMITS="AUTH_RATE_LIMIT_REGISTER_MAX=100 AUTH_RATE_LIMIT_LOGIN_MAX=100 AUTH_RATE_LIMIT_RESET_MAX=100"

# 0) Port temizliği — bayat dinleyiciler probe'u YANLIŞ sunucuya yönlendirir.
for PORT in 3000 3002; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  if [ -n "$PIDS" ]; then
    log "UYARI: port $PORT işgalci süreç(ler) kapatılıyor: $PIDS"
    for P in $PIDS; do kill "$P" 2>/dev/null || true; done
    sleep 1
    for P in $PIDS; do kill -9 "$P" 2>/dev/null || true; done
  fi
done
pkill -9 -f "next-server" 2>/dev/null || true
sleep 1

# 1) PostgreSQL -------------------------------------------------------------
if ! node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1; then
  log "PostgreSQL başlatılıyor…"
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true
  sleep 2
fi
node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1 && log "PostgreSQL hazır" || { log "PostgreSQL AÇILAMADI"; exit 1; }

# 2) Migration'lar güncel mi ------------------------------------------------
( cd "$API" && DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null 2>&1 ) && log "migration'lar güncel"

# 3) Sunucular --------------------------------------------------------------
LOG_API=/tmp/faz8-qa-api.log
LOG_ADM=/tmp/faz8-qa-admin.log
( cd "$API" && env DATABASE_URL="$DB_URL" $QA_LIMITS node dist/main.js >"$LOG_API" 2>&1 & echo $! > /tmp/faz8-qa-api.pid )
wait_up() { # url name
  for _ in $(seq 1 60); do
    curl -fsS "$1" >/dev/null 2>&1 && { log "$2 hazır"; return 0; }
    sleep 0.5
  done
  log "$2 SAĞLIK BEKLENEMEDİ"; return 1
}
wait_up "http://127.0.0.1:3002/health" "API (3002)" || { tail -20 "$LOG_API"; exit 1; }

( cd "$ADMIN" && "$ROOT/node_modules/.bin/next" start -p 3000 >"$LOG_ADM" 2>&1 & echo $! > /tmp/faz8-qa-admin.pid )
for _ in $(seq 1 60); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/login || true)
  [ "$CODE" = "200" ] && { log "Admin production (3000) hazır"; break; }
  sleep 0.5
done
[ "${CODE:-}" = "200" ] || { log "ADMIN AÇILAMADI"; tail -20 "$LOG_ADM"; exit 1; }
curl -fsS "http://127.0.0.1:3000/health" >/dev/null 2>&1 && log "panel→API proxy köprüsü sağlıklı"

# 4) Probe ------------------------------------------------------------------
log "kabul probe'u başlıyor…"
node "$ROOT/scripts/qa-faz8-acceptance-probe.mjs"
PROBE_RC=$?

# 5) DB denetim sorguları ---------------------------------------------------
log "DB denetim sorguları…"
{
  echo ""
  echo "──── DB DENETİMİ (PostgreSQL) ────"
  echo "-- [D1] bugünkü audit log eylem dağılımı (probe izleri):"
  node "$PSQL" "$DB_URL" "SELECT action, count(*)::int AS adet FROM audit_logs WHERE \"createdAt\" > now() - interval '15 minutes' GROUP BY action ORDER BY action"
  echo "-- [D2] bugünkü kampanyalar + bildirim satırları (dispatch izi):"
  node "$PSQL" "$DB_URL" "SELECT status, \"recipientCount\", \"failedCount\", \"scheduledFor\" IS NOT NULL AS planli FROM notification_campaigns WHERE \"createdAt\" > now() - interval '15 minutes' ORDER BY \"createdAt\""
  node "$PSQL" "$DB_URL" "SELECT count(*)::int AS bildirim_satiri FROM notifications WHERE \"createdAt\" > now() - interval '15 minutes'"
  echo "-- [D3] admin kredi düzeltmesi ledger izi (probe +5, ADMIN_ADJUSTMENT):"
  node "$PSQL" "$DB_URL" "SELECT type, \"grantedDelta\", \"referenceType\", note FROM credit_ledger WHERE \"referenceType\"='ADMIN_ADJUSTMENT' AND \"createdAt\" > now() - interval '15 minutes' ORDER BY \"createdAt\" DESC LIMIT 3"
  echo "-- [D4] probe içerikleri DB'de:"
  node "$PSQL" "$DB_URL" "SELECT slug, kind, status FROM contents WHERE slug LIKE 'qa8-%' ORDER BY slug"
  node "$PSQL" "$DB_URL" "SELECT e.\"episodeNumber\", e.\"accessType\", e.\"creditCost\", e.status FROM episodes e JOIN contents c ON c.id=e.\"contentId\" WHERE c.slug LIKE 'qa8-dizi-%' ORDER BY e.\"episodeNumber\""
} 2>&1

# 6) Teardown ---------------------------------------------------------------
for PIDFILE in /tmp/faz8-qa-admin.pid /tmp/faz8-qa-api.pid; do
  if [ -f "$PIDFILE" ]; then
    P=$(cat "$PIDFILE"); kill "$P" 2>/dev/null || true; sleep 0.5; kill -9 "$P" 2>/dev/null || true; rm -f "$PIDFILE"
  fi
done
pkill -9 -f "dist/main.js" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true

log "bitti (probe çıkışı: $PROBE_RC)"
exit $PROBE_RC
