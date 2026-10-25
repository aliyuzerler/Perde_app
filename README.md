# PerdeGo

Dikey kısa film ve mini dizi izleme platformu — sinematik, modern, premium, koyu.

## Depo Yapısı

| Yol | Açıklama |
|-----|----------|
| `apps/mobile` | React Native + Expo (SDK 58) + Expo Router mobil uygulama |
| `apps/api` | NestJS REST API (Faz 2'de eklenecek) |
| `apps/admin` | Next.js yönetim paneli (Faz 6'da eklenecek) |
| `packages/contracts` | Paylaşılan Zod şemaları + TypeScript tipleri |
| `docs/` | Mimari, tasarım sistemi ve faz raporları |

## Hızlı Başlangıç

Gereksinimler: Node.js >= 20, npm >= 10, Expo Go (mobil cihaz/emülatör).

```bash
# 1. Kurulum (kök dizinden tüm workspace'ler)
npm install

# 2. Ortam değişkenleri
cp .env.example .env   # yerel değerleri doldurun; sırları depoya yazmayın

# 3. Mobil uygulamayı başlat
npm run mobile:start
# ardından Expo Go ile QR kodu okutun veya emülatör açın
```

## Kalite Komutları

```bash
npm run typecheck   # tüm workspace'lerde TypeScript kontrolü
npm run lint        # tüm workspace'lerde ESLint
npm run test        # tüm workspace'lerde testler
```

## Dokümantasyon

- [Faz Yol Haritası](docs/ROADMAP.md)
- [Mimari Rehber](docs/ARCHITECTURE.md)
- [Tasarım Sistemi](docs/DESIGN.md)
- [Faz Raporları](docs/phases/)

## Not

- Geliştirme sırasında içerik verisi `EXPO_PUBLIC_MOCK_API=1` iken dev-only mock
  adapter'den gelir. Üretim derlemelerinde mock yol kapalıdır.
- Gerçek sırlar yalnızca yerel `.env` dosyalarında tutulur; `.env.example`
  şablon olarak depoda durur.
