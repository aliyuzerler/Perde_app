# PerdeGo Mobil Uygulama

React Native + Expo (SDK 58) + Expo Router. Koyu sinematik tema, dikey kısa
film ve mini dizi izleme deneyimi.

## Çalıştırma

```bash
# Kök dizinden
npm run mobile:start

# veya bu dizinden
npx expo start
```

Expo Go ile QR kodu okutun ya da iOS/Android emülatörü kullanın.

## Yapı

```
src/
├── app/              # Expo Router rotaları (ekranlar; iş mantığı içermez)
│   ├── (tabs)/       # Keşfet, Ara, Planım, Profil
│   └── content/      # İçerik detayı
├── components/       # Tasarım sistemi (ui/) + durum görünümleri (state-views/)
├── hooks/            # Query hook'ları ve yardımcı hook'lar
├── i18n/             # Sözlükler (tr varsayılan, en iskelet)
├── services/         # API portu, mock/dev adapter, HTTP adapter, api-client
├── store/            # Zustand istemci durumu (tercihler, planım)
├── theme/            # Tasarım sistemi token'ları (docs/DESIGN.md kaynağı)
└── utils/            # Biçimlendirme ve erişim yardımcıları
```

## Ortam Değişkenleri

`.env.example` dosyasından kopyalayın. `EXPO_PUBLIC_MOCK_API=1` iken geliştirme
mock adapter devrededir; üretimde bu yol kesinlikle kapanır (iki katmanlı koruma).

## Notlar

- Uygulama ikonu/splash görselleri şimdilik şablon placeholder'larıdır; marka
  görselleri tasarım aşamasında üretilecektir.
- Oynatma Faz 4'te, oturum Faz 3'te, ödeme Faz 5'te devreye alınacaktır
  (bkz. `docs/ROADMAP.md`).
