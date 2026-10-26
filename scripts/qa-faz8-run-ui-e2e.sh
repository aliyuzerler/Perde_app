#!/usr/bin/env bash
# FAZ 8 UI E2E koşumu — production admin (3000) + API (3002) tek çağrıda.
set -uo pipefail
ROOT=/home/z/my-project
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
PSQL="$ROOT/scripts/qa-pg/psql.mjs"
QA_LIMITS="AUTH_RATE_LIMIT_REGISTER_MAX=100 AUTH_RATE_LIMIT_LOGIN_MAX=100 AUTH_RATE_LIMIT_RESET_MAX=100"

log() { echo "[faz8-ui-runner] $*"; }

for PORT in 3000 3002; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for P in $PIDS; do kill "$P" 2>/dev/null || true; done
done
sleep 1
for PORT in 3000 3002; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for P in $PIDS; do kill -9 "$P" 2>/dev/null || true; done
done
pkill -9 -f "next-server" 2>/dev/null || true

if ! node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1; then
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true; sleep 2
fi
node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1 && log "PostgreSQL hazır"

LOG_API=/tmp/faz8-ui-api.log
LOG_ADM=/tmp/faz8-ui-admin.log
( cd "$ROOT/apps/api" && env DATABASE_URL="$DB_URL" $QA_LIMITS node dist/main.js >"$LOG_API" 2>&1 & echo $! > /tmp/faz8-ui-api.pid )
for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:3002/health >/dev/null 2>&1 && break; sleep 0.5; done
log "API hazır"
( cd "$ROOT/apps/admin" && "$ROOT/node_modules/.bin/next" start -p 3000 >"$LOG_ADM" 2>&1 & echo $! > /tmp/faz8-ui-admin.pid )
for _ in $(seq 1 60); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/login || true)
  [ "$CODE" = "200" ] && break; sleep 0.5
done
log "Admin production hazır"

python3 "$ROOT/scripts/qa-faz8-ui-e2e.py"
RC=$?

for PIDFILE in /tmp/faz8-ui-admin.pid /tmp/faz8-ui-api.pid; do
  [ -f "$PIDFILE" ] && { P=$(cat "$PIDFILE"); kill "$P" 2>/dev/null || true; sleep 0.4; kill -9 "$P" 2>/dev/null || true; rm -f "$PIDFILE"; }
done
pkill -9 -f "dist/main.js" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
log "bitti (e2e çıkışı: $RC)"
exit $RC
