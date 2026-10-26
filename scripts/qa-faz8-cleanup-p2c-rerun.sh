#!/usr/bin/env bash
# QA test verisi temizliği + P2C regresyon tekrarı (tek çağrı).
set -uo pipefail
ROOT=/home/z/my-project
DB_URL='postgresql://perdego:perdego_dev_pass@127.0.0.1:5432/perdego?schema=public'
PSQL="$ROOT/scripts/qa-pg/psql.mjs"
log() { echo "[faz8-cleanup] $*"; }

# 0) port temizliği
PIDS=$(ss -tlnp 2>/dev/null | grep ":3002 " | grep -oP 'pid=\K[0-9]+' | sort -u || true)
for P in $PIDS; do kill "$P" 2>/dev/null || true; done
sleep 1

if ! node "$PSQL" "$DB_URL" "SELECT 1" >/dev/null 2>&1; then
  bash "$ROOT/scripts/qa-pg/setup-pg.sh" >/dev/null 2>&1 || true; sleep 2
fi

# 1) QA içeriklerini sil (katalog sıralamasını bozuyorlardı — P2C-18 pollution'u)
#    FK silme kuralı Restrict olan tablolar ÖNCE silinir:
#    watch_history (content+episode Restrict), playback_sessions ve
#    episode_unlocks (episode Restrict); bildirim satırları dataJson ile bağlı.
#    Gerisi (favorites, home_section_items, content_categories, episode_media,
#    media_text_tracks, content_cast) onDelete: Cascade ile kendiliğinden gider.
log "qa8-* ve qa9-* test içerikleri siliniyor…"
node "$PSQL" "$DB_URL" "DELETE FROM notification_sends WHERE \"notificationId\" IN (SELECT id FROM notifications WHERE (\"dataJson\"->>'contentId') IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%'))"
node "$PSQL" "$DB_URL" "DELETE FROM notifications WHERE (\"dataJson\"->>'contentId') IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%')"
node "$PSQL" "$DB_URL" "DELETE FROM watch_history WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%') OR \"episodeId\" IN (SELECT id FROM episodes WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%'))"
node "$PSQL" "$DB_URL" "DELETE FROM playback_sessions WHERE \"episodeId\" IN (SELECT id FROM episodes WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%'))"
node "$PSQL" "$DB_URL" "DELETE FROM episode_unlocks WHERE \"episodeId\" IN (SELECT id FROM episodes WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%'))"
node "$PSQL" "$DB_URL" "DELETE FROM episodes WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%')"
node "$PSQL" "$DB_URL" "DELETE FROM seasons WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%')"
node "$PSQL" "$DB_URL" "DELETE FROM favorites WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%')"
node "$PSQL" "$DB_URL" "DELETE FROM home_section_items WHERE \"contentId\" IN (SELECT id FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%')"
node "$PSQL" "$DB_URL" "DELETE FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%'"
node "$PSQL" "$DB_URL" "SELECT count(*)::int AS kalan_qa8_icerik FROM contents WHERE slug LIKE 'qa8-%' OR slug LIKE 'qa9-%'"

# 2) API başlat, P2C probe tekrarı
LOG=/tmp/faz8-p2c-rerun.log
( cd "$ROOT/apps/api" && env DATABASE_URL="$DB_URL" node dist/main.js >"$LOG" 2>&1 & echo $! > /tmp/faz8-p2c.pid )
for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:3002/health >/dev/null 2>&1 && break; sleep 0.5; done
log "API hazır — P2C probe koşuluyor…"
# Probe varsayılanı localhost:3000'dir; bu runner API'yi 3002'de kaldırır →
# taban adresi açıkça geç (ECONNREFUSED ile çökmesin).
node "$ROOT/scripts/qa-faz2c-catalog-probe.mjs" http://127.0.0.1:3002 2>&1 | tail -4
RC=${PIPESTATUS[0]}

P=$(cat /tmp/faz8-p2c.pid 2>/dev/null || true); [ -n "$P" ] && kill "$P" 2>/dev/null; sleep 0.5; kill -9 "$P" 2>/dev/null || true
pkill -9 -f "dist/main.js" 2>/dev/null || true
log "bitti (p2c exit: $RC)"
exit $RC
