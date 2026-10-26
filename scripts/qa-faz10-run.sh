#!/usr/bin/env bash
# FAZ 10 kabul koşumu — güvenlik sertleştirme probe'u.
# Faz A (test ortamı) → Faz B (RC) → Faz C (varsayılan hız limitleri) → Faz D (üretim env kuralları)
# → log maskeleme denetimi. Tek çağrıda biter (sandbox arka plan süreci dersi).
set -uo pipefail

ROOT=/home/z/my-project
export PATH="$HOME/.local/bin:$PATH"
API="$ROOT/apps/api"
OUT="$ROOT/scripts/qa-faz10-security-output.txt"
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
PSQL="$ROOT/scripts/qa-pg/psql.mjs"
HMAC_SECRET='faz10-qa-imza-sirri-0123456789'
RC_SECRET='faz10-qa-rc-webhook-sirri-012345678'
RC_DUMMY='sk_test_faz10qa_dummy_0123456789abcdef'
QA_LIMITS="AUTH_RATE_LIMIT_REGISTER_MAX=100 AUTH_RATE_LIMIT_LOGIN_MAX=100 AUTH_RATE_LIMIT_RESET_MAX=100 AUTH_RATE_LIMIT_STEPUP_MAX=100"

log() { echo "[faz10-runner] $*"; }

for PORT in 3197 3196 3195; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for P in $PIDS; do kill "$P" 2>/dev/null || true; done
done
sleep 1
pkill -9 -f "dist/main.js" 2>/dev/null || true

if ! node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1; then
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true; sleep 2
fi
node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1 && log "PostgreSQL hazır" || { log "PG AÇILAMADI"; exit 1; }
( cd "$API" && DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null 2>&1 ) && log "migration'lar güncel"
( cd "$API" && DATABASE_URL="$DB_URL" npx prisma db seed >/dev/null 2>&1 ) && log "tohum (idempotent upsert) tamam"

wait_health() {
  local url="$1" name="$2" i
  for i in $(seq 1 60); do
    curl -fsS "$url/health" >/dev/null 2>&1 && { log "$name hazır ($i deneme)"; return 0; }
    sleep 0.5
  done
  log "$name SAĞLIK BEKLENEMEDİ"; return 1
}
stop_server() {
  local pidfile="$1" log="$2"
  [ -f "$pidfile" ] && { kill "$(cat "$pidfile")" 2>/dev/null || true; sleep 0.5; kill -9 "$(cat "$pidfile")" 2>/dev/null || true; rm -f "$pidfile"; }
  echo "---- sunucu günlüğü (son 8 satır): $log ----"
  tail -8 "$log" 2>/dev/null || true
}

: > "$OUT"
echo "FAZ 10 GÜVENLİK PROBE KOŞUMU — $(date -Iseconds)" | tee -a "$OUT"

# ─── Faz A: test ortamı ───
LOG_A=/tmp/faz10-qa-a.log
( cd "$API" && env NODE_ENV=test DATABASE_URL="$DB_URL" WEBHOOK_SIGNING_SECRET="$HMAC_SECRET" $QA_LIMITS PORT=3197 node dist/main.js >"$LOG_A" 2>&1 & echo $! > /tmp/faz10-a.pid )
RC_A=1
if wait_health http://127.0.0.1:3197 "Faz-A sunucusu"; then
  PROBE_PHASE=A PROBE_BASE_URL=http://127.0.0.1:3197/api/v1 PROBE_DB_URL="$DB_URL" \
  HMAC_SECRET="$HMAC_SECRET" node "$API/scripts/qa-faz10-security-probe.mjs" 2>&1 | tee -a "$OUT"
  RC_A=${PIPESTATUS[0]}
else
  tail -30 "$LOG_A" | tee -a "$OUT"
fi
stop_server /tmp/faz10-a.pid "$LOG_A"

# ─── Faz B: RevenueCat sağlayıcı ───
LOG_B=/tmp/faz10-qa-b.log
( cd "$API" && env NODE_ENV=test DATABASE_URL="$DB_URL" WEBHOOK_SIGNING_SECRET="$HMAC_SECRET" \
  BILLING_PROVIDER=revenuecat REVENUECAT_SECRET_API_KEY="$RC_DUMMY" \
  REVENUECAT_WEBHOOK_AUTH_SECRET="$RC_SECRET" REVENUECAT_API_BASE_URL="http://127.0.0.1:9" \
  $QA_LIMITS PORT=3196 node dist/main.js >"$LOG_B" 2>&1 & echo $! > /tmp/faz10-b.pid )
RC_B=1
if wait_health http://127.0.0.1:3196 "Faz-B sunucusu"; then
  PROBE_PHASE=B PROBE_BASE_URL=http://127.0.0.1:3196/api/v1 PROBE_DB_URL="$DB_URL" \
  HMAC_SECRET="$HMAC_SECRET" RC_WEBHOOK_SECRET="$RC_SECRET" node "$API/scripts/qa-faz10-security-probe.mjs" 2>&1 | tee -a "$OUT"
  RC_B=${PIPESTATUS[0]}
else
  tail -30 "$LOG_B" | tee -a "$OUT"
fi
stop_server /tmp/faz10-b.pid "$LOG_B"

# ─── Faz C: varsayılan hız limitleri (pencere 10 sn — koşum süresi kısalır) ───
LOG_C=/tmp/faz10-qa-c.log
( cd "$API" && env NODE_ENV=test DATABASE_URL="$DB_URL" WEBHOOK_SIGNING_SECRET="$HMAC_SECRET" \
  AUTH_RATE_LIMIT_WINDOW_SECONDS=10 PORT=3195 node dist/main.js >"$LOG_C" 2>&1 & echo $! > /tmp/faz10-c.pid )
RC_C=1
if wait_health http://127.0.0.1:3195 "Faz-C sunucusu"; then
  PROBE_PHASE=C PROBE_BASE_URL=http://127.0.0.1:3195/api/v1 PROBE_DB_URL="$DB_URL" \
  HMAC_SECRET="$HMAC_SECRET" node "$API/scripts/qa-faz10-security-probe.mjs" 2>&1 | tee -a "$OUT"
  RC_C=${PIPESTATUS[0]}
else
  tail -30 "$LOG_C" | tee -a "$OUT"
fi
stop_server /tmp/faz10-c.pid "$LOG_C"

# ─── Faz D: üretim env savunmaları (sağlayıcı düzeyi) ───
echo "" | tee -a "$OUT"
echo "########## Faz D: üretim env savunmaları ##########" | tee -a "$OUT"
( cd "$API" && pnpm exec tsx scripts/qa-faz7-prod-refine-check.ts 2>&1 ) | tee -a "$OUT"
RC_D=${PIPESTATUS[0]}

# ─── S12: log maskeleme denetimi ───
echo "" | tee -a "$OUT"
echo "########## S12: log maskeleme denetimi ##########" | tee -a "$OUT"
LEAKS=0
for SECRET in "Admin12345" "Dev12345" "Qa123456" "perdego_dev_pass" "$HMAC_SECRET" "$RC_SECRET" "BEGIN PRIVATE KEY" "Yanlis1Parola" "Yanlis6Parola"; do
  if grep -Fq "$SECRET" "$LOG_A" "$LOG_B" "$LOG_C" 2>/dev/null; then
    echo "  SIZINTI: '$SECRET' sunucu günlüğünde göründü" | tee -a "$OUT"
    LEAKS=1
  fi
done
# Webhook gövdesi/app_user_id loglanmamalı; hata mesajları olay kimliği taşır (kabul edilebilir).
[ "$LEAKS" = "0" ] && echo "  S12: PASS — parola/anahtar/gizli değer günlüklerde yok" | tee -a "$OUT"

echo "" | tee -a "$OUT"
echo "FAZ 10 KOŞUM SONUÇLARI: A=$RC_A B=$RC_B C=$RC_C D=$RC_D maske=$LEAKS" | tee -a "$OUT"
if [ "$RC_A" = "0" ] && [ "$RC_B" = "0" ] && [ "$RC_C" = "0" ] && [ "$RC_D" = "0" ] && [ "$LEAKS" = "0" ]; then
  echo "FAZ 10 GÜVENLİK KOŞUMU: TÜMÜ GEÇTİ" | tee -a "$OUT"
  exit 0
else
  echo "FAZ 10 GÜVENLİK KOŞUMU: KIRMIZI ADIM VAR" | tee -a "$OUT"
  exit 1
fi
