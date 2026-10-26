#!/usr/bin/env bash
# FAZ 7 kabul probe'u runner — üç sunucu yapılandırmasını sırayla kurar,
# probe'ları koşar, çıktıyı tek dosyaya yazar. (Sandbox dersi: arka plan
# süreçleri çağrı bitiminde temizlendiği için HER ŞEY tek koşumda biter.)
set -uo pipefail

ROOT=/home/z/my-project
API="$ROOT/apps/api"
OUT="$ROOT/scripts/qa-faz7-acceptance-output.txt"
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
HMAC_SECRET='faz7-qa-imza-sirri-0123456789'
RC_SECRET='faz7-qa-rc-webhook-sirri-012345678'
RC_DUMMY_KEY='sk_test_faz7qa_dummy_0123456789abcdef'

# QA ortamı: tek probe koşumu saniyeler içinde 10+ kayıt açar; kayıt
# hız sınırı (varsayılan 3/dk) QA'da gevşetilir (yalnız bu koşumun env'i).
QA_LIMITS="AUTH_RATE_LIMIT_REGISTER_MAX=100 AUTH_RATE_LIMIT_LOGIN_MAX=100 AUTH_RATE_LIMIT_RESET_MAX=100"

# Port temizliği: eski oturumlardan kalan dinleyiciler probe'u YANLIŞ
# sunucuya yönlendirir (bu koşumda yakalanan ortam tuzağı). Önce öldür.
for PORT in 3199 3198; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  if [ -n "$PIDS" ]; then
    echo "[runner] UYARI: port $PORT işgalci süreç(ler) kapatılıyor: $PIDS"
    for P in $PIDS; do kill "$P" 2>/dev/null || true; done
    sleep 1
    for P in $PIDS; do kill -9 "$P" 2>/dev/null || true; done
  fi
done

LOG_A=/tmp/faz7-qa-server-a.log
LOG_B=/tmp/faz7-qa-server-b.log

wait_health() {
  local url="$1" name="$2" i
  for i in $(seq 1 60); do
    if curl -fsS "$url/health" >/dev/null 2>&1; then
      echo "[runner] $name hazır (${i} deneme)"
      return 0
    fi
    sleep 0.5
  done
  echo "[runner] $name SAĞLIK BEKLENEMEDİ"
  return 1
}

stop_server() {
  local pidfile="$1" log="$2"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.3
    done
    kill -9 "$pid" 2>/dev/null || true
    rm -f "$pidfile"
  fi
  echo "---- sunucu günlüğü (son 15 satır): $log ----"
  tail -15 "$log" 2>/dev/null || true
}

: > "$OUT"
echo "FAZ 7 KABUL PROBE KOŞUMU — $(date -Iseconds)" | tee -a "$OUT"

# ===========================================================================
# FAZ A — BILLING_PROVIDER=none (simülasyon + HMAC genel zarf), port 3199
# ===========================================================================
echo "" | tee -a "$OUT"
echo "########## FAZ A: sağlayıcı=none, NODE_ENV=test, port 3199 ##########" | tee -a "$OUT"
(
  cd "$API" || exit 1
  env NODE_ENV=test \
    DATABASE_URL="$DB_URL" \
    WEBHOOK_SIGNING_SECRET="$HMAC_SECRET" \
    $QA_LIMITS \
    PORT=3199 \
    node dist/main.js > "$LOG_A" 2>&1 &
  echo $! > /tmp/faz7-qa-a.pid
)
if wait_health http://127.0.0.1:3199 "FAZ-A sunucusu"; then
  PROBE_PHASE=A PROBE_BASE_URL=http://127.0.0.1:3199 \
  PROBE_DB_URL="$DB_URL" WEBHOOK_SIGNING_SECRET="$HMAC_SECRET" \
  node "$API/scripts/qa-faz7-acceptance-probe.cjs" 2>&1 | tee -a "$OUT"
  PROBE_A_RC=${PIPESTATUS[0]}
else
  PROBE_A_RC=1
  tail -30 "$LOG_A" | tee -a "$OUT"
fi
stop_server /tmp/faz7-qa-a.pid "$LOG_A"

# ===========================================================================
# FAZ B — BILLING_PROVIDER=revenuecat (test anahtarları), port 3198
# ===========================================================================
echo "" | tee -a "$OUT"
echo "########## FAZ B: sağlayıcı=revenuecat (test anahtarları), port 3198 ##########" | tee -a "$OUT"
(
  cd "$API" || exit 1
  env NODE_ENV=test \
    DATABASE_URL="$DB_URL" \
    WEBHOOK_SIGNING_SECRET="$HMAC_SECRET" \
    BILLING_PROVIDER=revenuecat \
    REVENUECAT_SECRET_API_KEY="$RC_DUMMY_KEY" \
    REVENUECAT_WEBHOOK_AUTH_SECRET="$RC_SECRET" \
    $QA_LIMITS \
    PORT=3198 \
    node dist/main.js > "$LOG_B" 2>&1 &
  echo $! > /tmp/faz7-qa-b.pid
)
if wait_health http://127.0.0.1:3198 "FAZ-B sunucusu"; then
  PROBE_PHASE=B PROBE_BASE_URL=http://127.0.0.1:3198 \
  PROBE_DB_URL="$DB_URL" WEBHOOK_SIGNING_SECRET="$HMAC_SECRET" RC_WEBHOOK_SECRET="$RC_SECRET" \
  node "$API/scripts/qa-faz7-acceptance-probe.cjs" 2>&1 | tee -a "$OUT"
  PROBE_B_RC=${PIPESTATUS[0]}
else
  PROBE_B_RC=1
  tail -30 "$LOG_B" | tee -a "$OUT"
fi
stop_server /tmp/faz7-qa-b.pid "$LOG_B"

# ===========================================================================
# FAZ C — üretim savunma kanıtları (env şeması + sağlayıcı düzeyi)
# ===========================================================================
echo "" | tee -a "$OUT"
echo "########## FAZ C: üretim savunma kanıtları (env şeması + sağlayıcı) ##########" | tee -a "$OUT"
(
  cd "$API" || exit 1
  pnpm exec tsx scripts/qa-faz7-prod-refine-check.ts 2>&1
) | tee -a "$OUT"
PROBE_C_RC=${PIPESTATUS[0]}

echo "" | tee -a "$OUT"
echo "KOŞUM ÖZETİ: FAZ A=$PROBE_A_RC, FAZ B=$PROBE_B_RC, FAZ C=$PROBE_C_RC (0=başarılı)" | tee -a "$OUT"
if [ "$PROBE_A_RC" = "0" ] && [ "$PROBE_B_RC" = "0" ] && [ "$PROBE_C_RC" = "0" ]; then
  echo "KABUL PROBE: TÜMÜ GEÇTİ" | tee -a "$OUT"
  exit 0
fi
echo "KABUL PROBE: BAŞARISIZLIK VAR" | tee -a "$OUT"
exit 1
