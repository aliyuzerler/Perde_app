#!/usr/bin/env bash
# FAZ 10 (QA + güvenlik sertleştirme + mağaza hazırlık) — temel koşum:
# typecheck + lint + tüm testler (contracts/api/mobile, api gerçek PG) + build (api+admin).
# Tek çağrıda biter (sandbox arka plan süreçlerini öldürür); çıktı log dosyasına yazılır.
set -uo pipefail

ROOT=/home/z/my-project
export PATH="$HOME/.local/bin:$PATH"   # corepack user-bin: pnpm (entegrasyon spec'leri `pnpm exec prisma` çağırır)
API="$ROOT/apps/api"
OUT="$ROOT/scripts/qa-faz10-baseline-output.txt"
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
PSQL="$ROOT/scripts/qa-pg/psql.mjs"
QA_LIMITS="AUTH_RATE_LIMIT_REGISTER_MAX=100 AUTH_RATE_LIMIT_LOGIN_MAX=100 AUTH_RATE_LIMIT_RESET_MAX=100"

log() { echo "[faz10-baseline] $*"; }
FAIL=0

{
echo "==============================================================="
echo "FAZ 10 TEMEL KOŞUM — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "==============================================================="

# 0) Port temizliği (önceki oturum kalıntı süreçler)
for PORT in 3000 3002; do
  PIDS=$(ss -tlnp 2>/dev/null | grep ":${PORT} " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
  for P in $PIDS; do kill "$P" 2>/dev/null || true; done
done
sleep 1
pkill -9 -f "dist/main.js" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true

# 1) PostgreSQL (gömülü QA PG)
if ! node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1; then
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true; sleep 2
fi
node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1 && log "PostgreSQL hazır" || { log "PG AÇILAMADI"; exit 1; }

( cd "$API" && DATABASE_URL="$DB_URL" npx prisma migrate deploy >/dev/null 2>&1 ) && log "migration'lar güncel"

# 2) Typecheck
log "typecheck başlıyor (pnpm -r)"
if pnpm -r --if-present run typecheck 2>&1; then log "TYPECHECK: YEŞİL"; else log "TYPECHECK: KIRMIZI"; FAIL=1; fi

# 3) Lint
log "lint başlıyor (pnpm -r)"
if pnpm -r --if-present run lint 2>&1; then log "LINT: YEŞİL"; else log "LINT: KIRMIZI"; FAIL=1; fi

# 4) Contracts testleri
log "contracts testleri"
( cd "$ROOT/packages/contracts" && npx vitest run 2>&1 | tail -12 )
[ "${PIPESTATUS[0]}" = "0" ] && log "CONTRACTS: YEŞİL" || { log "CONTRACTS: KIRMIZI"; FAIL=1; }

# 5) API testleri (gerçek PG)
log "API testleri (vitest, gerçek PostgreSQL)"
# NOT: QA_LIMITS burada GEÇİLMEZ — faz3 429 spec'i varsayılan limitlerle test eder.
( cd "$API" && env DATABASE_URL="$DB_URL" npx vitest run 2>&1 | tail -20 )
[ "${PIPESTATUS[0]}" = "0" ] && log "API: YEŞİL" || { log "API: KIRMIZI"; FAIL=1; }

# 6) Mobil testleri
log "mobil testleri (jest-expo)"
( cd "$ROOT/apps/mobile" && npx jest 2>&1 | tail -12 )
[ "${PIPESTATUS[0]}" = "0" ] && log "MOBILE: YEŞİL" || { log "MOBILE: KIRMIZI"; FAIL=1; }

# 7) Build api
log "API production build (nest build)"
if ( cd "$API" && npx nest build 2>&1 | tail -5 ); then log "BUILD API: YEŞİL"; else log "BUILD API: KIRMIZI"; FAIL=1; fi

# 8) Build admin (production next build)
log "Admin production build (next build)"
if ( cd "$ROOT/apps/admin" && npx next build 2>&1 | tail -25 ); then log "BUILD ADMIN: YEŞİL"; else log "BUILD ADMIN: KIRMIZI"; FAIL=1; fi

echo "==============================================================="
if [ "$FAIL" = "0" ]; then echo "FAZ 10 TEMEL KOŞUM SONUCU: TÜMÜ YEŞİL"; else echo "FAZ 10 TEMEL KOŞUM SONUCU: KIRMIZI ADIM VAR"; fi
echo "==============================================================="
} 2>&1 | tee "$OUT"

exit ${PIPESTATUS[0]}
