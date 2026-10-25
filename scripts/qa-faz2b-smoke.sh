#!/usr/bin/env bash
# Faz 2b canlı smoke: 6 zorunlu uç + Swagger + hata sözleşmesi.
# Kullanım: scripts/qa-faz2b-smoke.sh  (API :3000'de ayakta olmalı)
set -u
BASE="http://127.0.0.1:3000"
PASS=0; FAIL=0

check() { # check <ad> <beklenen> <gerçek>
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✓ $1 ($3)";
  else FAIL=$((FAIL+1)); echo "  ✗ $1 — beklenen $2, gelen $3"; fi
}

echo "— Altyapı —"
check "GET /health"                 200 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/health)"
check "GET /health/db"              200 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/health/db)"
check "GET /api/docs (Swagger UI)"  200 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/docs)"
OPENAPI_TITLE=$(curl -s $BASE/api/docs-json | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).info.title)}catch{console.log('PARSE_HATASI')}})")
check "OpenAPI info.title"          "PerdeGo API" "$OPENAPI_TITLE"

echo "— 6 zorunlu uç —"
check "GET /api/v1/home"                              200 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/home)"
check "GET /api/v1/catalog/titles"                    200 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/catalog/titles)"
check "GET /api/v1/catalog/titles/gece-yarisi-treni"  200 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/catalog/titles/gece-yarisi-treni)"
check "GET /api/v1/catalog/titles/yeni-baslangic (taslak→404)" 404 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/catalog/titles/yeni-baslangic)"

EP_ID=$(curl -s "$BASE/api/v1/catalog/titles/kayip-sinyal" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.data.accessSeasons[0].episodes[0].id)})")
check "GET /api/v1/catalog/episodes/:id"              200 "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/v1/catalog/episodes/$EP_ID)"
check "GET /api/v1/search?query=tren"                 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/search?query=tren")"

echo "— Hata sözleşmesi + doğrulama —"
BODY=$(curl -s "$BASE/api/v1/catalog/titles/olmayan-icerik-xyz")
CODE=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.error.code+':'+j.error.details.reason)})")
check "404 zarfı code:reason" "NOT_FOUND:CONTENT_NOT_FOUND" "$CODE"

BODY=$(curl -s -X POST "$BASE/api/v1/auth/register" -H 'Content-Type: application/json' -d '{"displayName":"","email":"bozuk","password":"123"}')
REASON=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.error.code+':'+j.error.details.reason)})")
FCOUNT=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.error.details.fields.length)})")
check "400 doğrulama zarfı (code:reason)" "BAD_REQUEST:VALIDATION_FAILED" "$REASON"
if [ "$FCOUNT" -ge 1 ] 2>/dev/null; then PASS=$((PASS+1)); echo "  ✓ doğrulama alanları iletildi ($FCOUNT alan)"; else FAIL=$((FAIL+1)); echo "  ✗ doğrulama alanları boş"; fi

echo ""
echo "SONUÇ: $PASS başarılı, $FAIL başarısız"
[ $FAIL -eq 0 ]
