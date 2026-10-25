#!/usr/bin/env bash
# QA amaçlı yerel PostgreSQL 16 kurulumu (Docker yokluğunda, root'suz).
# Compose paritesi: kullanıcı=perdego, şifre=perdego_dev_pass, db=perdego, port=5432
set -euo pipefail

BASE="/home/z/my-project/scripts/qa-pg"
PKG="$BASE/node_modules/@embedded-postgres/linux-x64"
PGDATA="$BASE/pgdata"
SOCKDIR="$BASE/sock"
BIN="$PKG/native/bin"
LOG="$BASE/pg.log"

# 1) Paket postinstall'ı npm tarafından atlandı → symlink'leri manuel hale getir
if [ -f "$PKG/native/pg-symlinks.json" ]; then
  (cd "$PKG" && node scripts/hydrate-symlinks.js || true)
fi

mkdir -p "$SOCKDIR"

# 2) initdb (yalnızca ilk seferde)
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "perdego_dev_pass" > "$BASE/.pwfile"
  "$BIN/initdb" -D "$PGDATA" -U perdego --pwfile="$BASE/.pwfile" \
    -A scram-sha-256 -E UTF8 --no-instructions
  rm -f "$BASE/.pwfile"
  echo "[setup-pg] initdb tamam (PG 16.14, kullanıcı: perdego)"
else
  echo "[setup-pg] pgdata mevcut, initdb atlandı"
fi

# 3) Başlat ( readiness beklentili)
if "$BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "[setup-pg] PostgreSQL zaten çalışıyor"
else
  "$BIN/pg_ctl" -D "$PGDATA" -l "$LOG" -w -t 30 start \
    -o "-p 5432 -c listen_addresses=127.0.0.1 -k $SOCKDIR"
  echo "[setup-pg] PostgreSQL hazır: 127.0.0.1:5432"
fi
