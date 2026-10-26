#!/usr/bin/env bash
# FAZ 7 canlı probe koşum betiği (geliştirme kanıtı).
# Kullanım: bash scripts/qa-faz7-run-probe.sh
# Önkul: PostgreSQL çalışıyor + perdego_faz7_test migrate+seed edilmiş
#        (apps/api entegrasyon testleri bunu otomatik yapar) + pnpm build tamamlanmış.
set -euo pipefail
cd "$(dirname "$0")/../apps/api"

export NODE_ENV=test
export DATABASE_URL="postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego_faz7_test"
export WEBHOOK_SIGNING_SECRET="faz7-probe-imza-sirri-0123456789"
export PORT=3199

node dist/main.js > /home/z/my-project/scripts/qa-faz7-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

sleep 6
node scripts/qa-faz7-live-probe.cjs > /home/z/my-project/scripts/qa-faz7-live-probe-output.txt 2>&1
echo "PROBE_EXIT=$?"
tail -100 /home/z/my-project/scripts/qa-faz7-live-probe-output.txt
