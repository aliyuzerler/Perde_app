# Faz 2b Raporu — Tam Veritabanı Şeması ve NestJS Backend Servisleri

> Tarih: 2026-10-25 · Öncül: Faz 2a (temel altyapı) · Sonraki: mobil gerçek
> adapter geçişi (Faz 3b / 2c)
> Kaynak görev: PostgreSQL veritabanı, Prisma şeması ve NestJS backend
> servislerinin oluşturulması; Faz 0 dokümanları ve mevcut kod esas alınarak.

## 1. Kapsam Özeti

Faz 2b, `apps/api`'yi health-iskeletinden **tam işlevsel içerik/alan API'sine**
taşır. Görev maddelerinin tamamı gerçeklendi: 21+ tabloluk PostgreSQL şeması
(ERD.md §3 ile birebir), 13 NestJS modülü, zorunlu 6 genel uç, sözleşme-tek-
kaynak DTO doğrulaması, standart hata zarfı, sayfalama/filtreleme, Swagger,
idempotent ödeme/webhook katmanı, append-only kredi defteri, telifsiz özgün
seed verisi ve gerçek PostgreSQL üzerinde uçtan uca entegrasyon testleri.

Mevcut ekranlar ve proje yapılandırması gereksiz yere değiştirilmedi: mobil
kaynak koduna dokunulmadı, admin paneline dokunulmadı, monorepo/pnpm düzeni
korundu. Değişiklikler `apps/api`, `packages/contracts` ve kök `.env`/README
ile sınırlıdır.

## 2. Veritabanı Şeması (Prisma + Migration)

- `apps/api/prisma/schema.prisma` — ERD §3'ün tamamı: `users`, `sessions`,
  `devices`, `categories`, `contents`, `content_categories`, `episodes`,
  `episode_media`, `watch_history`, `favorites`, `playback_sessions`, `plans`,
  `subscriptions`, `store_transactions`, `credit_packs`, `credit_wallets`,
  `credit_ledger`, `episode_unlocks`, `notifications`,
  `notification_preferences`, `webhook_events`, `idempotency_keys`,
  `audit_logs` + home_sections/banners (görevdeki 23 varlık sınıfının tamamı).
- Kapalı kümeler PostgreSQL native enum; finansal/izleme FK'larında RESTRICT,
  sahiplik ilişkilerinde CASCADE; unique kısıtlar ERD'deki gibi
  (`UNIQUE(platform, storeTransactionId)`, `UNIQUE(userId, episodeId)`,
  `UNIQUE(source, eventId)` vb.).
- `20261025090000_full_domain` migration'ı (748 satır): Prisma'nın
  modellemediği CHECK kısıtları (`credit_cost > 0`, bakiye ≥ 0, `delta ≠ 0`),
  kısmi unique index'ler (tek READY medya, tek aktif plan, okunmamış
  bildirim) ve `credit_ledger` için append-only yazma rolü SQL'e elle eklendi.
- **Temiz veritabanı doğrulaması:** entegrasyon testleri HER koşuda test
  veritabanını `DROP DATABASE (FORCE)` + `CREATE` + `prisma migrate deploy`
  + seed ile sıfırdan kurar; bu akış bu oturumda 5+ kez koşuldu.

## 3. Backend Modülleri (13) ve Uçlar

`app.module.ts` altında: **Auth** (register/login/refresh rotasyonu + reuse
detection, RS256 access + SHA-256 hash'li refresh), **Users** (GET/PATCH
/me), **Catalog** (home, titles listesi/detay, bölüm detayı, search,
placeholder görseller), **Categories**, **Episodes** (AccessService: erişim
kararı), **WatchProgress** (upsert + devam et), **Watchlist** (idempotent
favori), **Billing** (satın alma doğrulama + webhook ingest + işlem
geçmişi), **Subscriptions** (mağaza doğrulamasından aktivasyon), **Credits**
(cüzdan, paket satın alma, bölüm açma), **Media** (oynatma oturumu + imzalı
HLS manifest), **Notifications** (liste/okundu/tercihler), **Admin** (içerik
yönetimi, kredi düzeltmesi, audit log) + **Audit**/Idempotency destek
servisleri.

Zorunlu 6 genel uç canlı smoke ile kanıtlandı: `GET /health`,
`GET /api/v1/home`, `GET /api/v1/catalog/titles`,
`GET /api/v1/catalog/titles/:slug`, `GET /api/v1/catalog/episodes/:id`,
`GET /api/v1/search`. Swagger `/api/docs` (JSON `/api/docs-json`), zarf
interceptor'ı, global hata filtresi (`code` + `details.reason` sözleşmesi),
sayfalama (`page/pageSize` + `meta`) ve `parseQuery`/`ZodValidationPipe`
ile sözleşme şemalarından (packages/contracts) tek-kaynak doğrulama.

## 4. İş Kurallarının Kanıtı (entegrasyon testleri, gerçek PostgreSQL)

| Kural | Kanıt |
|-------|-------|
| 1. Cüzdan = ledger toplamı | Test 13: SQL `SUM(purchasedDelta/grantedDelta)` == `credit_wallets` satırı |
| 2. Dış tx kimliği iki kez işlenmez | Test 14: aynı `storeTransactionId` farklı key ile → `alreadyProcessed=true`, bakiye değişmez; `UNIQUE(platform, storeTransactionId)` |
| 3. Tekrar unlock ücretlendirmez | Test 13: ikinci unlock → `alreadyUnlocked=true`, bakiye aynı |
| 4. Çekim + hak tek transaction | `credits.service`: wallet `SELECT ... FOR UPDATE` → ledger INSERT → unlock INSERT, `$transaction`; test 13 uçtan uca |
| 5. Abonelik / bölüm hakkı / video erişimi ayrımı | Test 16: aboneliksiz SUBSCRIPTION bölüm → 402 NEEDS_SUBSCRIPTION; abonelik aktive → 201; paralel oturum limiti (2) → 409; test 06: FREE konuk erişimi |
| 6. Yayın / taslak ayrımı | Test 02/04/17: taslak içerik herkese açık uçlarda 404; admin publish sonrası 200 |
| 7. Webhook idempotent | Test 15: aynı `(source, eventId)` ikinci kez → `SKIPPED` + `duplicate=true` |

Ayrıca: hediye/satın alınan kredi ayrımı (`purchased/granted` iki bileşen),
admin kredi düzeltmesi zorunlu `note` + audit log kaydı (test 13/17),
`Idempotency-Key` başlığı olmadan ödeme POST → 400 (test 14), refresh token
reuse detection tüm aileyi iptal eder (test 09).

## 5. Test Sonuçları (gerçek çalıştırma, bu oturum)

| Suite | Sonuç |
|-------|-------|
| `packages/contracts` | 38/38 (Faz 2b sözleşme testleri dahil) |
| `apps/api` birim | 62/62 (12 dosya) |
| `apps/api` entegrasyon | 17/17 — gerçek PostgreSQL 16, her koşuda temiz DB |
| `apps/mobile` | 70/70 (regresyon yok; mobil koduna dokunulmadı) |
| Toplam | **187/187** |
| `pnpm typecheck` / `lint` / `build` | 4 workspace yeşil (nest + next build) |
| Canlı smoke (`scripts/qa-faz2b-smoke.sh`) | **13/13** — health, Swagger, 6 uç, hata zarfı, doğrulama alanları |

Entegrasyon testi DB erişilemezse **dürüstçe SKIP** eder (sahte başarı yok);
bu oturumda gömülü PostgreSQL erişilebilir olduğundan gerçek koşuldu.

## 6. Bu Oturumda Bulunan ve Düzeltilen Kusurlar

Önceki oturum implementasyonu commit'lemişti (`ea5ffc1`) ancak doğrulama
turuna girmeden çökmüştü; bu oturumun doğrulaması 5 gerçek kusur yakaladı:

1. **[KRİTİK] publishedContentFilter OR-ezilmesi** — sabit filtre nesnesi
   spread edildiğinde kendi `OR`'u, çağıranın `OR[id/slug]` koşulunu
   **sessizce eziyordu**: `watchlist.add('yanki')` rastgele yayında içerikle
   eşleşiyor (yanıt `gece-yarisi-treni`'in ID'sini taşıyordu). Ayrıca
   `new Date()` modül yüklenme anında hesaplandığından sunucu ayakta iken
   yayınlanan içerik listelerde görünmüyordu. **Düzeltme:** filtreler
   fonksiyona çevrildi (taze `Date`) ve `publishedAt` koşulu `AND` içine
   sarıldı; 6 kullanım noktası güncellendi; sınıfa gerekçe yorumu yazıldı.
2. **[YÜKSEK] ZodValidationPipe reason kaybı** — pipe `BadRequestException`
   fırlatıp filtredeki `VALIDATION_FAILED` dalını devre dışı bırakıyordu
   (400 gövdesinde `details.reason` yok). Pipe'ın kendi doc yorumu ZodError
   fırlatılması gerektiğini söylüyordu. **Düzeltme:** `ZodError` doğrudan
   fırlatılır; `parseQuery` de aynı sözleşmeye çekildi.
3. **[YÜKSEK] playbackUrl yanlış köken** — URL daima `PUBLIC_BASE_URL`
   (varsayılan `localhost:3000`) üretiyordu; test sunucusu rastgele portta
   imzalı manifest'e ulaşılamıyordu (port 3000'deki bayat süreç 403 ile
   kanıtladı). **Düzeltme:** controller isteğin kendi kökenini
   (`requestOrigin`) iletir; `PUBLIC_BASE_URL` fallback kaldı. Üretim
   notu: proxy Host başlığı genel adresi vermeli.
4. **[ORTA] Entegrasyon spec tip hataları** — CommonJS'te üst düzey await
   (DB probe), uzantısız dinamik importlar (node16 çözünürlüğü), `api()`
   yardımcısında `PUT` eksik → typecheck kırmızı. **Düzeltme:** senkron
   `spawnSync` probe, `.js` uzantıları, tip genişletme.
5. **[ORTA] Ortam hijyeni** — kök `.env` başlangıç scaffold'undan kalma
   SQLite `DATABASE_URL=file:...` taşıyordu (kalıcı shell oturumunun export'u
   test keşfini zorlaştırdı); @prisma/client'in .env aramasını zehirliyordu.
   **Düzeltme:** kök `.env` Postgres URL'si ile hizalandı ve gerekçe
   yorumlandı; bayat API süreci (port 3000) öldürüldü.

Test tarafındaki düzeltmeler: test 14 satın alma yanıtında sözleşme alanları
(`wallet.purchased` — payments.ts; cüzdan ucu ise `purchasedCredits` —
billing.ts), test 16 açık SUBSCRIPTION bölüm seçimi (S1E1 FREE) ve paralel
limit sayımı (3. oturum 409).

## 7. Önemli Mimari Kararlar

- **Sözleşme tek kaynak:** DTO sınıfı yazılmaz; `packages/contracts` Zod
  şemaları hem doğrulama hem tip üretiminde kullanılır (çifte tanım yok).
- **bootstrap.ts paylaşımlı kurulum:** main.ts ve entegrasyon testleri aynı
  interceptor/filtre/prefix/Swagger yapılandırmasını kullanır — testler
  üretim davranışını birebir sınamış olur.
- **Dürüst redler:** DB yoksa API boot ÇÖKMEZ (dayanıklı PrismaService) ama
  `/health/db` 503 döner; engelli entegrasyon testi SKIP sayılır.
- **Idempotency iki katman:** istek düzeyi `Idempotency-Key` (24 saat TTL,
  kayıtlı yanıt aynen döner) + doğal idempotensi (`UNIQUE` kısıtları,
  unlock'da mevcut hak kontrolü).
- **Ledger append-only:** uygulama katmanında yalnızca `create`; bakiye
  önbelleği (`credit_wallets`) her yazımda ledger toplamından doğrulanır.

## 8. Kalan / Sonraki Faz İçin Notlar

- **Mobil gerçek adapter geçişi:** ekranlar hazır; `EXPO_PUBLIC_MOCK_API=0`
  ile http-adapter devreye alınacak (Faz 3b kapsamı). Ports.ts'teki
  yöntemlerin sunucu karşılıkları mevcut.
- **Gerçek mağaza doğrulaması** (RevenueCat/APK) Faz 5'te; sunucu
  sözleşmesi (`purchaseValidateSchema`, webhook zarfı) hazırdır.
- **Gerçek HLS** Faz 4'te VideoProviderAdapter ile; imzalı manifest ucu
  köprü noktasıdır (`/api/v1/media/hls/...`).
- Docker'lı makinede bir kez `pnpm db:up → db:deploy → db:seed` koşulması
  yeterlidir (komutlar README'de); sandbox doğrulaması gömülü PostgreSQL
  ile yapılmıştır.
