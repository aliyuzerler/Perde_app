# PerdeGo — Yayın Planı ve Kabul Kriterleri

> Sürüm: 1.0 · Tarih: 2026-10-25
> Bu belge fazların **kabul kriterlerini**, faz kapanış teslim listesini ve
> mağaza yayımlama kontrol listelerini tanımlar. Faz kapsamları
> `ROADMAP.md`'de, gereksinimler `PRD.md`'de, teknik akışlar
> `ARCHITECTURE.md`'dedir. Çelişki hâlinde: ROADMAP kapsam, bu belge kabul
> ölçütü olarak esas alınır.

## 1. Faz Durumu ve Yol Haritası

| Faz | Ad | Durum | Bu belgedeki kabul bölümü |
|-----|----|-------|---------------------------|
| 0 | Ürün/teknik dokümantasyon (PRD, ARCHITECTURE, ERD, API_CONTRACT, SECURITY, COST_ESTIMATE, RELEASE_PLAN) | ✅ Tamamlandı | §2 |
| 1 | Monorepo, contracts, mobil iskelet | ✅ Tamamlandı | `docs/phases/FAZ-1.md` |
| 2 | API temeli ve içerik hizmeti (NestJS+Prisma+PostgreSQL) | 🔜 Sıradaki | §3.2 |
| 3 | Kimlik doğrulama ve hesaplar | ⏳ | §3.3 |
| 4 | Video akışı ve oynatma | ⏳ | §3.4 |
| 5 | Abonelik, kredi ve ödemeler | ⏳ | §3.5 |
| 6 | Admin paneli | ⏳ | §3.6 |
| 7 | Bildirimler, sertleştirme ve mağaza yayınlama | ⏳ | §3.7 + §4 |

> **Numaralandırma notu:** Faz 0, kurucu ürün/mimari dokümantasyonunu
> gösterir ve kronolojik olarak Faz 1'in (mobil iskelet) ardından hazırlandı.
> `ROADMAP.md`'deki Faz 1–7 planı geçerlidir; Faz 0 ek bir temel aşamadır.

## 1.1 Zaman Varsayımları (kesin vaat değildir)

Aşağıdaki süreler **açık varsayımdır**; taahhüt takvimi değildir. Temel
varsayım: çekirdek ekip = 1 backend + 1 mobil + %50 zamanlı ürün/tasarım
desteği; içerik arzı (lisans/üretim) paralel yürütülür.

| Faz | Varsayılan süre | Belirleyici belirsizlik |
|-----|-----------------|--------------------------|
| Faz 2 (API temeli) | 3–5 hafta | Docker/yönetilen DB seçimi; arama ayarları |
| Faz 3 (Auth) | 2–3 hafta | E-posta sağlayıcı kurulumu |
| Faz 4 (Video) | 3–4 hafta | Bunny hesap onayı + gerçek içerik medyası |
| Faz 5 (Monetizasyon) | 4–6 hafta | Mağaza ürün onayları, sandbox erişimi, RC entegrasyonu |
| Faz 6 (Admin) | 3–4 hafta | Yükleme iş akışı detayları |
| Faz 7 (Bildirim + yayın) | 2–3 hafta + **mağaza inceleme bekleme 1–4 hafta** | İnceleme turu sayısı |
| **MVP toplam** | **~4–6 ay geliştirme + inceleme** | İçerik arzı ve mağaza onay süresi |

Süre değişimleri bu tabloya işlenir; her faz raporu tahmini/gerçek süreyi
bildirir (kalıcı vaat olarak sunulmaz).

## 2. Faz 0 — Dokümantasyon Kabul Kriterleri (bu faz)

1. Yedi belge `docs/` altında tamamlandı ve çapraz referansları tutarlı
   (PRD iş kuralları ↔ API hata kodları ↔ SECURITY kontrolleri ↔ ERD kısıtları).
2. Video sağlayıcı fiyatları yalnızca resmi kaynaklardan, kontrol tarihiyle
   belgelendi (`COST_ESTIMATE.md` §2); doğrulanamayan kural (Apple kredi
   süresi) "teyit edilecek" olarak açıkça işaretlendi.
3. MVP/sonraki sürüm ayrımı, her erteleme için gerekçe + risk ile yazıldı
   (PRD §6).
4. Mevcut Faz 1 artefaktları (`packages/contracts`, mobil iskelet, DESIGN.md)
   bozulmadı; ARCHITECTURE.md v2, v1 kararlarını koruyarak genişletildi.

## 3. Faz Kabul Kriterleri

### 3.0 Her faz için ortak kapanış teslim listesi (bağlayıcı)

Her faz, aşağıdaki teslimler tamamlanmadan kapanmış sayılmaz (Genel Kural 11):

- [ ] **Değişen dosyalar listesi** (eklendi/değişti/silindi)
- [ ] **Önemli mimari kararların açıklaması** (ALTERNATİF + NEDEN biçiminde)
- [ ] **Çalıştırılacak komutlar** (kurulum, migration, seed, test)
- [ ] **Test raporu:** `npm run typecheck`, `npm run lint`, `npm run test`
      çıktı özeti (yeşil olmalı) + yeni yazılan test adları
- [ ] **Eksik dış hesaplar/manuel adımlar** (örn. Apple Developer hesabı,
      Bunny library anahtarı) — sahibi ve süreNotu ile
- [ ] **Kabul kriterlerinin madde madde onayı** + bir sonraki faza hazır
      beyanı; `docs/phases/FAZ-N.md` raporu yazılmış olmalı

### 3.1 Faz 1 — Monorepo ve mobil iskelet ✅

`docs/phases/FAZ-1.md`'deki altı kriter tamamlandı: kök `npm install` sorunsuz;
typecheck/lint/test yeşil (65 test); 4 sekme + detay gezilebilir; tüm
listelerde loading/empty/error/network durumları; mock yalnızca
`__DEV__ && EXPO_PUBLIC_MOCK_API=1`; tasarım kuralları (koyu tema, 0–4 px,
dikdörtgen kartlar) uygulandı.

### 3.2 Faz 2 — API temeli ve içerik hizmeti

1. `apps/api` `/api/v1` altında şu uçları döndürür: `GET /catalog/feed`,
   `GET /catalog/categories`, `GET /catalog/categories/{slug}`, `GET /search`,
   `GET /contents/{slug}`, `GET /contents/{slug}/episodes`, healthcheck —
   yanıtlar `packages/contracts` şemalarıyla **runtime doğrulamalı**.
2. PostgreSQL + Prisma şeması `ERD.md` §3'ün katalog bölümünü karşılar;
   migration + seed (özgün kurgu içerik) çalışır.
3. Mobil, `EXPO_PUBLIC_MOCK_API=0` ile gerçek API'den beslenir; ekran
   kodunda değişiklik yalnızca adapter fabrikası kadardır (D3 kanıtı).
4. API birim + e2e testleri yeşil; e2e'ler zarf şemasını doğrular.
5. Hata yanıtları API_CONTRACT §10 tablosundaki `code/reason` çiftini taşır.

**Riskler:** trigram arama ayarları (migration karmaşası) → seed ile test
edilir; feed önbelleği gereksiz karmaşa → Redis yalnızca gerekçeli açılır
(ROADMAP Faz 2).

### 3.3 Faz 3 — Kimlik doğrulama ve hesaplar

1. Kayıt/giriş/refresh/logout uçları SECURITY §2 kararlarını uygular
   (argon2id, RS256 15 dk access, rotasyonlu refresh, reuse-detection).
2. Korumalı uca tokensız istek `401 UNAUTHORIZED/TOKEN_INVALID` döner; mobil
   interceptor otomatik refresh yapar.
3. `DELETE /account` BR-11 akışını uçtan uca çalıştırır (anonimleştirme
   sonrası aynı e-posta ile tekrar kayıt mümkün, eski veri erişilemez).
4. Formlar React Hook Form + Zod; hata metinleri Türkçe (i18n sözlüğünden).
5. Güvenlik testleri: brute-force hız sınırı, `REFRESH_REUSED` senaryosu,
   IDOR testi (başka kullanıcının kaynağına 403).

### 3.4 Faz 4 — Video akışı ve oynatma

1. `VideoProviderAdapter` (ARCHITECTURE §6.3) **Bunny** implementasyonu +
   Cloudflare ikinci implementasyonu (geçiş provası) tamamlanır; sağlayıcı
   adı mobil pakete sızmaz.
2. Oynatma oturumu yalnızca yetki kontrolünden sonra üretilir (BR-02/07);
   imzasız URL sağlayıcıda 403 döner.
3. `expo-video` dikey tam ekran; ABR; 10 sn ileri/geri; TTL yenileme sessiz
   çalışır.
4. İzleme konumu ≤10 sn aralıkla senkron; "devam et" rayı sunucudan gelir
   (BR-09).
5. Zayıf bağlantı senaryosu: hata görünümü + "Tekrar Dene"; konum kaybı yok.
6. **Kabul provası:** adapter sözleşme testleri — sağlayıcı değişikliği
   yalnızca `apps/api/src/video/` altında kod değişikliği gerektirir.

### 3.5 Faz 5 — Abonelik, kredi ve ödemeler

1. Ürün kataloğu: 2 abonelik planı (aylık/yıllık) + ≥2 kredi paketi, hem
   App Store hem Play Billing'de; `GET /billing/products` platforma göre
   doğru ürün kimliğini döner.
2. Satın alma doğrulaması sunucuda (RevenueCat + ters sorgu); istemci yanıtı
   tek başına yetki vermez; `store_transactions` unique kısıtı ve
   `Idempotency-Key` ile replay korunması kanıtlanır (BR-06).
3. Kredi akışı: `credit_ledger` append-only (UPDATE/DELETE rol düzeyinde
   yok — BR-04); unlock atomik; **paralel unlock yarış testi** tek düşüm
   üretir; `INSUFFICIENT_CREDITS` → 402.
4. Webhook'lar: Apple V2 / RTDN / RC imza doğrulaması; ham kayıt + kuyruk +
   idempotent worker; iade senaryosunda BR-12 davranışı testleriyle kanıtlı.
5. Mock ödeme yalnızca geliştirmede; üretim derlemesinde mock modülü `throw`
   eder (Genel Kural 8 — derleme çıktısı kontrol edilir).
6. Grace period / on-hold durumlarında erişim BR-10'a uygun.

### 3.6 Faz 6 — Admin paneli

1. İçerik/season/episode/kategori/plan/paket CRUD + draft→publish akışı;
   yalnızca RBAC'lı roller; tüm yazma işlemleri `audit_logs` üretir.
2. Video yükleme iş akışı: admin presigned upload alır, encode durumu
   panelde görünür; `episode_media.state=READY` olmadan bölüm publish
   edilemez.
3. Kullanıcı arama/askıya alma; kredi düzeltmesi `note` zorunlu + ledger
   `ADMIN_ADJUSTMENT` kaydı (F-54).
4. Panel, mobil API ile **aynı sözleşmeleri** kullanır (contracts paketinden).
5. Bildirim kampanyası gönderimi tercih filtresiyle çalışır (F-55).

### 3.7 Faz 7 — Bildirimler, sertleştirme ve yayınlama

1. Push izin akışı + token kaydı; favori dizilere yeni bölüm bildirimi
   uçtan uca (bölüm yayını mağaza webhook'u gerektirmez: admin publish →
   kuyruk job'ı → APNs/FCM teslimi).
2. Performans: feed p95 < 400 ms (M senaryosu sahte yükte), oynatma
   başlangıcı p95 < 2,5 sn.
3. Güvenlik kontrol listesi (`SECURITY.md` §10) eksiksiz işaretli; penetrasyon
   testi bulguları kapatılmış.
4. Release build (EAS) smoke testi yeşil; sırlar yalnızca EAS secrets/env'den.
5. §4'teki mağaza kontrol listeleri %100 işaretli; TestFlight/closed testing
   geri bildirimleri işlenmiş.

## 4. Mağaza Yayımlama Kontrol Listesi

### 4.1 Apple App Store

**Hesap ve sözleşmeler**
- [ ] Apple Developer Program üyeliği aktif (kurumsal önerilir); banka/vergi
      formları (W-8BEN-E) tamam
- [ ] Paid Applications sözleşmesi + güncel PLA imzalı; **Small Business
      Program'a kayıt** (%15 komisyon — `COST_ESTIMATE.md` §2)
- [ ] Güncel PLA Schedule 2 metninde **kredi süre kuralı** hukuk incelemesi
      (BR-05 teyidi — bu çalışmada birincil kaynaktan doğrulanamadı)

**App Store Connect**
- [ ] App kaydı: Bundle ID (`com.perdego.app`), SKAD/analitik kapalı başlar
- [ ] IAP ürünleri: 2 auto-renewable subscription + kredi paketleri
      (consumable); her biri için review ekran görüntüsü + açıklama
- [ ] Abonelik grup adı, intro teklif yok (MVP), restore purchases akışı var
- [ ] Gizlilik politikası URL (TR/EN) + **App Privacy etiketleri** (veri
      envanteri `SECURITY.md` §6 ile birebir)
- [ ] İçerik derecelendirme soruları (18+ içerik için yaş doğrulama ekranı
      tanımlı), dışa aktarım uyumluluğu (standart şifreleme — exempt)
- [ ] Review notları: **demo hesap** (aboneli + kredili), webhook test
      talimatı, imzalı video URL akışı açıklaması
- [ ] Kılavuz kontrolleri: 3.1.1 (dijital içerik IAP), 3.1.2 (multiplatform
      erişim — iOS'ta alınan abonelik Android'de geçerli), 5.1.1(v)
      **uygulama içi hesap silme** zorunluluğu, 2.1 performans (beta'da
      kilitlenme yok)
- [ ] TestFlight: internal + external beta (≥2 hafta), çökme oranı < %0,3
- [ ] Aşamalı yayın (phased release) %7'den başlar

### 4.2 Google Play

**Hesap ve tanım**
- [ ] Play Console geliştirici hesabı (kimlik doğrulama tamam; kurumsal);
      ödeme profili + vergi formları
- [ ] Uygulama adı/short description/full description (TR) + ekran görüntüleri
      + feature graphic (2:3 afiş kurallarına uygun özgün görseller)

**Politika formları**
- [ ] **Data safety formu** (toplanan veriler: e-posta, cihaz kimliği,
      kullanıcı etkileşimi; şifreleme, silme talebi) — `SECURITY.md` §6 ile
      tutarlı
- [ ] IARC içerik derecelendirme anketi; gizlilik politikası URL
- [ ] Hedef API düzeyi (güncel Play gereksinimi), `.aab` imzalı (Play App
      Signing)
- [ ] Payments politikası: dijital ürünlerde Play Billing (doğrulandı);
      abonelik ürünleri + `acknowledge` sunucudan

**Test ve yayın**
- [ ] Closed testing: **yeni geliştirici hesabı için güncel test gereksinimi
      kontrol edilir** (kapanışta testçi süresi kuralı — yayın tarihinde
      geçerli metin teyit edilir)
- [ ] Pre-launch report bulguları (çökme/erişilebilirlik) çözülmüş
- [ ] Üretim çıkışı: staged rollout %10 → %50 → %100; Play Console vitals
      izleme açık

### 4.3 Ortak yayın sonrası

- [ ] Sentry/uyarı kanalları canlı (5xx, oynatma hatası, webhook kuyruğu)
- [ ] `COST_ESTIMATE.md` gerçek trafikle ilk aylık revizyonu
- [ ] `worklog.md` + faz raporu kapanışı; post-MVP backlog önceliği (PRD §6)

## 5. MVP Sonrası Sürümler (özet)

| Sürüm | İçerik | Gerekçe |
|-------|--------|---------|
| 1.1 | Sosyal giriş (Apple/Google), şifresiz oturum | Kayıt dönüşümü artırma |
| 1.2 | Altyazı (TR/EN) + çoklu ses | İçerik erişimi genişletme |
| 1.3 | Abonelik teklifleri (intro/promo) + kazandıran referans | Büyüme |
| 2.0 | Çevrimdışı indirme (DRM), dinamik watermark | Premium koruma |
| 2.1 | Kişiselleştirme/öneri, metrik paneli | Retansiyon |
| 3.0 | TV/tablet yüzeyleri, web oynatıcı | Erişim genişletme |

Her sürüm kendi kabul kriterlerini PRD şablonuyla (gerekçe + risk + kabul)
tanımlar; faz kapanış teslim listesi (§3.0) tüm sürümlere uygulanır.
