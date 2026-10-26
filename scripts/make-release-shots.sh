#!/usr/bin/env bash
# PerdeGo v1.0.0 — yayin ekran goruntuleri (Expo web + Playwright).
# API (3000) + Metro web (8081, MOCK_API=0) tek cagrida; sonunda temizlik.
set -uo pipefail

ROOT=/home/z/my-project
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
PSQL="$ROOT/scripts/qa-pg/psql.mjs"

log() { echo "[release-shots] $*"; }

cleanup() {
  log "temizlik"
  pkill -9 -f "node dist/main.js" 2>/dev/null
  pkill -9 -f "expo start" 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
}
trap cleanup EXIT

for PORT in 3000 8081; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for P in $PIDS; do kill "$P" 2>/dev/null || true; done
done
sleep 1

if ! node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1; then
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true; sleep 2
fi
node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1 && log "PostgreSQL hazir"

export PATH="$HOME/.local/bin:$PATH"
( cd "$ROOT/apps/api" && DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null 2>&1 )
( cd "$ROOT/apps/api" && DATABASE_URL="$DB_URL" npx prisma db seed >/dev/null 2>&1 )
log "migrate + seed tamam"

log "== [1/3] API baslat (3000) =="
( cd "$ROOT/apps/api" && DATABASE_URL="$DB_URL" PORT=3000 NODE_ENV=development \
  MEDIA_PROCESSING_DELAY_MS=0 MEDIA_STORAGE_DIR=media-storage \
  MAIL_OUTBOX_FILE=/tmp/perdego-release-shots-mail.jsonl \
  setsid node dist/main.js > /tmp/release-shots-api.log 2>&1 < /dev/null & )
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 2 http://localhost:3000/health 2>/dev/null)
  [ "$code" = "200" ] && break; sleep 1
done
curl -s http://localhost:3000/health | head -c 100; echo

log "== [2/3] Metro web baslat (8081, MOCK_API=0) =="
( cd "$ROOT/apps/mobile" && EXPO_PUBLIC_MOCK_API=0 EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 \
  CI=1 setsid npx expo start --web --port 8081 > /tmp/release-shots-metro.log 2>&1 < /dev/null & )
metro_ok=0
for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 2 http://localhost:8081/ 2>/dev/null)
  if [ "$code" = "200" ]; then metro_ok=1; break; fi; sleep 2
done
if [ "$metro_ok" = "1" ]; then log "Metro hazir"; else log "METRO BASLAMADI"; tail -20 /tmp/release-shots-metro.log; exit 1; fi

log "== [3/3] Playwright ekran goruntuleri =="
python3 "$ROOT/scripts/make-release-shots.py"
RC=$?
log "bitti (cikis: $RC)"
exit $RC
