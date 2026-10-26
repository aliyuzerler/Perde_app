#!/usr/bin/env bash
# FAZ 6 güvenlik probe koşumu — API'yi TTL=60 ile başlatır, probe'u koşar, kapatır.
# Sandbox arka plan süreçlerini temizlediği için TÜM akış tek çağrıda yürür.
set -uo pipefail
cd /home/z/my-project/apps/api

export NODE_ENV=development
export DATABASE_URL="postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public"
export MAIL_OUTBOX_FILE=/tmp/perdego-faz6-probe-mail.jsonl
export MEDIA_PROCESSING_DELAY_MS=0
export MEDIA_STORAGE_DIR=media-storage
export PORT=4572
export PLAYBACK_TTL_SECONDS=60

# fallback sırrı (forge testi): perdego-dev-playback-<DATABASE_URL son 24 karakter>
export MEDIA_FALLBACK_SECRET="perdego-dev-playback-${DATABASE_URL: -24}"

DATABASE_URL="$DATABASE_URL" pnpm exec prisma migrate deploy >/dev/null 2>&1
DATABASE_URL="$DATABASE_URL" pnpm exec tsx prisma/seed.ts >/dev/null 2>&1

node dist/main.js > /tmp/perdego-faz6-api.log 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT
for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:4572/health >/dev/null 2>&1 && break
  sleep 0.5
done

node /home/z/my-project/scripts/qa-faz6-security-probe.mjs
PROBE_EXIT=$?
exit $PROBE_EXIT
