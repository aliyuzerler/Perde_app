# PerdeGo — Faz Yol Haritası

> Dikey kısa film ve mini dizi izleme platformu.
> Bu belge faz kapsamlarını ve kabul kriterlerini tanımlar. Her faz, bir önceki
> fazın kabul kriterleri karşılanmadan başlatılmaz (bkz. Genel Kural 2).

## Faz Özeti

| Faz | Ad | Ana Çıktı | Durum |
|-----|----|-----------|-------|
| 1 | Monorepo Temeli, Sözleşmeler ve Mobil İskelet | Çalışan workspace yapısı, `@perdego/contracts`, tasarım sistemli mobil iskelet (mock veri) | ✅ Tamamlandı |
| 2 | API Temeli ve İçerik Hizmeti | NestJS + Prisma + PostgreSQL, içerik/feed/arama uçları, mobil uygulamanın gerçek API'ye bağlanması | 🚧 2a altyapı tamam (health, DB, admin iskelet, pnpm) — 2b içerik uçları sıradaki |
| 3 | Kimlik Doğrulama ve Hesaplar | Kayıt/giriş, JWT access/refresh, cihaz oturumları, profil yönetimi | ⏳ |
| 4 | Video Akışı ve Oynatma | HLS entegrasyonu, `expo-video`, sunucu tarafı erişim doğrulaması, izleme geçmişi | ⏳ |
| 5 | Abonelik, Kredi ve Ödemeler | RevenueCat + StoreKit/Play Billing, kredi bakiyesi, sunucu doğrulaması | ⏳ |
| 6 | Admin Paneli | Next.js + Tailwind: içerik/bölüm yönetimi, kullanıcı ve abonelik görünümleri | ⏳ |
| 7 | Bildirimler ve Yayın Hazırlığı | Expo Notifications, performans/sertleştirme, EAS build, mağaza hazırlığı | ⏳ |

---

## Faz 1 — Monorepo Temeli, Sözleşmeler ve Mobil İskelet

**Kapsam**
- npm workspaces tabanlı monorepo (`apps/*`, `packages/*`), ortak TS/ESLint/Prettier yapılandırması.
- `packages/contracts`: içerik, kullanıcı ve API zarfı sözleşmeleri (Zod + TypeScript).
- `apps/mobile`: Expo SDK + Expo Router iskeleti, sinematik koyu tema, 4 sekme
  (Keşfet / Ara / Planım / Profil), tasarım sistemi ilk bileşenleri,
  loading/empty/error/network durumları, dev-only mock adapter,
  TanStack Query + Zustand + i18n altyapısı.
- `docs/`: yol haritası, mimari ve tasarım sistemi dokümanları.

**Kapsam Dışı (sonraki fazlar)**: gerçek backend, video oynatma, ödeme, admin.

**Kabul Kriterleri**
1. `npm install` kök dizinden tüm workspace'leri kurar.
2. `npm run typecheck`, `npm run lint`, `npm run test` üçünde de hata yok.
3. Mobil uygulama `npx expo start` ile açılır; 4 sekme ve içerik detayı gezilebilir.
4. Tüm liste/ekranlar loading, empty, error ve network-failure durumlarını gösterir.
5. Mock adapter yalnızca `__DEV__` ve `EXPO_PUBLIC_MOCK_API=1` iken aktiftir.
6. Tasarım kuralları uygulanmıştır: koyu sinematik tema, dikdörtgen kartlar,
   0–4 px köşe yarıçapı, oranlara saygılı görsel alanları.

## Faz 2 — API Temeli ve İçerik Hizmeti

**Kapsam**
- `apps/api`: NestJS (REST, `/api/v1`), katmanlı mimari (controller/service/repository).
- PostgreSQL + Prisma: Content, Season, Episode, Genre, CastMember şemaları, seed verisi.
- Uçlar: `GET /feed`, `GET /content/:slug`, `GET /search`, healthcheck.
- Redis önbellek katmanı (feed yanıtı) — yalnızca gerekiyorsa.
- Mobilde mock adapter'in gerçek API adapter'i ile değiştirilmesi (özelliğe göre kademeli).

**Kabul Kriterleri**
1. API Docker/yerel PostgreSQL ile ayağa kalkar; uçlar sözleşme şemalarına uyan yanıt döner.
2. Sözleşme şemaları API yanıt doğrulamasında kullanılır (runtime validation).
3. Mobil uygulama mock yerine gerçek API'den feed çeker; `EXPO_PUBLIC_MOCK_API=0` ile.
4. API tarafı için birim + e2e testleri yeşildir.

**Durum**: 🚧 2a + 2b tamam — 21+ tabloluk PostgreSQL şeması, 13 NestJS
modülü, Swagger, gerçek PostgreSQL entegrasyon testleri ve canlı smoke;
mobil gerçek adapter geçişi kaldı (Faz 3b auth uçları hazır: `EXPO_PUBLIC_MOCK_API=0`
ile katalog uçları bağlanır). Bkz. `docs/phases/FAZ-2.md`, `docs/phases/FAZ-2B.md`.

## Faz 3 — Kimlik Doğrulama ve Hesaplar

**Kapsam**: kayıt/giriş (e-posta), JWT access/refresh rotasyonu, cihaz oturumları,
çıkış, profil güncelleme, korumalı uçlar, mobilde React Hook Form + Zod formlar,
token saklama (secure store), auth interceptor.

**Kabul Kriterleri**: korumalı uca tokensız erişim 401 döner; refresh akışı
otomatik çalışır; formlar doğrulama hatalarını Türkçe gösterir.

**Durum**: ✅ 3a (mobil UI) + **3b (uçtan uca kimlik)** tamam — argon2id +
RS256/refresh rotasyonu sunucuda; e-posta doğrulama, parola sıfırlama/
değiştirme, oturum listesi/iptali, avatar altyapısı, hesap silme + nefallet/
geri alma, yasal metinler, rate limit ve Mailpit/outbox e-posta altyapısı
devrede; mobil SecureStore + otomatik refresh + güvenli yönlendirme bağlı.
Kanıt: `docs/phases/FAZ-3B.md` (109 API + 87 mobil test, 22/22 canlı probe).

## Faz 4 — Video Akışı ve Oynatma

**Kapsam**: HLS yayın sağlayıcı entegrasyonu (imzalı kısa süreli URL'ler),
`expo-video` oynatıcı, dikey tam ekran oynatma, sunucu tarafı erişim kararı
(abonelik/kredi/bölüm kilidi), izleme geçmişi ve "devam et",带宽 dostu kalite
seçimi (ABR).

**Kabul Kriterleri**: imzasız/erişimsiz video URL'si sunucudan alınamaz; oynatma
izleme noktası sunucuya senkronize edilir; düşük bağlantıda network-failure durumu
zarif yönetilir.

## Faz 5 — Abonelik, Kredi ve Ödemeler

**Kapsam**: RevenueCat entegrasyonu (StoreKit + Play Billing), abonelik planları,
kredi paketleri ve kredi bakiyesi, sunucu tarafı webhook doğrulaması, entitlement
kontrolü (Kural 10). Mock ödeme yalnızca geliştirmede, `__DEV__` korumalı.

**Kabul Kriterleri**: istemci tek başına yetki veremez; webhook imzası doğrulanır;
kredi düşümü atomik (transaction) yapılır.

## Faz 6 — Admin Paneli

**Kapsam**: `apps/admin` (Next.js + Tailwind): oturum açma, içerik CRUD, sezon/bölüm
yönetimi, medya yükleme iş akışları, kullanıcı/abonelik listeleri ve arama,
temel metrikler.

**Kabul Kriterleri**: tüm yazma işlemleri role göre kısıtlıdır; panel mobil API ile
aynı sözleşmeleri paylaşır.

## Faz 7 — Bildirimler ve Yayın Hazırlığı

**Kapsam**: Expo Notifications (yeni bölüm/izleme hatırlatıcısı), backend bildirim
servisi, performans denetimi, güvenlik sertleştirme, EAS build/profiller, mağaza
metaverisi, hata izleme (Sentry benzeri).

**Kabul Kriterleri**: bildirim izin akışı doğru; release build üzerinde smoke test
geçer; sırlar yalnızca EAS secrets/ortam değişkenlerinden gelir.
