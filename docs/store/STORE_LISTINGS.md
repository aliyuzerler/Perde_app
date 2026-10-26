# PerdeGo — Mağaza Listeleme Metaverisi (Sürüm 1.0.0 RC)

> Amaç: App Store Connect ve Google Play Console kayıtları için hazır metinler.
> ⚠️ Doldurulması gereken alanlar `LERİ_` önekiyle işaretlidir (geliştirici hesabı
> bilgileri kullanıcı tarafından sağlanacaktır — RELEASE_CHECKLIST.md §10).

## 1. Uygulama Kimlikleri

| Alan | Değer |
|------|-------|
| Uygulama adı | PerdeGo |
| Paket adı (Android) | `com.perdego.app` |
| Bundle ID (iOS) | `com.perdego.app` |
| Sürüm | 1.0.0 (versionCode 1 / buildNumber 1) |
| Birincil dil | Türkçe (tr) |
| Kategori | Entertainment / Eğlence |
| Alt kategori | Film & Dizi (short-form / dikey video) |

## 2. Google Play — Mağaza Listesi

### Başlık (30 karakter)
`PerdeGo — Dikey Kısa Film & Dizi`

### Kısa açıklama (80 karakter)
`Dikey formatda kısa filmler ve mini diziler. Ücretsiz bölümlerle hemen başla.`

### Tam açıklama (4000 karakter — taslak)
```
PerdeGo, telefonun için tasarlanmış dikey kısa film ve mini dizi
platformudur. Sinema kalitesinde özgün kısa içerikler tek el hareketiyle,
tam ekran dikey izleme deneyimiyle karşında.

■ NEDEN PERDEGO?
• Dikey izleme: Telefonunu çevirmene gerek yok — kısa filmler ve mini
  dizi bölümleri tam ekran dikey formatta.
• Ücretsiz başlangıç: Seçili bölümler tamamen ücretsiz; kayıt olmadan da
  ücretsiz içerikleri izleyebilirsin.
• Kaldığın yerden devam: Bölümden çık, istediğin anda devam et — izleme
  konumun hesabında saklanır.
• Kişisel katalog: Tür ve kategori filtreleriyle kendi sinema rayını kur.

■ İÇERİK MODELİ
• ÜCRETSİZ bölümler: Reklamsız, kısıtsız.
• ABONELİK: Aylık/yıllık planlarla tüm abonelik içeriği açılır.
• KREDİ: Tek bölümleri krediyle aç; krediler paketler halinde satın alınır.

■ GÜVENLİK VE GİZLİLİK
• Parolalar argon2id ile saklanır, oturumlar kısa ömürlü jetonlarla korunur.
• Hesabını istediğin zaman uygulama içinden kalıcı olarak silebilirsin.
• Ödemeler Google Play / App Store altyapısı üzerinden yapılır; kart
  bilgisi PerdeGo sunucularına iletilmez.

■ DESTEK
Sorun ve önerilerin için: LERİ_DESTEK_EPOSTA
Gizlilik politikası: LERİ_GIZLILIK_URL
Kullanım koşulları: LERİ_KOSULLAR_URL
```

## 3. App Store — Mağaza Listesi

### Alt başlık (30 karakter)
`Dikey kısa film ve mini dizi`

### Açıklama
Google Play tam açıklamasının ilk 3 paragrafıyla aynı (§2).

### Anahtar kelimeler (100 karakter)
`kısa film,mini dizi,dikey video,izle,sinema,dizi,vertical,film izle,kredili bölüm,short film`

### Tanıtım metni (170 karakter)
`PerdeGo 1.0 yayında! Sinema kalitesinde dikey kısa filmler cebinde. İlk bölüm ücretsiz — hemen keşfet.`

### Yaş derecelendirmesi önerisi
- **App Store**: 12+ (orta düzey korku/gerilim içerebilen kısa film içerikleri;
  kumar/bahis yok, çıplaklık yok — içerik arzı onayında doğrulanmalı).
- **Google Play**: `Teen / 13+` (IARC anketi: orta düzey korku/gerilim).

> Not: Kütüphanedeki gerçek içerikler final dereceyi belirler; içerik
> sağlama sürecinde her yapım için `ageRating` alanı (7+/13+/16+/18+)
> doldurulmalı ve 18+ içerik ekranlanmalıdır (API AGE_RESTRICTED kararı
> mevcut — kanıt: FAZ 10 probe A1/A6 bölümleri).

## 4. Ekran Görüntüleri Gereksinimi

| Platform | Adet/Boyut | İçerik önerisi |
|----------|-----------|----------------|
| iPhone 6.9" | 3–10 (1290×2796) | 1) Dikey oynatıcı tam ekran 2) Katalog/keşfet 3) Dizi detayı 4) Paywall (planlar) 5) Kredi paketleri |
| iPhone 6.5" | 3–10 (1242×2688) | aynı set |
| iPad 13" | — | desteklenmiyor (`supportsTablet:false`) — iPad ekran görüntüsü GEREKMEZ |
| Android telefon | min 2 (16:9 veya 9:16) | aynı set; öne çıkan görsel 1024×500 |

⚠️ Ekran görüntüleri gerçek cihaz/emülatörde üretilecek — sandbox'ta cihaz
olmadığından HAZIR DEĞİL (RELEASE_CHECKLIST.md §9).

## 5. Mağaza Varlıkları Durumu

| Varlık | Yol | Durum |
|--------|-----|-------|
| Uygulama ikonu (1024) | `apps/mobile/assets/images/icon.png` | ✅ |
| Android uyarlanabilir ikon (ön/arka/tek renk) | `apps/mobile/assets/images/android-icon-*.png` | ✅ |
| Açılış görseli | `apps/mobile/assets/images/splash-icon.png` | ✅ |
| Öne çıkan görsel (Play 1024×500) | — | ❌ ÜRETİLMELİ |
| Ekran görüntüleri | — | ❌ CİHAZ GEREKLİ |
