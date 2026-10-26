#!/usr/bin/env bash
# FAZ 4 — mobil UI gerçek-API E2E koşumu (Expo web + Playwright).
# Metro EXPO_PUBLIC_MOCK_API=0 ile başlar; API + Metro + E2E tek çağrıda yaşar
# (sandbox arka plan süreçlerini çağrı sonunda temizlediği için betik kendi
# başına tam koşum sağlar).
set -uo pipefail

API_DIR="/home/z/my-project/apps/api"
MOBILE_DIR="/home/z/my-project/apps/mobile"
DB_URL="postgresql://perdego:perdego_dev_pass@localhost:5432/perdego?schema=public"

cleanup() {
  pkill -f "node dist/main.js" 2>/dev/null
  pkill -f "expo start" 2>/dev/null
  pkill -f "metro" 2>/dev/null
}
trap cleanup EXIT

echo "== [1/4] API başlat (MEDIA_PROCESSING_DELAY_MS=0) =="
pkill -f "node dist/main.js" 2>/dev/null; sleep 1
(cd "$API_DIR" && DATABASE_URL="$DB_URL" PORT=3000 NODE_ENV=development \
  MEDIA_PROCESSING_DELAY_MS=0 MEDIA_STORAGE_DIR=media-storage \
  MAIL_OUTBOX_FILE=/tmp/perdego-faz4-e2e-mail.jsonl \
  setsid node dist/main.js > /tmp/qa4-e2e-api.log 2>&1 < /dev/null &)
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 2 http://localhost:3000/health 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
curl -s http://localhost:3000/health | head -c 120; echo

echo; echo "== [2/4] Metro başlat (EXPO_PUBLIC_MOCK_API=0) =="
(cd "$MOBILE_DIR" && EXPO_PUBLIC_MOCK_API=0 EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 \
  CI=1 setsid npx expo start --web --port 8081 > /tmp/qa4-e2e-metro.log 2>&1 < /dev/null &)
metro_ok=0
for _ in $(seq 1 90); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 2 http://localhost:8081/ 2>/dev/null)
  if [ "$code" = "200" ]; then metro_ok=1; break; fi
  sleep 2
done
if [ "$metro_ok" = "1" ]; then echo "Metro hazır (8081, MOCK_API=0)"; else echo "METRO BAŞLAMADI"; tail -20 /tmp/qa4-e2e-metro.log; exit 1; fi

echo; echo "== [3/4] Playwright E2E koşumu =="
cd /home/z/my-project
python3 scripts/qa-faz4-ui-e2e.py
E2E=$?

echo; echo "== [4/4] Özet =="
python3 - <<'PY'
import json
try:
    data = json.load(open('/home/z/my-project/scripts/qa-faz4-results.json'))
except Exception as e:
    print("sonuç dosyası okunamadı:", e)
    raise SystemExit
p = sum(1 for r in data if r.get("status") == "PASS")
f = sum(1 for r in data if r.get("status") == "FAIL")
w = sum(1 for r in data if r.get("status") == "WARN")
print(f"UI E2E: {p} PASS, {f} FAIL, {w} WARN (toplam {len(data)})")
for r in data:
    if r.get("status") != "PASS":
        print(f"  {r['status']}: {r['step']} — {r.get('detail','')[:120]}")
PY
exit $E2E
