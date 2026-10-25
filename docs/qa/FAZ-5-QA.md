# FAZ 5 QA — Katalog ve Arama (Gerçek Backend Verisi)

> **Tarih:** 2026-10-25 · **Karar: PASS WITH WARNINGS**
> Doğrulanan geliştirme fazı: **Faz 2c — katalog deneyiminin gerçek backend verisiyle
> birleştirilmesi** (commit `433920e`, önceki oturumda tamamlanan son geliştirme).
> Not: Bu raporun faz numarası, QA kayıtlarının sıra numarasıdır (FAZ-1…FAZ-4 QA'dan
> sonra); ROADMAP'teki "Faz 5 (Abonelik/Ödemeler)" ile karışmamalıdır — ödeme fazının
> geliştirmesi henüz başlamamıştır ve bu raporun kapsamı dışındadır.

---

## 1. Kapsam ve Yöntem

Bu QA turu, katalog ve arama deneyimini **gerçek backend verisiyle** uçtan uca doğrulamıştır:
ana sayfa (/home), kategoriler, arama, yapım detayı (sezon/bölüm), favoriler, izleme
geçmişi, yetki sınırları (taslak/arşiv sızması), sayfalama bütünlüğü, kullanıcı izolasyonu,
ağ hatası/tekrar-dene akışları ve dikdörtgen afiş tasarım kuralları.

Yöntem dört katmanlıdır:

1. **Statik doğrulama** — gerçek komutlarla typecheck/lint/build.
2. **Test koşumu** — birim testler + gerçek PostgreSQL entegrasyon testleri (Docker'sız
   ortamda gömülü PG 17.4, `scripts/qa-pg`).
3. **Canlı API probe'ları** — migrate+seed'li dev veritabanına karşı gerçek HTTP.
4. **Mobil UI E2E** — Expo web (Metro, `EXPO_PUBLIC_MOCK_API=0`) + Playwright ile gerçek
   tıklama/yazma; ekran görüntüleri `docs/qa/screenshots/faz2c/` altına yeniden üretildi.

**Mock mu, gerçek API mi?** Açık tespit: **katalog verisi gerçek API'den gelmektedir.**
- Kaynak düzeyi: `apps/mobile/src/services/adapter.ts` — mock adapter yalnızca
  `__DEV__ && EXPO_PUBLIC_MOCK_API === '1'` iken seçilir; aksi her durumda gerçek
  HTTP adapter (ApiClient + otomatik refresh) devrededir. Mock-adapter'da ikinci bir
  `__DEV__` koruması daha vardır (iki katmanlı savunma); üretim derlemesinde mock yolu
  seçilemez.
- Çalışma anı kanıtı: E2E sonuç dosyasında `mockApi: 0 (gerçek adapter)`; ekranda yalnızca
  seed veritabanında bulunan yapım adları görüldü (Gece Yarısı Treni, Son Vardiya, Kayıp
  Sinyal); API süreci kapatıldığında uygulama hata ekranına düşüp "Tekrar Dene" ile kurtuldu
  — sabit mock veride bu davranış imkânsızdır.
- Geliştirme mock'u (`mock-adapter.ts`) yalnızca geliştirme aracı olarak durmaktadır ve
  birim testleriyle korunmaktadır; hiçbir ekran onu üretim yolunda kullanmamaktadır.

## 2. Çalıştırılan Gerçek Komutlar ve Sonuçları

Ortam: pnpm 12.15.0 (corepack), Node 24, gömülü PostgreSQL 17.4 (`scripts/qa-pg`,
Docker bu ortamda yok). Platform'un süreç ortamındaki `DATABASE_URL=file:...custom.db`
ezmesi nedeniyle tüm Prisma/API komutları **açık Postgres URL'siyle** çalıştırıldı
(bilinen ortam dersleri, bkz. §6).

| # | Komut | Sonuç |
|---|-------|-------|
| 1 | `pnpm typecheck` (4 workspace) | ✅ 4/4 hata 0 |
| 2 | `pnpm lint` (4 workspace) | ✅ 4/4 uyarı 0 |
| 3 | `pnpm --filter @perdego/contracts test` | ✅ 48/48 |
| 4 | `pnpm --filter @perdego/api test` | ✅ 124/124 (62 birim + 29 gerçek-PG entegrasyon: faz2b 18 + faz2c 11) |
| 5 | `pnpm --filter @perdego/mobile test` | ✅ 114/114 |
| 6 | `pnpm build` (api + admin; mobile'da build betiği yok) | ✅ yeşil |
| 7 | `prisma migrate deploy` + `prisma db seed` | ✅ 4 migration güncel; seed idempotent (7 yapım, 5 kategori, 13 bölüm) |
| 8 | `node scripts/qa-faz2c-catalog-probe.mjs` | ✅ 41/41 |
| 9 | `node scripts/qa-faz5-extra-probe.mjs` (bu turda yazıldı) | ✅ 16/16 |
| 10 | `MAIL_OUTBOX_FILE=… node scripts/qa-faz3b-auth-probe.mjs` (regresyon) | ✅ 22/22 |
| 11 | `bash scripts/qa-faz2b-smoke.sh` (regresyon) | ✅ 13/13 |
| 12 | `bash scripts/qa-faz5-ui-e2e.sh` (API+Metro+E2E orkestratörü) → `scripts/qa-faz2c-ui-real-api.py` | ✅ 20/20 (0 FAIL, 0 WARN), `mockApi=0` |

**Toplam:** statik 4/4 + 4/4; testler **286/286**; canlı probe **92/92**; UI E2E **20/20**.

## 3. Kabul Maddelerinin Tek Tek Doğrulanması (görevin 10 maddesi)

| # | Madde | Kanıt | Durum |
|---|-------|-------|-------|
| 1 | Ana sayfa içerikleri API'den | P2C-02…06 (/home zarf, banner>0, HERO/RAIL/GRID); UI E2E `02-anasayfa-dinamik` banner+rayı gerçek seed adlarıyla doğruladı | ✅ |
| 2 | Kategoriler doğru sonuç | P2C-21/22; F5-03 (kategori sayfalama yürüyüşü, mükerrer 0); F5-09 (5 kategori: aksiyon=1, komedi=1, dram=3, gerilim=4, romantik=1 — DB ile tutarlı); UI `04/05` | ✅ |
| 3 | Arama: sonuç/boş/sayfalama | P2C-13…16 (meta, boş sonuç 200+items=[], boş terim 400, kind filtresi); F5-02 (tam sayfalama yürüyüşü: yürünen=total=3, dup=0); UI `06-arama-gercek`, `06-arama-bos` | ✅ |
| 4 | Detayda doğru sezon/bölüm | P2C-17…19; **F5-08: API detayı PostgreSQL ile satır satır çapraz doğrulandı** (gece-yarisi-treni: api=1 sezon/db=1; son-vardiya: api=1/db=1; bölüm sayıları yayın filtresiyle birebir); UI `03-detay-sezon-bolum` | ✅ |
| 5 | Taslak/arşiv normal kullanıcıya sızmaz | Entegrasyon senaryosu 5 (taslak 404); P2C-30…35 (DRAFT→PROCESSING→PUBLISHED→ARCHIVED matrisi, anonim + admin ayrımı); **F5-07: normal kullanıcı (viewer) token'ıyla** taslak/ARŞİV: detay 404 + aramada yok + listede yok + /home'da yok; smoke 13'te taslak→404 | ✅ |
| 6 | Favori ekle/kaldır + izleme geçmişi | P2C-23…28 (ekle idempotent 201, çıkar 200, continue/history ayrımı, geçmiş meta); F5-05 (favori tam liste mükerrer 0 + eklenen listede); UI `03-favori-ekle`, `14-devam-seed`, `16-favori-sunucu-uctan-uca` (çıkar→ekle→listele sunucuda) | ✅ |
| 7 | Kullanıcı kendi geçmişinden başkasını göremez | **F5-06 (yeni):** A/B adlı iki gerçek kullanıcı kaydedildi; A'nın favorisi ve 42 sn'lik ilerlemesi B'nin watchlist/history/continue listelerinde **yok** (06c); tek-kayıt ucunda B, **kendi sıfır durumunu** alır (poz=0), A'nın pozisyonu sızmaz (06d); B kendi favorisini ekleyip görebilir, A'nın listesi bozulmaz (06e/f) | ✅ |
| 8 | İnternet hatası / boş katalog / tekrar dene | UI `08-offline-ekrani` (API kapatılınca hata ekranı) + `09-tekrar-dene` (API açılınca kurtarma) — ekran görüntüleri tazelendi; boş katalog entegrasyon senaryosu 1 (arşiv sonrası /home sections=[], titles totalItems=0); `retry-policy` birim testleri | ✅ |
| 9 | Sayfalama: mükerrer/eksik öğe | **F5-01…04 tam sayfalama yürüyüşleri** (titles 6/6, search 3/3, kategori, history): dup=0 ve yürünen=toplam=meta.totalItems; P2C-08 (sayfa 1∩2=∅); P2C-27 (geçmiş meta) | ✅ |
| 10 | Dikdörtgen afiş tasarımı | UI ekran görüntüleri (ana sayfa/detay/keşfet) keskin köşeli dikdörtgen kartları gösteriyor; `tokens.ts` radius={0,2,4} (aralık dışı değer tip düzeyinde engelli) ve ASPECT_RATIOS={2:3, 9:16, 16:9}; `poster-card.test.tsx` oran/rozet kurallarını test ediyor (mobile 114 içinde) | ✅ |

## 4. Bulunan Hatalar ve Yapılan Düzeltmeler

**Kritik: 0 · Yüksek: 0 · Orta: 0.** Ürün kodunda kusur bulunamadı; tüm düzeltmeler QA
araçlarına (probe betikleri) veya çalışma ortamına aittir. Ürün kaynak dosyasına
dokunulmamıştır (regresyon riski sıfır).

| Kimlik | Önem | Nitelik | Açıklama ve işlem |
|--------|------|---------|-------------------|
| F5QA-01 | Araç (probe) | `scripts/qa-faz5-extra-probe.mjs` aramayı `q=` ile çağırdı | Sözleşme parametresi `query`. API'nin `q`'yu VALIDATION_FAILED ile reddetmesi **doğru davranış**. Probe düzeltildi. |
| F5QA-02 | Araç (probe) | Yürüyüş parametresi `pageSize` çift geliyordu (`…&pageSize=2&page=1&pageSize=2`) | qs çift anahtarı diziye çevirip `NaN` üretiyor; API 400 döndürdü (doğru savunma). Probe yürüyüşü tek parametreye indirildi. |
| F5QA-03 | Araç (probe) | Geçmiş yürüyüşü token'sız gidiyordu → 401 TOKEN_MISSING | `walk()`'a token parametresi eklendi. 401 davranışının kendisi P2C-23 ile doğruydu. |
| F5QA-04 | Araç (probe) | Liste öğesinde `id` alanı varsayıldı → `POST /watchlist/undefined` → 404 | `contentSummary` sözleşmesinde kimlik alanı `contentId`. Probe `contentId ?? id` kullanacak düzeltildi. |
| F5QA-05 | Araç (probe) | DB çapraz doğrulama SQL'i `season_id` kolonu arıyordu | Şemada sezon ilişkisi `contentId+seasonNumber`; ayrıca Prisma kolonları camelCase. SQL düzeltildi. |
| ORT-01 | Ortam | Sandbox arka plan süreçlerini çağrı sonunda geri kazanıyor; süreç env'sindeki `DATABASE_URL=file:…` .env dosyalarını eziyor | Koşum betikleri (qa-faz5-run-probes.sh, qa-faz5-ui-e2e.sh) API+testi tek çağrıda koşacak şekilde yazıldı; tüm Prisma/API komutları açık URL ile koşuldu. |
| ORT-02 | Ortam | `scripts/qa-faz3b-auth-probe.mjs` varsayılan outbox yolu `/tmp/...` | API'nin gerçek outbox'u `apps/api/.mail-outbox.jsonl`; probe artık `MAIL_OUTBOX_FILE` env'iyle koşuluyor. |

## 5. Başarısız veya Çalıştırılamayan Testler (dürüst sınırlar)

Aşağıdakiler koşulamadı ve **başarılı sayılmadı**; kabul kararına risk olarak yansıtıldı:

1. **Gerçek cihaz/emülatör:** yok. Native SecureStore/derin bağlantı davranışı yalnızca
   birim testlerle (secure-storage.test.ts) ve Expo web E2E'siyle doğrulandı. Native
   cihaz doğrulaması sonraki sürüm öncesi yapılmalıdır.
2. **Mailpit SMTP:** bu ortamda kurulu değil. E-posta akışları dev outbox (JSONL) ile
   kanıtlandı; SMTP_HOST=localhost:1025 ile gerçek SMTP teslimi ayrıca denenmelidir.
3. **Üretim yapılandırması:** gerçek HLS sağlayıcısı, ödeme/mağaza doğrulaması ve üretim
   Postgres bu fazın kapsamı dışı (Faz 4/5 işleri). Mock sonuçlar üretim doğrulaması
   olarak sunulmamıştır.
4. **Docker Compose PG:** bu ortamda Docker yok; entegrasyonlar gömülü PG 17.4 ile
   koşuldu (docker-compose paritesi: aynı kullanıcı/şifre/db/port).
5. **`expo build` (native):** mobile paketinde build betiği tanımlı değil; mobil çalışma
   kontrolü Expo web bundle'ı + 114 birim test ile sağlandı.

## 6. Önceki Fazlardan Kalan Regresyonlar

| Regresyon hedefi | Kanıt | Sonuç |
|------------------|-------|-------|
| Faz 2b entegrasyonları (ödeme/cüzdan/idempotens, gerçek PG) | API test paketi içinde 18 test | ✅ |
| Faz 2b canlı smoke | `qa-faz2b-smoke.sh` 13/13 (health, 6 zorunlu uç, hata zarfları) | ✅ |
| Faz 3b kimlik akışları | `qa-faz3b-auth-probe.mjs` 22/22 (kayıt→verify→login, rotasyon/reuse, rate limit 429, oturumlar, silme/restore) | ✅ |
| Mobil birim/E2E davranışı | 114 test; Faz 2c UI E2E 20/20 yeniden koşuldu | ✅ |

Ürün kaynak dosyalarına bu turda dokunulmadığı için (`git status`: yalnızca mod biti
gürültüsü + bu turun QA betikleri/raporu) yeniden yazma/yapılandırma sıfırlama yapılmamıştır.
Faz 2c'den kalma **F2C-03 (Düşük)** açık kalmıştır: en dar 3 sütunlu ızgarada uzun erişim
rozeti ("Üyelere ö…") kırpılır — cila kalemi, sonraki geliştirme turuna aittir.

## 7. Not Edilen Davranışlar (kabul kapsamında)

1. **`GET /watch-progress/:episodeId` kayıt yokken 404 yerine 200 + sıfır durum** döndürür
   (pozisyon=0, completed=false) — kullanıcıyaScoped sorgu, başkasının verisi sızmaz;
   sözleşme dönüş tipiyle tutarlı. Kullanıcı izolasyonu F5-06d ile kanıtlandı.
2. **`GET /watchlist` sayfalama taşımaz** (sözleşme: tam liste) — favoriler küçük kişisel
   listedir; geçmiş ise sayfalıdır. Uygulama sözleşmeyle birebir.
3. **Arşivlenen içerik favori listesinden sessizce düşer** (liste yalnız PUBLISHED gösterir)
   — tutarlı ve bilinçli davranış.

## 8. Geçiş Kararı

**PASS WITH WARNINGS.** Kullanıcının kabul kriteri — "İçerik keşfi ve kullanıcıya ait
kişisel listeler doğru verilerle çalışmalı ve yetkisiz içerik erişimi olmamalı" —
gerçek kanıtlarla karşılanmıştır: katalog/arama/kişisel listeler gerçek PostgreSQL
verisiyle çalışıyor (mock kapalı, kanıtlı), taslak/arşiv/PROCESSING içerikler normal
kullanıcıya hiçbir uçta sızmıyor, kullanıcı verileri birbirine izole. Uyarılar:
dış bağımlılıkların (gerçek cihaz, Mailpit SMTP, üretim ortamı) bu ortamda
doğrulanamamış olması ve kalıtsal F2C-03 cila kaleminin açık olması. Sonraki geliştirme
fazına (mağaza/ödeme uçları ya da admin paneli UI'sı) **geçilebilir**; yukarıdaki
dış bağımlılık doğrulamaları sürüm öncesi kontrol listesine eklenmelidir.
