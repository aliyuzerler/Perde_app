#!/usr/bin/env bash
# FAZ 9 kabul koşumu — bildirim altyapısı uçtan uca.
# PG → API (PUSH_PROVIDER=simulated) → abonelik ekleme → probe → DB denetimi → teardown.
set -uo pipefail

ROOT=/home/z/my-project
API="$ROOT/apps/api"
OUT="$ROOT/scripts/qa-faz9-acceptance-output.txt"
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
PSQL="$ROOT/scripts/qa-pg/psql.mjs"
QA_LIMITS="AUTH_RATE_LIMIT_REGISTER_MAX=100 AUTH_RATE_LIMIT_LOGIN_MAX=100 AUTH_RATE_LIMIT_RESET_MAX=100"

log() { echo "[faz9-runner] $*"; }

# 0) Port temizliği
for PORT in 3000 3002; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for P in $PIDS; do kill "$P" 2>/dev/null || true; done
done
sleep 1
for PORT in 3000 3002; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for P in $PIDS; do kill -9 "$P" 2>/dev/null || true; done
done
pkill -9 -f "dist/main.js" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true

# 1) PostgreSQL
if ! node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1; then
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true; sleep 2
fi
node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1 && log "PostgreSQL hazır" || { log "PG AÇILAMADI"; exit 1; }

( cd "$API" && DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null 2>&1 ) && log "migration'lar güncel"

# 2) Hatırlatma testi için viewer'a 2 gün sonra biten aktif abonelik
# 2b) Önceki koşum kalıntılarının temizliği (deterministik probe):
# qa9 test bildirimleri/cihazları/içerikleri + eski hatırlatma abonelikleri.
node "$PSQL" "$DB_URL" "DELETE FROM notification_sends WHERE \"notificationId\" IN (SELECT n.id FROM notifications n LEFT JOIN contents c ON c.id = (n.\"dataJson\"->>'contentId') WHERE n.\"dedupKey\" LIKE 'SUB_REMINDER:qa9-reminder-sub-%' OR c.slug LIKE 'qa9-%' OR n.\"dataJson\"->>'campaignId' IN (SELECT id FROM notification_campaigns WHERE \"titleTr\" LIKE 'QA9%'))" >/dev/null 2>&1 || true
node "$PSQL" "$DB_URL" "DELETE FROM notifications WHERE \"dedupKey\" LIKE 'SUB_REMINDER:qa9-reminder-sub-%' OR \"dedupKey\" LIKE 'EP_PUBLISHED:%' OR \"dedupKey\" LIKE 'TITLE_PUBLISHED:%' OR \"dedupKey\" LIKE 'PURCHASE:%' OR \"dataJson\"->>'campaignId' IN (SELECT id FROM notification_campaigns WHERE \"titleTr\" LIKE 'QA9%') OR (\"dataJson\"->>'contentId') IN (SELECT id FROM contents WHERE slug LIKE 'qa9-%')" >/dev/null 2>&1 || true
node "$PSQL" "$DB_URL" "DELETE FROM devices WHERE \"pushToken\" LIKE 'ExponentPushToken[qa9-%' OR \"pushToken\" LIKE 'ExponentPushToken[invalid-qa9-%'" >/dev/null 2>&1 || true
node "$PSQL" "$DB_URL" "DELETE FROM notification_campaigns WHERE \"titleTr\" LIKE 'QA9%'" >/dev/null 2>&1 || true
node "$PSQL" "$DB_URL" "DELETE FROM episodes WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa9-%')" >/dev/null 2>&1 || true
node "$PSQL" "$DB_URL" "DELETE FROM seasons WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa9-%')" >/dev/null 2>&1 || true
node "$PSQL" "$DB_URL" "DELETE FROM favorites WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa9-%')" >/dev/null 2>&1 || true
node "$PSQL" "$DB_URL" "DELETE FROM contents WHERE slug LIKE 'qa9-%'" >/dev/null 2>&1 || true
log "önceki koşum kalıntıları temizlendi"

SUB_SEED=$(node "$ROOT/scripts/qa-faz9-subscription-seed.mjs" "$DB_URL" 2>&1 || true)
echo "$SUB_SEED" | grep -q '"ok":true' && log "hatırlatma aboneliği eklendi (viewer, +2 gün)" || log "UYARI: abonelik eklenemedi: $SUB_SEED"


# 3) API (PUSH_PROVIDER=simulated — sahte başarı yok; simüle sağlayıcı bilet üretir,
#    geçersiz token'ı DeviceNotRegistered ile reddeder; prod'da env refine engeller)
LOG_API=/tmp/faz9-qa-api.log
( cd "$API" && env DATABASE_URL="$DB_URL" PUSH_PROVIDER=simulated $QA_LIMITS node dist/main.js >"$LOG_API" 2>&1 & echo $! > /tmp/faz9-qa-api.pid )
for _ in $(seq 1 60); do
  curl -fsS "http://127.0.0.1:3002/health" >/dev/null 2>&1 && { log "API (3002) hazır"; break; }
  sleep 0.5
done
curl -fsS "http://127.0.0.1:3002/health" >/dev/null 2>&1 || { log "API AÇILAMADI"; tail -20 "$LOG_API"; exit 1; }

# 4) Probe
log "kabul probe'u başlıyor…"
node "$ROOT/scripts/qa-faz9-acceptance-probe.mjs"
PROBE_RC=$?

# 5) DB denetimi
log "DB denetim sorguları…"
{
  echo ""
  echo "──── DB DENETİMİ (PostgreSQL) ────"
  echo "-- [D1] son 15 dk bildirim türleri:"
  node "$PSQL" "$DB_URL" "SELECT type, count(*)::int AS adet FROM notifications WHERE \"createdAt\" > now() - interval '15 minutes' GROUP BY type ORDER BY type"
  echo "-- [D2] gönderim izleri (durum x sağlayıcı):"
  node "$PSQL" "$DB_URL" "SELECT status, provider, count(*)::int AS adet FROM notification_sends WHERE \"createdAt\" > now() - interval '15 minutes' GROUP BY status, provider ORDER BY status"
  echo "-- [D3] geçersiz işaretli cihazlar (DeviceNotRegistered → invalidAt):"
  node "$PSQL" "$DB_URL" "SELECT \"invalidReason\", count(*)::int AS adet FROM devices WHERE \"invalidAt\" IS NOT NULL AND \"pushToken\" LIKE '%qa9%' GROUP BY 1"
  echo "-- [D4] dedupKey tekilleştirme kanıtı (EP_PUBLISHED, kullanıcı başına 1):"
  node "$PSQL" "$DB_URL" "SELECT \"dedupKey\", count(*)::int AS adet FROM notifications WHERE \"dedupKey\" LIKE 'EP_PUBLISHED:%' GROUP BY \"dedupKey\" HAVING count(*) > 1"
  echo "-- [D5] hatırlatma bildirimleri:"
  node "$PSQL" "$DB_URL" "SELECT \"dedupKey\", count(*)::int AS adet FROM notifications WHERE \"dedupKey\" LIKE 'SUB_REMINDER:%' GROUP BY \"dedupKey\" ORDER BY \"dedupKey\" DESC LIMIT 3"
} 2>&1

# 6) Teardown
P=$(cat /tmp/faz9-qa-api.pid 2>/dev/null || true)
[ -n "$P" ] && { kill "$P" 2>/dev/null || true; sleep 0.4; kill -9 "$P" 2>/dev/null || true; rm -f /tmp/faz9-qa-api.pid; }
pkill -9 -f "dist/main.js" 2>/dev/null || true
# Test aboneliklerini temizle
node "$PSQL" "$DB_URL" "DELETE FROM subscriptions WHERE id LIKE 'qa9-reminder-sub-%'" >/dev/null 2>&1 || true

log "bitti (probe çıkışı: $PROBE_RC)"
exit $PROBE_RC
