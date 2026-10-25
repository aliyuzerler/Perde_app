# Faz 2C — Katalog Deneyiminin Gerçek Backend Verisiyle Birleştirilmesi

> Görev: "PerdeGo'nun katalog deneyimini gerçek backend verileriyle birleştir.
> Amaç yalnızca örnek afişleri göstermek değil, yönetilebilir ve büyütülebilir
> bir içerik keşif sistemi kurmak."
>
> Tarih: 2026-10-26 · Sonuç: **PASS** (1 yüksek kusur canlı yakalandı ve
> düzeltildi; 1 düşük görsel kusur düzeltildi; 1 düşük kabul edilmiş görsel
> sınırlık notlandı)

## 1. Kapsam ve Yaklaşım

Bu faz, mobil katalog deneyimini mock katmandan (EXPO_PUBLIC_MOCK_API=1)
gerçek NestJS + PostgreSQL uçlarına (EXPO_PUBLIC_MOCK_API=0) geçirdi ve
içerik keşif sisteminin yönetilebilirlik gereksinimlerini uçtan uca
doğruladı. Önceki oturumda implementasyonun büyük bölümü yapılmış
(commit 617a63e: admin banner/bölüm yönetimi, içerik yaşam döngüsü,
PROCESSING durumu, N+1 düzeltmesi, mobil ekranlar + hook'lar) ancak
doğrulama turu koşulmadan oturum sonlanmıştı. Bu oturum: tam doğrulama,
iki gerçek kusur düzeltmesi, kabul denetimi ve raporlama.

## 2. Görev Maddelerinin Karşılanması

### 2.1 Mobil özellikler (11 madde)

| # | Madde | Durum | Kanıt |
|---|-------|-------|-------|
| 1 | Ana sayfa API'den dinamik | ✅ | E2E 02: seed verisi ("Gece Yarısı Treni" banner'ı, "Yeni Eklenenler" rayı) /home'dan; canlı probe P2C-02..06 |
| 2 | Öne çıkan, trend, yeni içerik | ✅ | /home HERO + RAIL bölümleri admin yönetimli (P2C-04/05); "Yeni Eklenenler" yayına göre sıralı |
| 3 | Kategori listesi + filtreleme | ✅ | /catalog/categories (P2C-21), /catalog/categories/:slug/titles (P2C-22), keşfet çipleri → kategori ekranı (E2E 05) |
| 4 | Ad + metadata ile arama | ✅ | /search: titleTr/En, originalTitle, synopsisTr; kind/category filtreli (P2C-13..16) |
| 5 | Dizi/film detay ekranı | ✅ | E2E 03: gerçek detay (2026 • 1 Sezon • 13+ • Üyelere özel), türler, oyuncular |
| 6 | Mini dizi bölüm listeleri | ✅ | accessSeasons: S1B1 "Peron 3 — Ücretsiz", S1B2 "Yolcu Listesi — Üyelere özel (kilit)" |
| 7 | Net erişim etiketleri | ✅ | Ücretsiz / Üyelere özel / Kredi ile (i18n access.*); kart + bölüm satırı + sunucu kararı |
| 8 | İzleme geçmişi + devam et | ✅ | E2E 14/15: "Devam" segmenti "Son Vardiya · 5 dk kaldı" + ilerleme çubuğu; "Geçmiş" segmenti sunucu kayıtları |
| 9 | Favori ekle/çıkar | ✅ | E2E 03 (misafir→yerel) + 16 (oturum→sunucu watchlist çıkar→ekle→listele) + P2C-24/25 idempotent |
| 10 | API sayfalama + yeniden deneme | ✅ | titles/search meta (P2C-07/08); retry-policy: ağ hatası 2 deneme, 4xx asla; ErrorView "Tekrar Dene" |
| 11 | Ağ yokken hata + tekrar deneme | ✅ | E2E 08/09: API durduruldu → "Akış yüklenemedi + TEKRAR DENE"; API döndü → kurtarma kanıtlandı |

### 2.2 Backend (6 madde)

| # | Madde | Durum | Kanıt |
|---|-------|-------|-------|
| 1 | Home section + banner yönetim API'si | ✅ | POST/PATCH/DELETE /admin/banners, /admin/home-sections(+items); /home'a yansıma P2C-36..40 + entegrasyon testi 09/10 |
| 2 | Taslak/İşleniyor/Yayında/Arşivde | ✅ | PATCH /admin/titles/:id/status matrisi; PROCESSING enum migration (20261026120000); görünürlük P2C-31..35 + entegrasyon testi 01 |
| 3 | Aramada sayfalama + filtreleme | ✅ | meta.page/totalPages/hasNextPage; kind/category filtreleri entegrasyon testi 03/04 |
| 4 | Gereksiz sorgu + N+1 önleme | ✅ | decideMany() toplu erişim kararı (bölüm başına decide yerine 2 sorgu/kullanıcı); findMany+count Promise.all; home tek round-trip bölümler için (CATEGORY_GRID tek sorgu) |
| 5 | Kullanıcı bazlı izleme geçmişi | ✅ | watch-progress kullanıcı dış anahtarlı; scope=continue/history ayrımı P2C-26..28 |
| 6 | Kullanıcı/admin içerik ayrımı | ✅ | publishedContentFilter fonksiyonu: herkese açık uçlar yalnız PUBLISHED+publishedAt≤now; DRAFT/PROCESSING/ARCHIVED admin listesinde (P2C-29..35) |

### 2.3 Arayüz kuralları

- **Dikdörtgen kartlar**: PosterCard `borderRadius: radius.md` (4 px max;
  tokens yalnız 0/2/4) — FAZ-2 QA radius denetimiyle de kanıtlı.
- **Oranlar içerik türüne göre**: `ASPECT_RATIOS` poster 2:3, vertical 9:16,
  wide 16:9; hero 16:9, raylar 2:3, devam kartları 9:16.
- **Kart içerik kuralları**: yapım adı + gerekiyorsa bölüm bilgisi
  ("Sezon 1 • 1. Bölüm", "5 dk kaldı") + erişim durumu rozeti.

## 3. Bulunan ve Düzeltilen Kusurlar

### F2C-01 · Yüksek — Web'de oturum kalıcılığı tamamen yoktu
- **Belirti**: UI girişi başarılı; tam sayfa yenilemesinde oturum kayboluyor,
  Planım "Misafir modu"na düşüyor, izleme geçmişi/favoriler sunucudan
  gelmiyor. localStorage'da `perdego.auth.v2` YOKTU.
- **Kök neden**: `secure-storage.ts` başlık yorumu "web'de localStorage'a
  düşer" diyordu ama kod yalnızca bellek danışığına düşüyordu
  (SecureStore.setItemAsync web'de fırlatır → catch → memoryCache).
  Bellek sayfa ömrüyle ölür; doküman-kod uyuşmazlığı birim testlerinde de
  görünmezdi (test bellek düşüşünü "web davranışı" sanarak doğruluyordu).
- **Düzeltme**: web platformunda gerçek localStorage yolu (okuma/yazma/
  silme, SSR ve kota güvenli try/catch); native SecureStore yolu değişmedi.
- **Test**: 4 yeni web-platform testi (localStorage yazma/okuma/silme +
  localStorage yoksa bellek düşüşü). Mobil süiti 108→112→114 test.
- **Canlı kanıt**: dbg-session-persist — localStorage'da `perdego.auth.v2`
  belirdi; yenileme sonrası "Demo İzleyici" + "Çıkış Yap" korunuyor;
  Planım oturum moduna geçti, sunucu devam-et kaydı göründü.
- **Not**: Native taraf etkilenmez (Keychain/Keystore yolu aynen korundu);
  web localStorage kullanımı mevcut geliştirme kabulünün dokümante haline
  getirilmesidir (production hedefi native).

### F2C-02 · Düşük — Keşfet ızgarasında rozet çakışması
- **Belirti**: Kartta "Yeni" + tür rozeti (DİZİ) + erişim rozeti
  ("Üyelere özel") sağ üstte üst üste biniyordu; metin okunamıyordu
  ("ÜyDİZie ö").
- **Kök neden**: explore.tsx tür rozetini mutlak konumlu kaplamayla
  (gridBadge) çizerken PosterCard'ın kendi erişim rozetiyle aynı noktayı
  işgal ediyordu.
- **Düzeltme**: PosterCard'a `cornerBadgeLabel` slotu eklendi (sağ üstte
  tür → erişim sıralı sütun); kaplama kaldırıldı. +2 bileşen testi.
- **Canlı kanıt**: E2E sonrası keşfet ekran görüntüsü — rozetler sütun
  düzeninde, çakışma yok.

### F2C-03 · Düşük (kabul edilmiş sınırlık) — En dar ızgarada rozet kırpılması
- 3 sütunlu keşfet ızgarasında (~112 px kart) "Üyelere özel" / "KISA FİLM"
  gibi uzun rozet metinleri kart kenarında kırpılabiliyor (örn. "Üyelere ö").
  Çakışma yok, erişim durumu hâlâ ayırt edilebilir; kısa etiket tasarımı
  (örn. "Üye") sonraki cila fazına bırakıldı.

## 4. Doğrulama Kanıtları

- **Statik**: typecheck 4/4, lint 4/4 workspace yeşil.
- **Testler**: 286/286 — contracts 48, api 124 (62 birim + gerçek-PG
  entegrasyon: faz2b 18, faz3-auth 16+... + faz2c katalog 11), mobile 114.
- **Entegrasyon (gerçek PG, 11 test)**: boş katalog→arşiv, 25 yapım
  sayfalama meta, arama filtreleri, arşiv görünürlüğü, 401/403/404 matrisi,
  izleme kapsamları, favoriler, banner /home yansıması, bölüm yönetimi,
  PROCESSING görünürlüğü.
- **Canlı API probe** (`scripts/qa-faz2c-catalog-probe.mjs`): **41/41 PASS**
  — health, /home dinamik, titles sayfalama+4 filtre, arama+filtre+boş
  sonuç+400, detay+accessSeasons, bölüm kararı (NEEDS_CREDITS), kategoriler,
  favoriler idempotent, continue/history, 403 (viewer→admin), yaşam döngüsü
  DRAFT→PROCESSING→PUBLISHED→ARCHIVED görünürlük matrisi, banner+bölüm
  CRUD→/home yansıması.
- **Gerçek-API UI E2E** (`scripts/qa-faz2c-ui-real-api.py`, Expo web
  390×844 + Playwright): **20 PASS / 0 FAIL / 0 WARN** — onboarding,
  dinamik ana sayfa, detay+erişim etiketleri, misafir favorisi, keşfet
  kategorileri, kategori ekranı, arama+boş sonuç, offline+tekrar-dene
  kurtarma, gerçek giriş, oturum modu, Devam/Geçmiş segmentleri, sunucu
  favorisi uçtan uca (çıkar→ekle→listele→temizlik). Ekran görüntüleri:
  `docs/qa/screenshots/faz2c/` (20 adet), sonuçlar
  `scripts/qa-faz2c-results.json`.
- **Veritabanı**: migration'lar dev DB'de güncel (5/5); seed idempotent
  (5 kategori, 7 yapım, 13 bölüm, 2 banner, 4 bölüm rayı).

## 5. Ortam Dersleri (sonraki ajan için)

1. **API dist bayatlığı**: kaynak değişince `pnpm --filter @perdego/api build`
   olmadan canlı koşum eski kodu çalıştırır — bu oturumda 13 sahte FAIL
   üretti. Kural: canlı doğrulama öncesi dist yeniden derle.
2. **Hata zarfı katmanları**: HTTP kod adı (`NOT_FOUND`/`BAD_REQUEST`)
   zarf `error.code`'da; alan adı nedeni (`CONTENT_NOT_FOUND`/
   `VALIDATION_FAILED`) `error.details.reason`'da — probe iddiaları buna
   göre yazılmalı.
3. **AppButton DOM metni tr-TR büyük harfe çevirir** ("Planıma Ekle" →
   "PLANIMA EKLE"); özgün etiket accessibilityLabel'da → Playwright'ta
   `get_by_label` kullan.
4. **Sekme ekranları DOM'da mount kalır** (RN web): gizli ekranların
   input'ları/rozet metinleri `.first` eşleşmesini çalar → tip seçicisi
   (`input[type=email]`) veya doğrudan rota gezinmesi kullan.
5. **Rate limiter in-memory**: probe'u tekrar koşmadan önce API'yi yeniden
   başlat (429'ları önler).
6. Metro CI=1 dosya değişikliğini izlemez — her değişiklikte `--clear` ile
   yeniden başlat (FAZ-2 dersinin teyidi).

## 6. Sınırlar ve Sonraki Adımlar

- Kredi/abonelik satın alma uçları bilinçli olarak mock'ta (Faz 5).
- Admin paneli UI'sı Faz 6'da; yönetim uçları bu fazda API düzeyinde
  kanıtlandı.
- F2C-03 rozet kırpılması cila kalemidir.
- Native cihaz doğrulaması (Keychain yolu) hâlâ bekliyor — web localStorage
  yolu geliştirme kabulüdür.
