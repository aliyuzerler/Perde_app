# Faz 1 Raporu — Monorepo Temeli, Sözleşmeler ve Mobil İskelet

> Tarih: 2026-10-25 · Durum: ✅ Tamamlandı · Sonraki faz: Faz 2 (API Temeli)

## 1. Kapsam Özeti

Bu fazda PerdeGo'nun monorepo temeli kuruldu, paylaşılan sözleşme paketi
oluşturuldu ve sinematik koyu tema ile mobil uygulama iskeleti (4 sekme +
içerik detayı + tasarım sistemi + durum görünümleri + dev-only mock veri
katmanı) tamamlandı. Gerçek backend, video oynatma, ödeme ve admin paneli
bilinçli olarak sonraki fazlara bırakıldı (Genel Kural 2).

## 2. Değişen / Oluşturulan Dosyalar

**Kök yapılandırma (7)**
`package.json` (npm workspaces + kalite scriptleri), `tsconfig.base.json`,
`.prettierrc`, `.editorconfig`, `.gitignore`, `.env.example`, `README.md`

**packages/contracts (8)**
`package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`,
`src/index.ts`, `src/common.ts` (API zarfı + hata kodları + sayfalama),
`src/content.ts` (içerik alanı şemaları), `src/user.ts` (profil),
`src/__tests__/contracts.test.ts`

**apps/mobile — yapılandırma (7)**
`package.json` (Expo SDK 58), `app.json` (PerdeGo marka + koyu tema),
`tsconfig.json`, `metro.config.js` (monorepo), `eslint.config.js`,
`jest.config.js`, `jest.setup.js`, `README.md`

**apps/mobile — kaynak (44)**
- Rotalar: `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`,
  `(tabs)/index.tsx` (Keşfet), `(tabs)/search.tsx`, `(tabs)/watchlist.tsx`,
  `(tabs)/profile.tsx`, `src/app/content/[id].tsx`, `+not-found.tsx`
- Tasarım sistemi: `src/theme/tokens.ts`, `placeholder.ts`,
  `theme-provider.tsx`, `index.ts`
- UI: `app-text.tsx`, `app-badge.tsx`, `app-button.tsx`, `poster-card.tsx`,
  `gradient-placeholder.tsx`, `section-header.tsx`, `screen-container.tsx`
- Durum görünümleri: `loading-view.tsx`, `empty-view.tsx`, `error-view.tsx`
- Veri katmanı: `services/ports.ts`, `api-client.ts`, `adapter.ts`,
  `http-adapter.ts`, `mock/mock-data.ts`, `mock/mock-adapter.ts`
- Hook'lar: `hooks/queries/` (feed, search, detail, query-keys),
  `use-dev-profile.ts`
- Store'lar: `preferences-store.ts`, `watchlist-store.ts` (Zustand + kalıcı)
- i18n: `i18n/index.tsx`, `locales/tr.ts`, `locales/en.ts`
- Yardımcılar: `utils/format.ts`, `utils/access.ts`
- Testler (8 dosya, 49 test): tema, placeholder, i18n, mock adapter,
  api-client, format, access, poster-card

**docs (3)**
`ROADMAP.md` (7 fazlık plan + kabul kriterleri), `ARCHITECTURE.md`,
`DESIGN.md`

**Kaldırılanlar (gerekçeyle)**
create-expo-app şablonunun demo bileşenleri (animated-icon, app-tabs,
themed-*, hint-row, web-badge, collapsible, external-link), örnek ekranlar
(index, explore), `use-color-scheme`/`use-theme` hook'ları, `global.css`,
`constants/theme.ts`, `scripts/reset-project.js` — tümü, kendi tasarım
sistemimiz ve rota yapımızla değiştirilen tek kullanımlık şablon
örnekleriydi; önceki faz işi değildi.
Ayrıca `create-expo-app`'in iç içe oluşturduğu `apps/mobile/.git` kaldırıldı
(monorepo tek deposu: kök).

## 3. Önemli Mimari Kararlar

1. **npm workspaces (Turborepo değil)** — Tek paket grafiği Faz 1 için
   yeterli; build orkestrasyonu ihtiyacı doğduğunda geçiş düşük maliyetli.
2. **Adapter port deseni** — `ContentApiPort` arayüzü; mock (dev) ve HTTP
   (Faz 2) implementasyonları ekranlara dokunmadan değiştirilebilir. Seçim
   fabrikası: `__DEV__ && EXPO_PUBLIC_MOCK_API === '1'`.
3. **İki katmanlı mock koruması** — Fabrika mock'u yalnızca `__DEV__`'de
   seçer; `createMockAdapter` üretimde çağrılsa throw eder. Sahte başarı
   üretimde imkânsız (Kural 8).
4. **Sözleşmeler runtime + type düzeyinde paylaşılır** — Zod şemaları hem TS
   tipleri üretir hem mock veri/istek doğrulamasında çalışır; Faz 2'de NestJS
   DTO doğrulaması aynı şemaları kullanacak.
5. **Özgün placeholder görseller** — Afiş URL'si null ise başlıktan
   türetilen deterministik sinematik gradyan + monogram çizilir (telifli
   afiş kullanılmaz; determinizm testle korunur).
6. **Koyu tema tek yönlü** — `userInterfaceStyle: "dark"` + kendi
   ThemeProvider'ımız; sistem açık temada da koyu kalır.
7. **Kart kuralları token'a gömülü** — radius 0/2/4 sabitleri ve
   `ASPECT_RATIOS` (2:3, 9:16, 16:9) token dosyasında; ihlal edici değer
   eklenirse token testleri CI'da kırılır.
8. **Metro watchFolders daraltması** — Genel monorepo rehberi workspace kökünü
   izlemeyi önerir; sandbox inotify limiti (8192) bunu imkânsız kıldığı için
   yalnızca `packages/` izlenir. Modül çözümlemesi kök node_modules'a
   yönlendirilmiştir; bundle derleme testiyle doğrulanmıştır.
9. **typedRoutes: false (şimdilik)** — Tip üretilmiş rotalar dev sunucusu ya
   da typegen adımı gerektirir; Faz 2'de CI'a typegen adımı eklenince
   açılacaktır.

## 4. Çalıştırılacak Komutlar

```bash
# Kurulum (kökten)
npm install
cp .env.example .env   # yerel değerler; sırları depoya yazmayın

# Mobil uygulamayı başlatma
npm run mobile:start          # Expo dev server
# Expo Go ile QR okutma veya: npm run mobile:ios / mobile:android

# Kalite kapıları (her fazda zorunlu)
npm run typecheck             # contracts + mobile TS kontrolü
npm run lint                  # contracts + mobile ESLint
npm run test                  # contracts (vitest) + mobile (jest)
npx expo-doctor               # Expo bağımlılık uyumu (20/20 geçer)
```

## 5. Test Sonuçları

| Katman | Komut | Sonuç |
|--------|-------|-------|
| contracts | `npm test` (vitest) | ✅ 16/16 test geçti |
| mobile | `npm test` (jest-expo) | ✅ 49/49 test geçti (8 dosya) |
| mobile | `npm run typecheck` | ✅ Hata yok |
| mobile | `npm run lint` | ✅ 0 hata, 0 uyarı |
| contracts | `npm run typecheck` + `lint` | ✅ Temiz |
| mobile | `npx expo-doctor` | ✅ 20/20 kontrol geçti |
| mobile | Metro bundle derleme (iOS) | ✅ 1280 modül, HTTP 200 |

## 6. Eksik Dış Servis Hesapları ve Manuel Adımlar

Bu fazda dış servis **gerekmiyor**; ancak ilerleyen fazlar için hazırlık
listesi (sahip olunacaklar):

| Servis | Faz | Manuel adım |
|--------|-----|-------------|
| PostgreSQL 16 | 2 | Yerel kurulum veya Docker; `DATABASE_URL` doldurulacak |
| Redis (opsiyonel) | 2 | Yerel kurulum; `REDIS_URL` |
| Video HLS sağlayıcısı (Mux / Cloudflare Stream / MediaConvert+CloudFront) | 4 | Hesap + API anahtarı + imzalama anahtarı |
| Apple Developer hesabı | 3-5 | App ID, StoreKit yapılandırması, cihaz/build sertifikaları |
| Google Play Console hesabı | 3-5 | Uygulama kaydı, Play Billing kurulumu |
| RevenueCat | 5 | Proje + public SDK anahtarı (istemci) + secret API key (sunucu) |
| Expo EAS | 7 | `eas login`, proje sahipliği, secrets yönetimi |
| Push (APNs/FCM anahtarları) | 7 | Apple/Google konsollarından anahtar üretimi |

Manuel kurulum notları:
- `apps/mobile/assets` içindeki ikon/splash görselleri şablon
  placeholder'larıdır; marka görselleri tasarım sürecinde üretilecek
  (telifli içerik kullanılmaz).
- `.env.example` yalnızca şablondur; gerçek değerler yerel `.env`'de tutulur
  ve asla depoya yazılmaz.

## 7. Faz 2 Hazırlık Kontrolü (Kabul Kriterleri)

| Kriter (ROADMAP.md Faz 1) | Durum |
|---------------------------|-------|
| `npm install` tüm workspace'leri kurar | ✅ (1344+ paket) |
| typecheck / lint / test hata yok | ✅ 65 test yeşil, 0 lint sorunu |
| Mobil uygulama açılır; 4 sekme + detay gezilebilir | ✅ Metro smoke + bundle derlemesi doğrulandı |
| Loading/empty/error/network durumları her ekranda | ✅ Keşfet, Ara, Planım, Profil, Detay |
| Mock yalnızca DEV + flag iken aktif | ✅ İki katmanlı koruma + test |
| Tasarım kuralları (koyu tema, dikdörtgen kart, 0-4 px, oranlar) | ✅ Token + bileşen testleriyle korunuyor |

**Faz 2 için hazır.** Faz 2'de: `apps/api` (NestJS + Prisma + PostgreSQL)
iskeleti, içerik/feed/arama uçları, seed verisi ve mobil tarafın gerçek
adapter'e geçişi yapılacaktır.
