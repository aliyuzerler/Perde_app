# Faz 3 QA Raporu — Database ve API (Faz 2b tesliminin kalite kontrolü)

> Tarih: 2026-10-25 · Kapsam: PostgreSQL şeması + Prisma migration'ları +
> NestJS modülleri (son tamamlanan geliştirme fazı: Faz 2b, commit `027d328`)
> Yöntem: gerçek komut çalıştırma; sahte başarı yok. Üretim veritabanına
> karşı test KOŞULMADI — yalnızca gömülü PostgreSQL 16.14'ün üzerindeki
> `perdego` (dev), `perdego_faz2b_test` (entegrasyon) ve `perdego_qa_verify`
> (bağımsız envanter) veritabanları kullanıldı.

## 1. Faz Adı ve Test Kapsamı

| Alan | Ne sınandı |
|------|-----------|
| Migration | Temiz veritabanında sıfırdan `migrate deploy` (2 farklı temiz DB + entegrasyon beforeAll'ın her koşudaki DROP/CREATE/DEPLOY/SEED akışı) |
| Kısıtlar | 30 tabloda FK (36), unique index (51), CHECK (8), PK (30), tetikleyici envanteri — `pg_catalog` üzerinden bağımsız SQL sorgularıyla (`scripts/qa-faz3-db-probe.sh`) |
| Seed | 2 kez art arda seed → sayım değişmezliği + cüzdan=ledger bütünlüğü |
| Swagger | `/api/docs-json` 44 yol; 17 kritik yolun varlığı + canlı uç davranışıyla tutarlılık |
| DTO doğrulama | page=0, pageSize=9999, kind=BILINMEYEN, sort=BOZUK, bozuk JSON, yanlış tipli alan, beklenmeyen alan (`hackerField`), boş/yetersiz kayıt gövdesi |
| Sayfalama/filtre/arama | sayfa kesişimi, meta sözleşmesi, kind/accessType filtreleri, boş arama sonuç zarfı |
| Taslak/yayın | herkese açık listede yalnız PUBLISHED; taslak slug → 404; entegrasyon test 02/04/17 |
| Kullanıcı izolasyonu | iki ayrı kullanıcı, favori/izleme-ilerlemesi kayıtlarının karışmaması, token'sız/sahte token → 401 |
| Hata sözleşmesi | 5 hata senaryosunda `ok:false + error.code + message + details.reason` tutarlılığı |
| Finansal bütünlük | cüzdan = ledger SQL denklemi (sapma 0), unlock↔ledger referansı, negatif bakiye CHECK reddi, append-only tetikleyicisi |

## 2. Çalıştırılan Komutlar (gerçek)

```bash
corepack pnpm install --frozen-lockfile     # 1313 paket, exit 0
pnpm --filter @perdego/api run db:generate  # bayat client düzeltmesi
pnpm typecheck                              # 4 workspace
pnpm lint                                   # 4 workspace
pnpm test                                   # contracts 38 + api 80 + mobile 70
pnpm build                                  # nest build + next build
pnpm --filter @perdego/api run db:deploy    # (DATABASE_URL ile) temiz DB'lerde
npx tsx prisma/seed.ts                      # dev DB'de 2 kez (idempotensi)
bash scripts/qa-pg/setup-pg.sh              # gömülü PostgreSQL 16.14
bash scripts/qa-faz2b-smoke.sh              # canlı smoke 13 madde
node scripts/qa-faz3-api-probe.mjs          # canlı genişletilmiş probe 53 madde
bash scripts/qa-faz3-db-probe.sh <URL>      # kısıt envanteri (bu oturumda yazıldı)
```

Ortam notu: sandbox'ta Docker yok → PostgreSQL, git-dışı gömülü binary
(`@embedded-postgres/linux-x64` 16.14.0-beta.17, compose paritesi
perdego/perdego_dev_pass) ile koşuldu. Bu, önceki Faz 1/2 QA'larındakiyle aynı
dürüst yöntemdir.

## 3. Gerçek Test Sonuçları

| Suite | Komut | Sonuç |
|-------|-------|-------|
| TypeScript (4 workspace) | `pnpm typecheck` | ✅ PASS (ilk koşuda ❌ → bkz. F3-01) |
| ESLint (4 workspace) | `pnpm lint` | ✅ PASS |
| contracts (vitest) | `pnpm test` | ✅ 38/38 |
| apps/api birim (12 dosya) | `pnpm test` | ✅ 62/62 |
| apps/api entegrasyon (gerçek PG) | `pnpm test` | ✅ 18/18 — `integration.faz2b.spec.ts (18 tests) 2902ms` (SKIP değil, gerçek koşu; test 18 bu oturumda eklendi) |
| apps/mobile (jest) | `pnpm test` | ✅ 70/70 (mobil koduna dokunulmadı — regresyon yok) |
| **Toplam test** | | **188/188** |
| nest build + next build | `pnpm build` | ✅ PASS |
| Canlı smoke | `qa-faz2b-smoke.sh` | ✅ 13/13 (health, Swagger, 6 zorunlu uç, hata zarfı, doğrulama alanları) |
| Canlı genişletilmiş probe | `qa-faz3-api-probe.mjs` | ✅ 53/53 |
| Migration (temiz DB ×3: qa_verify, faz2b_test ×N koşu, dev) | `migrate deploy` | ✅ 3 migration uygulanır |
| Seed ×2 | `tsx prisma/seed.ts` | ✅ İkinci koşuda sayımlar birebir aynı (5 kategori/7 içerik/13 bölüm/3 kullanıcı/3 ledger/2 plan/2 banner) |
| Cüzdan=ledger denklemi | SQL | ✅ Sapma 0 satır |
| Negatif bakiye CHECK | SQL | ✅ `credit_wallets_purchased_nonnegative` ihlali reddedildi |
| Cascade+RESTRICT karışımı (content silme) | SQL | ✅ İçerik+sezon+bölüm zinciri hatasız silinir |

## 4. Kabul Kriterleri — Maddeler Halinde (FAZ 3 Testi görev listesi)

| # | Görev maddesi | Durum | Kanıt |
|---|---------------|-------|-------|
| 1 | Test DB'de migration'lar sıfırdan | ✅ | `perdego_qa_verify` (DROP→CREATE→deploy, 3 migration) + entegrasyon beforeAll her koşu |
| 2 | FK/unique/index yapıları kontrolü | ✅ | Envanter: 36 FK (finansal RESTRICT, sahiplik CASCADE — ERD'ye uygun), 51 unique index, 8 CHECK, `UNIQUE(platform,storeTransactionId)`, `UNIQUE(userId,episodeId)`, `UNIQUE(source,eventId)`, kısmi `episode_media_single_ready` |
| 3 | Seed + tekrar çalıştırılabilirlik | ✅ | 2× seed → sayım değişmez; `credit_ledger.idempotencyKey` unique upsert'leri çakışmaz |
| 4 | Swagger ↔ endpoint tutarlılığı | ✅ | 44 dokümante yol; 17 kritik yol dokümanlı; canlı davranış 53/53; `/health*` zarfsızlığı bilinçli muafiyet (interceptor doc) |
| 5 | DTO hatalı/eksik/beklenmeyen girdi | ✅ | 400 VALIDATION_FAILED + alan listesi; bozuk JSON → 400; bilinmeyen alan sessizce kırpılır (Zod strip — gözlem, kusur değil) |
| 6 | Sayfalama/filtreleme/arama | ✅ | Meta sözleşmesi kontratla birebir (`totalItems/totalPages/hasNextPage`); sayfalar kesişimsiz; enum dışı filtre → 400 |
| 7 | Taslak/yayın ayrımı | ✅ | Canlı: taslak slug 404, listede yalnız PUBLISHED; entegrasyon 02/04/17 |
| 8 | Kullanıcı izolasyonu | ✅ | İki kullanıcının favori/izleme kayıtları karışmıyor; token'sız/sahte → 401 |
| 9 | Hata kodları/yanıt şemaları | ✅ | 5 senaryoda `ok:false + code + message + details.reason`; başarı zarfı `ok:true + data` |
| 10 | Ledger/satın alma/unlock bütünlüğü | ✅ | Wallet=ledger SQL denklemi; `UNIQUE` idempotensi; CHECK kısıtları canlı reddediyor; **append-only DB tetikleyicisi bu oturumda gerçekleştirildi (F3-02)** ve 4 senaryoda kanıtlandı |

## 5. Bulunan Hatalar ve Düzeltmeler

| Kimlik | Önem | Bulgu | Düzeltme ve kanıt |
|--------|------|-------|-------------------|
| F3-01 | **Yüksek** (derleme hattı) | Taze `pnpm install` sonrası `@prisma/client` şema bulamadan stub üretiliyor (hoisted düzen + postinstall şemayı bulamıyor) → API typecheck **kırmızı** (`no exported member 'UserWhereInput'` ×30+) | `package.json` köküne `postinstall: pnpm --filter @perdego/api run db:generate` eklendi; `db:generate` sonrası typecheck 4/4 yeşil. Makine notu: mevcut checkout'larda bir kez `pnpm install` koşması yeterli |
| F3-02 | **Orta** (bütünlük sertleştirme + rapor doğruluğu) | ERD ("append-only dövmez, BR-04") ve Faz 2b raporu DB düzeyi append-only iddia ediyordu; migration'da **hiç** GRANT/REVOKE/RULE/trigger yoktu — `credit_ledger` doğrudan SQL ile UPDATE/DELETE'e açıktı | Yeni migration `20261025120000_ledger_append_only`: finansal kimlik alanlarında (userId/type/delta/purchasedDelta/grantedDelta/referenceType/referenceId/idempotencyKey/expiresAt) UPDATE reddi, satır DELETE reddi, TRUNCATE koruması; bakiye snapshot alanları (`balanceAfter*`) serbest — uygulamanın create→finalize deseni korunur. Canlı SQL kanıtı: finansal UPDATE ✗, DELETE ✗, snapshot UPDATE ✓, veri sağlam. Entegrasyon test 18 kalıcı kanıt |
| F3-03 | **Düşük** (dokümantasyon) | Faz 2b raporu 3 kısmi unique index iddia ediyordu ("tek READY medya, tek aktif plan, okunmamış bildirim"); gerçekte yalnız 1'i var | `docs/phases/FAZ-2B.md` §2 düzeltme notuyla gerçek duruma çekildi. "Tek aktif abonelik" kısıtının uygulama katmanında (family-key akışı) tutulması bilinçli tercih olarak belgelendi — çapraz platform senaryosunda meşru ikinci satırı engelleme riski alındı |
| F3-04 | **Düşük** (QA ortamı) | `scripts/qa-pg` bağımlılıkları `--no-save` kuruluydu; sonraki `npm install` prune edince binary'ler (plpgsql.so dahil) silindi → migration `58P01` hatası | `scripts/qa-pg/package.json` yazıldı (bağımlılıklar tanımlı), binary'ler kalıcı kuruldu, PG yeniden başlatıldı, migration resolve+deploy edildi |
| F3-05 | **Düşük** (kurulum hattı) | pnpm 12, `@scarf/scarf` (swagger-ui-dist zincirinden telemetri postinstall) için "ignored build" hatasıyla `pnpm install`'ı kırıyordu | `pnpm-workspace.yaml` allowBuilds'e `'@scarf/scarf': false` (bilinçli ret) eklendi; `pnpm install --frozen-lockfile` exit 0 |
| — | Gözlem | Oturum ortamında zehirli `DATABASE_URL=file:...` export'u kalıcı shell'den sürüyordu (Faz 2b §6.5'te belgelenmiş oturum artığı) | Kod hatası değil: API yanlış şemayı reddetti (davranış doğru). Sunucu açık env ile başlatıldı; rapora not edildi |

## 6. Başarısız / Çalıştırılamayan Testler (dürüst kayıt)

| Test | Neden | Durum |
|------|-------|-------|
| Docker Compose (`pnpm db:up`), Redis | Sandbox'ta Docker yok | ❌ Koşulamadı — compose paritesi gömülü PG ile kanıtlandı; Docker'lı makinede bir kez `pnpm db:up → db:deploy → db:seed` bekler |
| Gerçek mağaza doğrulaması (App Store/Play/RevenueCat) | Dış hesap/anahtar yok | ❌ — yalnız sözleşme/webhook simülasyonları koşuldu (test 14/15); sahte sonuç üretilmedi |
| Gerçek HLS sağlayıcısı (Bunny/CF) | Dış hesap yok | ❌ — imzalı manifest köprüsü yerel olarak kanıtlandı (test 06/16), gerçek CDN doğrulaması Faz 4 |
| Gerçek cihaz/push | Cihaz + APNs/FCM yok | ❌ — push token saklama sözleşmesi uçlarıyla sınırlı |
| Swagger UI görsel denetimi | Tarayıcı oturumu kapsamda değil | JSON şema (`/api/docs-json`) ve UI HTTP 200 kanıtlandı; piksel denetimi yapılmadı |

Bu maddelerin hiçbiri "başarılı" sayılmadı; Faz 0 QA'dan beri taşınan dış
bağımlılık risk listesine (R-01..R-09) aittir.

## 7. Önceki Fazlardan Kalan Regresyonlar

- Faz 1 altyapı: `/health` 200, `/health/db` 200 (gerçek PG), env doğrulama, admin prod build — ✅ yeşil.
- Faz 2a/2b uçları: 6 zorunlu genel uç + hata zarfı — ✅ smoke 13/13.
- Faz 3a mobil: 70/70 test — ✅ (mobil kaynak koduna bu QA'da dokunulmadı).
- Kontratlar: 38/38 — ✅ (API ↔ kontrat alan adları canlı probe ile teyit: `contentId`, meta alanları).
- Bilinen taşınan riskler (düzeltme yapılmadı, bilinçli): çoklu platform
  abonelik tekilliği uygulama katmanında; `sort`/listeleme kararlılığı mevcut
  seed verisinde ayrışık `publishedAt` gerektirir (aynı saniyede yayınlanan
  kayıtlarda ikincil sıralama anahtarı Faz 4'te değerlendirilebilir).

## 8. Sonraki Faza Geçiş Kararı

**PASS WITH WARNINGS** — Faz 3 kabul kriterleri gerçek kanıtla karşılandı:
migration'lar temiz test veritabanlarında başarılı, API sözleşmeleri kodla
uyumlu (188/188 test + 53/53 canlı probe + 13/13 smoke), veri bütünlüğü
ihlalleri kısıt ve tetikleyicilerle engellenir durumda. Bulunan 5 kusur
düzeltildi ve düzeltmeler yeniden test edildi.

Uyarılar (geçişe engel değil, kayıtlı riskler):
1. Docker'lı makinede compose akışının (`db:up → db:deploy → db:seed`) bir kez koşulması.
2. Gerçek mağaza/HLS/push doğrulamaları dış hesap bağımlı (Faz 4/5 kapsamı).
3. F3-02 tetikleyicisi gömülü PostgreSQL'de kanıtlandı; docker-compose
   postgres:16-alpine üzerinde aynı SQL standarttır ancak ilk deploy'da
   gözlemlenmeli.
