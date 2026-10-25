# PerdeGo — Mimari Rehber

## 1. Sistem Genel Bakış

```
┌──────────────┐     HTTPS/REST      ┌──────────────┐      ┌─────────────┐
│  apps/mobile │ ──────────────────▶ │   apps/api   │ ───▶ │ PostgreSQL  │
│  Expo + RN   │                     │  NestJS      │      └─────────────┘
└──────────────┘                     │  /api/v1     │ ───▶ ┌─────────────┐
                                     └──────┬───────┘      │ Redis (opt.)│
                                            │              └─────────────┘
                     ┌──────────────┐       │
                     │  apps/admin  │ ◀─────┤────▶ Video sağlayıcı (HLS, Faz 4)
                     │  Next.js     │       │────▶ Ödeme doğrulama (Faz 5)
                     └──────────────┘       │────▶ Bildirim servisi (Faz 7)
                                            │
                                     ┌──────▼───────┐
                                     │ packages/    │
                                     │ contracts    │ (paylaşılan sözleşmeler)
                                     └──────────────┘
```

## 2. Depo Yapısı

```
perdego/
├── apps/
│   ├── mobile/          # React Native + Expo (SDK 58) + Expo Router
│   ├── api/             # NestJS REST API (Faz 2'de eklenecek)
│   └── admin/           # Next.js yönetim paneli (Faz 6'da eklenecek)
├── packages/
│   └── contracts/       # Paylaşılan Zod şemaları + TS tipleri
├── docs/                # Mimari, tasarım sistemi, faz raporları
├── package.json         # npm workspaces kökü
└── tsconfig.base.json   # Ortak TS derleyici ayarları
```

## 3. Katman Kuralları (Genel Kurallar 4-5)

**Mobil uygulama katmanları:**

```
app/ (ekranlar, Expo Router)        ← yalnızca görünüm; DB/ödeme mantığı YASAK
  ▼
components/ (tasarım sistemi)       ← saf sunum; veri çekmez
  ▼
hooks/queries/ (TanStack Query)     ← sunucu durumu; cache/invalidation
  ▼
services/ (adapter + api-client)    ← ağ soyutlaması; mock/gerçek geçişi buradan
  ▼
packages/contracts                  ← ortak şema doğrulama
```

- Ekran bileşenleri yalnızca hook'lar ve bileşenlerle çalışır; doğrudan `fetch`
  çağrısı ekran içinde yasaktır.
- İş mantığı (erişim kararları, fiyat, kilit) sunucudadır. İstemci yalnızca
  sunucunun verdiği `accessType` ve ileride `access` alanlarını gösterir (Kural 10).

**API katmanları (Faz 2):** controller → service → repository (Prisma). DTO'lar
`packages/contracts` şemalarıyla doğrulanır; entity'ler dışarı sızmaz.

## 4. Veri Akışı ve Durum Yönetimi

- **Sunucu durumu**: TanStack Query. Query anahtarları `hooks/queries/query-keys.ts`
  içinde merkezi tutulur. Mock adapter, gerçek adapter ile aynı arayüzü
  (`ContentApiPort`) uygular — Faz 2'de yalnızca fabrika değişir.
- **İstemci durumu**: Zustand (ör. oynatma tercihleri). Kalıcılık AsyncStorage +
  `persist` middleware ile.
- **Form durumu**: React Hook Form + Zod resolver (Faz 3'te devreye girer).

## 5. Mock Policy (Kural 8)

- Mock adapter `src/services/mock/` altındadır ve **yalnızca** `__DEV__ &&
  EXPO_PUBLIC_MOCK_API=1` iken seçilir.
- Üretim derlemesinde mock yolu derleme zamanında `throw` eder: sahte başarı
  yanıtı üretimde imkânsızdır.
- Mock veriler özgün kurgu başlıklar kullanır; gerçek yapımların afişleri
  kullanılmaz (Tasarım Zorunlulukları).

## 6. Güvenlik İlkeleri

1. Hassas anahtarlar mobil pakete girmaz; yalnızca `EXPO_PUBLIC_` önekiyle
   *günlükte gizli olmayan* değerler istemciye konur.
2. Video URL'leri Faz 4'te kısa ömürlü imzalı token ile sunucudan verilir.
3. Ödeme/abonelik doğrulaması Faz 5'te sunucu webhook'larıyla yapılır.
4. API zarfında hatalar makine kodu + çevrilebilir mesaj anahtarı taşır; ham
   sunucu hatası istemciye gösterilmez.

## 7. i18n (Kural 6)

- Kod içindeki isimler İngilizce; kullanıcıya görünen tüm metinler `src/i18n/`
  sözlüklerinden gelir. Varsayılan dil `tr`.
- `t('key')` fonksiyonu sözlükte eksik anahtar bulursa geliştirmede uyarı basar ve
  anahtarın kendisini döner; bu, eksik çevirinin üretime sızmaması içindir.
- Sunucudan gelen dinamik metinler (bölüm başlıkları vb.) Faz 2'de yerelleştirme
  kolonları ile desteklenecektir.

## 8. Test Stratejisi

| Katman | Araç | Kapsam |
|--------|------|--------|
| contracts | Vitest | Zod şema doğrulama davranışı |
| mobile (unit) | Jest + jest-expo | tema token'ları, i18n, mock adapter, yardımcılar |
| mobile (component) | @testing-library/react-native | kritik bileşenler (PosterCard vb.) |
| api (Faz 2) | Jest + supertest | servis birim testleri + e2e uç testleri |
| admin (Faz 6) | Jest / Playwright (karar Faz 6'da) | form ve akış testleri |

## 9. Karar Kaydı (Önemli Mimari Kararlar)

- **npm workspaces (Turborepo değil)**: Faz 1'de tek paket grafiği yeterli; build
  orkestrasyonuna ihtiyaç doğduğunda Turborepo eklenecek (geçiş düşük maliyetli).
- **Sözleşmeler kaynak-TS olarak paylaşılır**: Metro TS'i derler. Faz 2'de NestJS
  için `tsc` çıktısı (`dist/`) üretimi eklenecek; `exports` alanı hazır.
- **Adapter port deseni**: `ContentApiPort` arayüzü mock ve gerçek implementasyonları
  birbirinin yerine takılabilir kılar; Faz 2'de mobilde değişiklik yalnızca fabrikada.
- **Koyu tema tek yönlü**: marka gereği uygulama yalnızca koyu temayla çalışır;
  sistem açık temada da koyu kalır (`userInterfaceStyle: dark`).
