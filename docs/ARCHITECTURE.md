# PerdeGo — Mimari Rehber (v2)

> Sürüm: 2.0 · Tarih: 2026-10-25 · Bu sürüm v1'i (Faz 1 mimarisi) kapsamına
> alır ve genişletir. V1'deki katman kuralları, mock politikası ve karar
> kaydı korunmuştur; video ve ödeme altyapısı bölümleri eklenmiştir.
> Fiyat/vergi rakamlarının doğrulama tarihi: **2026-10-25** (kaynaklar bölüm
> içinde belirtilmiştir).

## 1. Sistem Bağlamı

```
┌─────────────────┐  HTTPS/REST   ┌──────────────────┐      ┌───────────────┐
│   apps/mobile   │──────────────▶│     apps/api     │─────▶│  PostgreSQL   │
│  Expo RN (SDK58)│   /api/v1     │ NestJS (REST)    │      └───────────────┘
└───────┬─────────┘               │                  │      ┌───────────────┐
        │ HLS (imzalı URL)        │  ┌────────────┐  │─────▶│ Redis + BullMQ│
        ▼                         │  │ Prisma ORM │  │      └───────────────┘
┌─────────────────┐               └──┴─────┬──────┴──┘      ┌───────────────┐
│ Video sağlayıcı │◀──── adapter ─────────┤───────────────▶│ Mağaza API'leri│
│ Bunny/CF/Mux    │                       │                │ Apple ASC /   │
│ (HLS + CDN)     │◀──── webhook ─────────┤                │ Google Play   │
└─────────────────┘                       │                └───────────────┘
┌─────────────────┐   REST   ┌────────────▼─────┐  ┌───────────────┐
│  apps/admin     │─────────▶│ Bildirim servisi │─▶ APNs / FCM   │
│  Next.js+TW     │          │ (BullMQ worker)  │  (Expo Push)   │
└─────────────────┘          └──────────────────┘  └───────────────┘
        ▲
        └── packages/contracts (paylaşılan Zod şemaları — tek gerçek kaynak)
```

**Temel ilke:** İstemci asla yetki kaynağı değildir. Mobil uygulama ne derse
desin, oynatma URL'si yalnızca sunucu yetki kontrolünden sonra üretilir
(Genel Kural 10, `PRD.md` BR-07).

## 2. Depo Yapısı

```
perdego/
├── apps/
│   ├── mobile/          # React Native + Expo (SDK 58) + Expo Router  ✅ Faz 1
│   ├── api/             # NestJS REST API (Faz 2'de eklenecek)
│   └── admin/           # Next.js yönetim paneli (Faz 6'da eklenecek)
├── packages/
│   └── contracts/       # Paylaşılan Zod şemaları + TS tipleri        ✅ Faz 1
├── docs/                # PRD, mimari, ERD, API sözleşmesi, güvenlik...
├── package.json         # npm workspaces kökü
└── tsconfig.base.json
```

## 3. Mobil Mimari (apps/mobile)

Faz 1'de uygulanan katmanlar **değişmeden** korunur; Faz 2–5'te yalnızca
`services/` katmanına yeni portlar eklenir:

```
app/ (ekranlar, Expo Router)          ← yalnızca görünüm; DB/ödeme mantığı YASAK
  ▼
components/ (tasarım sistemi)         ← saf sunum; veri çekmez
  ▼
hooks/queries/ (TanStack Query)       ← sunucu durumu; cache/invalidation
  ▼
services/ (port + adapter fabrikası)  ← ContentApiPort (Faz 2'de HTTP adapter),
  ▼                                      AuthApiPort (Faz 3), PlaybackApiPort (Faz 4),
packages/contracts                       BillingApiPort (Faz 5)
```

- **Port-adapter deseni** zaten devrede: mock ve gerçek adapter aynı arayüzü
  uygular; ekranlar fabrika dışındaki hiçbir sınıfı bilmez.
- **Ödeme portunun konumu:** Mağaza SDK çağrıları (StoreKit/Play Billing)
  `services/billing/` altında `StorePurchasePort` arkasına alınır; ekranlar
  yalnızca "satın al → doğrula" akışını tetikler. Doğrulama **daima** apps/api
  üzerinden yapılır; istemci SDK yanıtı tek başına yetki vermez.
- **Oynatma:** `expo-video` kullanılır; oynatıcı, `PlaybackApiPort`'tan gelen
  kısa ömürlü imzalı HLS URL'si ile beslenir. URL önbelleklenmez.
- **Durum yönetimi:** Sunucu durumu TanStack Query; istemci durumu Zustand
  (persist AsyncStorage); formlar React Hook Form + Zod (Faz 3).

## 4. Backend Mimari (apps/api)

NestJS, katmanlı yapı: `controller → service → repository(Prisma)`. DTO
doğrulaması `packages/contracts` şemalarıyla (runtime validation) yapılır.

**Modül haritası:**

| Modül | Sorumluluk | Dış bağımlılık |
|-------|------------|----------------|
| `auth` | kayıt/giriş, JWT (RS256) access+refresh rotasyonu, cihaz oturumları, hesap silme | — |
| `users` | profil, tercihler, silme/anonimleştirme iş akışı | BullMQ (silme işi) |
| `catalog` | içerik/kategori/season/episode sorguları, feed/arama | Redis (feed cache, opsiyonel) |
| `playback` | yetki kararı → imzalı oynatma token'ı, ilerleme kaydı | `VideoProviderAdapter` |
| `library` | izleme geçmişi, devam et, favoriler | — |
| `billing` | ürün kataloğu, satın alma doğrulama, abonelik durumu, iade işleme | RevenueCat veya mağaza API'leri, webhook'lar |
| `credits` | cüzdan, **ledger** (append-only), bölüm kilidi açma (atomik) | — |
| `notifications` | cihaz token'ları, bildirim CRUD, tercihler, kampanya gönderimi | Expo Push, BullMQ |
| `admin` | panel uçları (ayrı RBAC guard), denetim kaydı | — |
| `webhooks` | Apple Server Notifications V2, Google RTDN; imza doğrulama → BullMQ | — |

**Kuyruk kullanımı (Redis + BullMQ):** webhook işleme, video işleme durumu
yoklaması, bildirim gönderimi, hesap silme/anonimleştirme. Kritik kural:
webhook handler yalnızca imzayı doğrular + ham olayı kaydeder (`webhook_events`)
+ kuyruğa atar; iş mantığı worker'da idempotent çalışır.

**Ledger kuralı (BR-04):** `credit_ledger` tablosuna UPDATE/DELETE izni yoktur
(bkz. `ERD.md`). Bakiye, aynı veritabanı işleminde (transaction, `SELECT … FOR
UPDATE` ile cüzdan kilidi) türetilir. Kilit açma + kredi düşümü tek atomik
işlemdir; DB düzeyinde `unique(userId, episodeId)` ikinci kez açmayı imkânsız
kılar.

## 5. Admin Paneli (apps/admin)

Next.js + Tailwind; API'yi aynı `/api/v1` uçlarından, aynı sözleşmelerle
kullanır. **Admin kimlik doğrulaması mobil kullanıcılarla aynı hesap
tablosunu paylaşır ama ayrı `role` claim'i (ADMIN/EDITOR) ve ayrı MFA
zorunluluğu taşır.** Yazma işlemleri `audit_logs` tablosuna denetim kaydı
üretir. Panel doğrudan veritabanına ve video sağlayıcıya **bağlanmaz**;
video yükleme, API'nin `VideoProviderAdapter`'ı üzerinden presigned upload
URL'i üretilerek yapılır.

## 6. Video Altyapısı

### 6.1 Sağlayıcı Karşılaştırması (fiyatlar 2026-10-25'te doğrulandı)

| Kriter | **Bunny Stream** | **Cloudflare Stream** | **Mux** |
|--------|------------------|----------------------|---------|
| Kodlama (encoding) | Ücretsiz | Ücretsiz | Ücretsiz (dosya girişi, 720p–4K) |
| Depolama | **$0,01/GB/ay** | **$5/ay per 1.000 dk** (süre bazlı, ön ödemeli blok) | 1080p: **$0,003/dk/ay** (720p $0,0024; soğuk depoya kadar %60 indirim) |
| Teslim (CDN) | **$0,005/GB** | **$1/1.000 dk teslim** (bant genişliği dahil) | İlk 100K dk/ay ücretsiz; sonra 720p **$0,0008/dk**, 1080p **$0,001/dk** |
| Faturalama modeli | GB bazlı (bit hızı düşükse daha ucuz) | **Süre bazlı** (bit hızından bağımsız, tahmin edilmesi en kolay) | DK/GB karışımı + ücretsiz kota |
| İmzalı erişim | Token authentication (imzalı, süreli URL) | `requireSignedURLs` + imzalı URL | İmzalı oynatma token'ları (JWT playback policy) |
| DRM | MediaCage Basic (ücretsiz) / Enterprise (Widevine+FairPlay, ek ücret) | Yok (yönetilen anahtar yok) | DRM (ek ücret) |
| Geliştirici deneyimi | Basit API, React Native/Expo SDK | Tek API, Cloudflare ekosistemi | En iyi analitik (QoE/rebuffer metrikleri) |
| Min. aylık harcama | ~$3,25–4,50 (hesaplayıcı alt sınırı) | Depolama blok satın alınır | Pay-as-you-go + $20/ay kullanım kredisi |

Kaynaklar (tümü 2026-10-25'te resmi sayfalardan okundu):
`developers.cloudflare.com/stream/pricing` (sayfa güncellemesi 15.10.2026),
`bunny.net/stream`, `bunny.net/pricing`, `mux.com/pricing`.
Fiyatlar USD, vergisizdir; kesin rakamlar yayın öncesi yeniden doğrulanmalıdır
(`COST_ESTIMATE.md` §7).

### 6.2 Karar ve Gerekçe

**Birincil sağlayıcı: Bunny Stream.** MVP trafiği (5–50K MAU senaryoları,
`COST_ESTIMATE.md`) üzerinden üç sağlayıcı da uygun olmakla birlikte Bunny,
dikey kısa içerikte (720p/1080p ağırlıklı, düşük bit hızı) GB bazlı
fiyatlandırma sayesinde en düşük teslim maliyetini verir (~$84–848/ay aralığı;
aynı yük CF'de $750–7.500, Mux'ta ~$585–6.660). Kodlamanın ücretsiz ve
React Native/Expo SDK'sının bulunması entegrasyon maliyetini düşürür.

**Riskler ve önlemler:**

| Risk | Önlem |
|------|-------|
| Bunny'nin tek başına DRM/enterprise özellikleri sınırlı kalması | Adapter soyutlaması sayesinde Mux'a geçiş yalnızca yeni adapter sınıfı + env anahtarları demektir |
| Fiyat politika değişikliği | Tüm maliyet uçları `episode_media.provider` alanında sağlayıcıya bağlı; replikasyon aracı (asset migration job) planlı |
| Türkiye/Trakya gecikmesi | Bunny'nin İstanbul PoP'u ile test; sorun görülürse geo-replication eklenebilir |

**Kabul kriteri (Faz 4):** Sağlayıcı değişikliği senaryosu tatbikatta test
edilir — kod değişikliği yalnızca `apps/api/src/video/` altında kalır ve
`packages/contracts`'a dokunmaz.

### 6.3 Adapter Mimarisi (sağlayıcı bağımsızlığı)

```
apps/api/src/video/
├── video-provider.adapter.ts   # arayüz (port)
├── bunny/
│   ├── bunny.adapter.ts
│   └── bunny.config.ts         # env: BUNNY_LIBRARY_ID, BUNNY_API_KEY, BUNNY_TOKEN_SIGNING_KEY
├── cloudflare/ (Faz 4'te ikinci implementasyon, geçiş doğrulaması için)
└── video.module.ts
```

```ts
// Sağlayıcıdan bağımsız sözleşme — tüm implementasyonlar bunu uygular
export interface VideoProviderAdapter {
  /** Master dosyayı sağlayıcıya yükler; asset kimliği döner. */
  createUpload(input: { episodeId: string; filename: string }):
    Promise<{ assetId: string; uploadUrl: string; method: 'PUT' | 'TUS' }>;
  /** Encode durumunu sorgular. */
  getAssetStatus(assetId: string):
    Promise<{ state: 'PROCESSING' | 'READY' | 'ERROR'; durationSeconds?: number }>;
  /** Sunucu tarafından imzalı, kısa ömürlü oynatma bilgisi üretir. */
  createPlayback(input: { assetId: string; userId: string; ttlSeconds: number }):
    Promise<{ playbackUrl: string; expiresAt: string; provider: VideoProvider }>;
  /** Asset'i kalıcı siler (KVKK/gizlilik ve depolama maliyeti). */
  deleteAsset(assetId: string): Promise<void>;
}
```

Kurallar: (1) `episode_media` tablosunda sağlayıcı adı + asset kimliği saklanır;
(2) mobil uygulamaya sağlayıcı adı sızmaz — yalnızca `playbackUrl` + `expiresAt`
gider; (3) TTL varsayılan **300 saniye**, yenileme mevcut oturum üzerinden
yapılır; (4) adapter testleri sağlayıcıya karşı değil, sözleşme testleriyle
(HLS manifest GET 200 + imzasız URL 403) koşulur.

## 7. Ödeme Altyapısı

### 7.1 Mağaza Politikası Gereksinimleri (2026-10-25'te doğrulandı)

**Apple (App Store):**
- Dijital içerik ve krediler **IAP zorunlu**; ürün türleri: consumable
  (kredi paketi), non-consumable, auto-renewable subscription
  (`developer.apple.com/in-app-purchase`).
- Komisyon: **%15** (Small Business Program; önceki yıl ≥ $1M değilse) /
  standart %30 (`developer.apple.com/app-store/small-business-program`).
- Abonelik durumu/iade bildirimleri: **App Store Server Notifications V2 +
  App Store Server API** ("near-real time status updates for refunds,
  subscription state…" — resmi sayfa).
- Satın alınan kredilerin süresizliği (BR-05): birincil sözleşme metni bu
  çalışmada doğrulanamadı → tasarım güvenli tarafa alınır (satın alınan
  krediye süre koymayız) ve Faz 6'da güncel PLA Schedule 2 metni hukuk
  incelemesinden geçirilir (bkz. `RELEASE_PLAN.md`).
- Çapraz platform: iOS'ta alınan abonelik/krediler Android uygulamasında da
  geçerli olmalıdır (multiplatform erişim) — yetki sunucuda tutulur.

**Google Play:**
- Dijital ürünler (sanal para dahil) **Play Billing zorunlu**; sanal para
  yalnızca satın alındığı uygulama içinde kullanılabilir
  (`support.google.com/googleplay/android-developer/answer/18258653`).
- Servis bedeli (Türkiye dahil "kalan pazarlar"): abonelikler **%15**;
  diğer işlemler ilk $1M/yıl **%15**, üzeri %30 (`…/answer/112622`).
  Not: ABD/AB/UK/JP/AU için 2026'dan itibaren yeni tablo (abonelik
  %10 + %5 faturalama bedeli vb.) geçerli olup global yayılma
  izlenmelidir.
- İade/iptal: RTDN (Real-time Developer Notifications) + Play Developer API
  (`subscriptionsv2.get`, voided purchases) ile sunucu senkronizasyonu.

### 7.2 Karar: RevenueCat + platform-agnostic entitlement

**Karar:** Mobilde **RevenueCat SDK** (StoreKit + Play Billing üstünde),
sunucuda **RevenueCat Webhooks + REST entitlements**.

- **Neden:** İki mağazanın da (receipt/JWS doğrulama, yenileme, grace
  period, iade, aile paylaşımı) durum makinesini tek entegrasyonla alır;
  $2.500 aylık takip edilen gelire kadar ücretsiz, sonrasında %1 — MVP'de
  toplam maliyeti sıfıra yakın tutar (fiyat 2026-10-25'te
  `revenuecat.com/pricing`'ten doğrulandı).
- **Kapsam sınırı:** RevenueCat yalnızca **mağaza senkronizasyonu** yapar.
  Yetki (entitlement) kararları bizim sunucumuzda, bizim tablolarımızda
  durur (`subscriptions`, `store_transactions`, `credit_ledger`). Vendor
  lock-in testi: RC kapatılırsa doğrulama `apps/api/src/billing/validators/`
  altında doğrudan App Store Server API + Play Developer API
  implementasyonlarına geçer (Faz 5'te kontrat testleriyle kanıtlanır).
- **Mock politikası (Genel Kural 8):** Mock ödeme adapter'ı yalnızca
  `NODE_ENV=development` ve `__DEV__` iken aktif; üretim derlemesinde mock
  yol derleme zamanı `throw` eder. Üretimde mock satın alma imkânsızdır.

### 7.3 Satın Alma ve Kilit Açma Akışları

```
KREDİ SATIN ALMA (idempotent):
mobile ── RC SDK purchase ──▶ App/Play Store
mobile ── POST /billing/purchases/validate (Idempotency-Key) ──▶ apps/api
apps/api ── RC/Store API doğrulama ──▶ store_transactions (unique kısıt)
apps/api ── TX{ credit_ledger(PURCHASE, +N) + wallet güncelle } ──▶ yanıt
(replay aynı Idempotency-Key ile → aynı yanıt, yeni ledger kaydı YOK)

BÖLÜM KİLİDİ AÇMA (atomik):
mobile ── POST /playback/episodes/:id/unlock (Idempotency-Key)
apps/api ── TX{
  SELECT episode (accessType=CREDIT?)
  SELECT episode_unlocks (varsa → 200, tekrar ücret YOK)
  SELECT wallet FOR UPDATE (bakiye yeterli mi? → değilse 402 INSUFFICIENT_CREDITS)
  INSERT credit_ledger(UNLOCK_SPEND, -F) + UPDATE wallet + INSERT episode_unlocks
}
apps/api ── 200 { unlocked: true }  → mobil oynatma oturumu ister
```

Abonelik durumu değişimleri mağaza webhook'larından (RC Webhook / Apple V2 /
RTDN) gelir; ham olay `webhook_events`'e yazılır, BullMQ worker idempotent
işler (`eventId` unique), abonelik durum makinesi güncellenir (BR-10, BR-12).

## 8. Bildirim Mimarisi

- Mobil: `expo-notifications`; token'lar `devices` tablosunda.
- Sunucu: BullMQ worker → Expo Push API (tek uç, hem APNs hem FCM).
- Tetikleyiciler: admin bölüm yayınlayınca `NEW_EPISODE` job'ı (favori +
  kategori abonelerine, tercih filtresinden geçenlere, rate-limit'li);
  kampanya bildirimleri admin panelinden (F-55).
- Uygulama içi bildirim merkezi `notifications` tablosundan beslenir;
  push ve uygulama içi kayıt aynı `notification_id`'yi paylaşır.

## 9. Önbellek ve Performans

- Feed yanıtı Redis'te 60 sn TTL ile (opsiyonel — trafiği gerekçelendirdiğinde
  açılır); içerik detayı kısa TTL; arama DB'de (Postgres trigram/GIN) kalır.
- Görseller (afiş/hero) sağlayıcı CDN'i üzerinden; mobil taraf `expo-image`
  önbelleği.
- Masaüstü web için ayrı istemci MVP dışıdır; API CORS beyaz listesi yalnızca
  bilinen istemcileri içerir.

## 10. Dağıtım Topolojisi (hedef)

| Bileşen | Ortam (MVP) | Not |
|---------|-------------|-----|
| apps/api | Docker imaj → tek sunucu + reverse proxy (Nginx/Caddy) | Yatay ölçekleme gerektiğinde container platformuna taşınır; stateless tasarım şartı |
| PostgreSQL | Yönetilen servis (yedekli) | PITR zorunlu |
| Redis | Yönetilen ya da aynı sunucuda | Kuyruk + throttle sayacı |
| apps/admin | Vercel/static export + API proxy | Kimlik doğrulamalı; botlara kapalı |
| Maliyet | `COST_ESTIMATE.md` | Senaryo tabloları buradan referanslı |

## 11. Karar Kaydı (güncel)

| # | Karar | Gerekçe |
|---|-------|---------|
| D1 | npm workspaces (Turborepo yok) | Faz 1'de tek paket grafiği yeterli (v1'den devralındı) |
| D2 | Sözleşmeler kaynak-TS paylaşılır | Metro TS derler; NestJS için `dist/` çıktısı Faz 2'de eklenir |
| D3 | Port-adapter deseni her dış bağımlılıkta | Mock/gerçek ve sağlayıcı geçişi tek fabrikada |
| D4 | Koyu tema tek yönlü | Marka gereği; `userInterfaceStyle: dark` |
| D5 | Video: Bunny Stream birincil + `VideoProviderAdapter` | §6.2 maliyet analizi; CF ikinci implementasyon olarak Faz 4'te yazılır (geçiş provası) |
| D6 | Ödeme: RevenueCat + sunucu-sahibi entitlement | §7.2; iki mağaza durum makinesi tek entegrasyon; vendor çıkış yolu contract-test ile korunur |
| D7 | Kredi modeli: satın alınan (süresiz) + hediye (süresiz olabilir) ayrımı | BR-05 Apple uyumu; ledger `purchasedDelta`/`grantedDelta` ayrımı ile |
| D8 | Webhook'lar: önce imza+ham kayıt, işleme kuyrukta | Tekrar teslim (at-least-once) toleransı; idempotent worker |

## 12. i18n ve Test Stratejisi

i18n kuralları v1'den değişmedi (kodu İngilizce, kullanıcı metinleri sözlükten,
varsayılan `tr`). Sunucu metinleri Faz 2'de `*_tr`/`*_en` kolonlarıyla gelir.

Test stratejisi v1 tablosunun üzerine Faz 2+ için şunları ekler: API uçlarında
`supertest` e2e (zarf şema doğrulamalı), `credits` modülü için **concurrency
testleri** (paralel unlock → tek düşüm), billing için **webhook replay**
testleri, video adapter'ları için sözleşme testleri.
