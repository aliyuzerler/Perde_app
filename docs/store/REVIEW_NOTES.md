# PerdeGo — Mağaza İnceleme Notları (Reviewer Notes)

> Bu belge, App Store / Google Play inceleme ekiplerine ve yayına çıkış
> öncesi iç denetime hitap eder. Gönderimde "App Review Information" ve
> "Notes for the reviewer" alanlarına kısaltılmış hâli yapıştırılır.

## 1. Demo Hesaplar (İnceleme Test Hesabı)

| Rol | E-posta | Parola | Açıklama |
|-----|---------|--------|----------|
| Görüntüleyici (aboneli aktif) | `LERİ_REVIEW_VIEWER@perdego.example` | `LERİ_REVIEW_PASSWORD` | Ücretsiz + abonelik bölümlerini izler |
| Yönetici (yalnız iç kullanım) | (mağaza incelemesine verilmez) | — | Admin paneli ayrı URL'dedir |

> ⚠️ Bu hesaplar **üretim ortamında** oluşturulmalı ve inceleme sırasında
> aboneliği aktif bırakılmalıdır (sandbox'ta oluşturulan demo hesaplar
> yereldir). İncelemeye gönderilen API ortamı için ayrı "staging" veritabanı
> önerilir: inceleme ekibinin işlemesi katalog verisini kirletmesin.

## 2. İncelemecinin Deneyeceği Akışlar (dakikalar içinde doğrulanabilir)

1. Kayıt: e-posta + parola → doğrulama e-postası → giriş.
2. Kayıtsız keşif: ücretsiz bölüm tam ekran dikey oynar.
3. "Kaldığı yerden devam": uygulamayı kapat-yeniden aç → aynı konumdan sürer.
4. Kilitli bölüm: abonelik bölümünde paywall; kredi bölümünde kredi satın alma.
5. Satın alma: mağaza sandbox hesabıyla abonelik/kredi paketi.
6. Bildirimler: izin verilirse yeni bölüm bildirimi; tercih ekranından kapatma.
7. Hesap silme: Profil → Hesabımı Sil → nefalet bilgisi ekranı.

## 3. Ödeme ve Ürün Yapılandırması (madde 14 doğrulaması)

- **Abonelik ürünleri** (RevenueCat plan eşlemesi — sunucu `plans` tablosu):

| Plan kodu | Mağaza ürün kimliği (iOS/Android) | Dönem |
|-----------|-----------------------------------|-------|
| SUB_MONTHLY | `perdego.sub.monthly` | Aylık |
| SUB_YEARLY | `perdego.sub.yearly` | Yıllık |

- **Kredi paketleri** (`credit_packs` tablosu):

| Paket | Mağaza ürün kimliği | Kredi (+bonus) | Fiyat |
|-------|---------------------|----------------|-------|
| PACK_10 | `perdego.pack.pack_10` | 10 | ₺29,90 |
| PACK_25 | `perdego.pack.pack_25` | 25 (+5) | ₺59,90 |
| PACK_60 | `perdego.pack.pack_60` | 60 (+15) | ₺99,90 |

- Sunucu tarafı doğrulama: makbuzlar RevenueCat REST ile ters sorgulanır
  (`BILLING_PROVIDER=revenuecat`); istemci tek başına hak veremez (BR-06/10 —
  kanıt: FAZ 7/10 probe'ları).
- **İade akışı**: RC REFUND webhook'u → kullanılmamış kredi clawback +
  abonelik EXPIRED (kanıt: FAZ 10 probe B2.6–B2.9).
- ⚠️ Bu ürün kimliklerinin Apple/Google panellerinde **gerçekten
  oluşturulması** ve RevenueCat projeye bağlanması gerekir —
  RELEASE_CHECKLIST.md §10 (kullanıcı tarafından sağlanacak hesaplar).

## 4. Veri Güvenliği Beyanı (Data Safety / App Privacy özeti)

- Veri türleri: hesap (e-posta, görünen ad), kullanıcı içeriği (izleme
  geçmişi, favoriler), cihaz tanımlayıcı (push token), satın alma kayıtları.
- Paylaşım: RevenueCat (doğrulama), Expo push (teslim), e-posta sağlayıcı.
- Reklam kimliği kullanımı: **YOK** (reklam SDK'sı yok → AD_ID izni talep
  edilmez; Play Data Safety'de "collects advertising ID = No").
- Şifreleme: tüm trafik TLS; parolalar argon2id; token'lar RS256.
- Hesap silme: uygulama içinden (Zorunlu — hazır: `account/delete-account.tsx`
  + `/account/delete-request` ucu + nefalet/purge süreci).

## 5. Kapsam Dışı / Bilinen Sınırlar

- Gerçek cihaz push (APNs/FCM anahtarı yok) — PUSH_SETUP §4-5 üretim öncesi.
- RC sandbox hesabı yok — gerçek mağaza satın alması doğrulanamadı (fail-closed
  503 davranışı kanıtlandı; sahte başarı yok).
- EAS build/submit — hesap gerektirir (§10 checklist).
