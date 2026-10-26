#!/usr/bin/env bash
# FAZ 5 QA orkestratörü — API'yi taze başlatır, probe'ları sırayla koşar.
# Not: rate limiter bellek içi olduğundan auth probe öncesi API restart edilir.
set -uo pipefail

API_DIR="/home/z/my-project/apps/api"
OUT_DIR="/home/z/my-project/scripts"
DB_URL="postgresql://perdego:perdego_dev_pass@localhost:5432/perdego?schema=public"
export PATH="$HOME/.local/bin:$PATH"

pids=()
cleanup() {
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null; done
  pkill -f "node dist/main.js" 2>/dev/null
}
trap cleanup EXIT

wait_health() {
  for _ in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w "%{http_code}" -m 2 http://localhost:3000/health 2>/dev/null)
    [ "$code" = "200" ] && return 0
    sleep 1
  done
  return 1
}

start_api() {
  (cd "$API_DIR" && DATABASE_URL="$DB_URL" PORT=3000 NODE_ENV=development \
    setsid node dist/main.js > "$OUT_DIR/qa-faz5-api.log" 2>&1 < /dev/null &)
}

echo "== [1/5] API taze başlatma =="
pkill -f "node dist/main.js" 2>/dev/null; sleep 2
start_api
if wait_health; then echo "API hazır (health 200)"; else echo "API BAŞLAMADI"; exit 1; fi

echo; echo "== [2/5] Katalog probe (P2C, 41 kontrol) =="
node /home/z/my-project/scripts/qa-faz2c-catalog-probe.mjs > "$OUT_DIR/qa-faz5-p2c-output.txt" 2>&1
P2C=$?
tail -3 "$OUT_DIR/qa-faz5-p2c-output.txt"
echo "P2C exit=$P2C"

echo; echo "== [3/5] API restart (login bütçesi) → FAZ 5 ek probe (F5) =="
pkill -f "node dist/main.js" 2>/dev/null; sleep 2
start_api
if wait_health; then echo "API hazır"; else echo "API RESTART BAŞARISIZ"; exit 1; fi
node /home/z/my-project/scripts/qa-faz5-extra-probe.mjs > "$OUT_DIR/qa-faz5-f5-output.txt" 2>&1
F5=$?
tail -3 "$OUT_DIR/qa-faz5-f5-output.txt"
echo "F5 exit=$F5"

echo; echo "== [4/5] API restart (rate limiter sıfırlama) → auth probe regresyon =="
pkill -f "node dist/main.js" 2>/dev/null; sleep 2
start_api
if wait_health; then echo "API hazır"; else echo "API RESTART BAŞARISIZ"; exit 1; fi
MAIL_OUTBOX_FILE="$API_DIR/.mail-outbox.jsonl" node /home/z/my-project/scripts/qa-faz3b-auth-probe.mjs > "$OUT_DIR/qa-faz5-auth-output.txt" 2>&1
AUTH=$?
tail -3 "$OUT_DIR/qa-faz5-auth-output.txt"
echo "AUTH exit=$AUTH"

echo; echo "== [5/5] Özet =="
for f in p2c f5 auth; do
  p=$(rg -c "^PASS" "$OUT_DIR/qa-faz5-$f-output.txt" 2>/dev/null || echo 0)
  fl=$(rg -c "^FAIL" "$OUT_DIR/qa-faz5-$f-output.txt" 2>/dev/null || echo 0)
  echo "$f: $p PASS, $fl FAIL"
done
