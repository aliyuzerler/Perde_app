# PerdeGo — Güvenlik Rehberi

> Sürüm: 1.0 · Tarih: 2026-10-25
> Kapsam: kimlik doğrulama, yetkilendirme, video erişimi, ödeme güvenliği,
> veri koruma (KVKK) ve API sertleştirme. İş kuralları `PRD.md` §5'te,
> teknik akışlar `ARCHITECTURE.md` §6–7'dedir; bu belge bunların güvenlik
> sözleşmesidir.

## 1. Temel İlkeler

1. **Sunucu tek yetki kaynağıdır (Genel Kural 10):** erişim kararı, bakiye,
   abonelik durumu ve oynatma URL'si üretimi yalnızca apps/api'de gerçekleşir.
   İstemciden gelen hiçbir değer (accessType, bakiye, satın alma onayı)
   yetki için kullanılmaz.
2. **Savunma derinliği:** yetki kontrolü (a) API guard, (b) service katmanı
   alan mantığı, (c) veritabanı kısıtı (`unique`, `CHECK`) olarak üç
   katmanda tekrarlanır.
3. **En az ayrıcalık:** DB rolü ayrımı (`credit_ledger` için yalnızca INSERT
   hakkı olan rol), API anahtarlarının modül bazlı kapsamlandırılması.
4. **Başarısızlığa kapalı tasarım:** sağlayıcı doğrulama servisi yanıt
   vermiyorsa oynatma izni **verilmez** (fail-closed); mock ödeme üretimde
   derleme zamanı `throw` eder (Genel Kural 8).

## 2. Kimlik Doğrulama (Authentication)

| Konu | Karar |
|------|-------|
| Şifre saklama | **argon2id** (memory 64 MB, time 3, paralellik 1); pepper yalnızca ortam değişkeninden |
| Parola politikası | min 8 karakter, harf+rakam; zayıf parola listesi kontrolü; HIBP entegrasyonu P fazında |
| Token modeli | **RS256** kısa ömürlü access JWT (15 dk) + opaque refresh token (30 dk değil — 30 gün, rotasyonlu) |
| Refresh rotasyonu | Her kullanımda eski token iptal + yenisi üretilir; iptal edilmiş token tekrar kullanılırsa **oturum ailesi** tamamen iptal edilir (reuse-detection) — `sessions` zinciri (ERD §3.1) |
| Cihaz oturumları | Kullanıcı profili "aktif oturumlar" listesini görür ve tek tek kapatabilir |
| Mobil token saklama | access/refresh **SecureStore** (Keychain/Keystore) içinde; AsyncStorage'a token yazmak yasaktır |
| Kaba kuvvet | Login/register/refresh uçlarında IP+hesap bazlı hız sınırı: 5 deneme/15 dk → artan bekleme; şüpheli IP'de CAPTCHA (P) |
| E-posta doğrulama | Kayıt sonrası 24 saat geçerli tek kullanımlık token; doğrulanmamış hesap satın alamaz (BR-06 bağlantılı) |
| Şifre sıfırlama | Tek kullanımlık, 30 dk ömürlü token; kullanımda tüm oturumlar iptal edilir |
| Hesap silme | BR-11: şifre onayı → anonimleştirme job'ı (BullMQ) → cihaz/oturum iptali |

JWT claim'leri: `sub` (userId), `role`, `sid` (session id — tek oturum
iptalinde access token'ın anında geçersiz kılınması için kontrol edilir),
`iat/exp`. Payload'a PII **yazılmaz**.

## 3. Yetkilendirme (Authorization)

- **RBAC:** `USER | EDITOR | ADMIN`. EDITOR yalnızca katalog yazma; ADMIN tüm
  admin ucu + kredi düzeltmesi + kullanıcı yönetimi. Admin uçları ayrı
  global guard + ayrı MFA zorunluluğu (Faz 6'da TOTP).
- **Sahiplik kontrolü:** `/me`, `/credits/*`, `/favorites/*` gibi uçlarda
  kaynak sahipliği service katmanında doğrulanır (IDOR önlemi).
- **İçerik yetkisi (BR-02/03/07):** oynatma oturumu üretimi sırası:
  1. `episode.status = PUBLISHED` ve `published_at <= now()`
  2. `accessType`:
     - `FREE` → izin
     - `SUBSCRIPTION` → `subscriptions.status IN (ACTIVE, TRIALING,
       GRACE_PERIOD) AND current_period_end > now()` (BR-02, BR-10)
     - `CREDIT` → `episode_unlocks` kaydı yoksa izin **yok**; açma yalnızca
       atomik unlock ucundan
  3. `ageRating = 18+` → profil doğum yılı kontrolü
- **Erişim yeniden değerlendirmesi:** imzalı URL 300 sn TTL'dir; uzun izleme
  sırasında client, süre bitmeden yeni oturum ister → kontrol tekrarlanır.
  Abonelik iptali halinde en geç 5 dk içinde erişim kesilir.

## 4. Video Erişimi

| Konu | Uygulama |
|------|----------|
| İmzalı erişim | Sağlayıcı imzalı URL/token: Bunny *Token Authentication*, Cloudflare Stream *requireSignedURLs + signed URLs*, Mux *signed playback policy (JWT)* — adapter içinde saklanır (ARCHITECTURE §6.3) |
| Token bağı | İmza `assetId + exp` içerir; `userId`/oturum bağlantısı API tarafında `playback_sessions` kaydıyla tutulur (ERD §3.3); aynı oturum için paralel oynatma limiti (varsayılan 2 cihaz) sunucuda sayılır |
| TTL | 300 sn (URL), izleme süresince sessiz yenileme; URL istemcide **önbelleklenmez ve loglanmaz** |
| Sızıntı azaltma | HLS segment URL'leri kısa ömürlü; sağlayıcı düzeyinde hotlink/domain koruması; referer kontrolü ikinci katman |
| İndirme/DRM | MVP'de çevrimdışı indirme yok; post-MVP indirme yalnızca Widevine/FairPlay DRM ile (Bunny Enterprise DRM / Mux DRM) |
| Görüntü su izi | P fazı: kullanıcıya özel dinamik watermark (sağlayıcı watermark özelliği) |

**Tehdit modeli özeti:** (a) URL paylaşımı → kısa TTL + imza; (b) hesap
paylaşımı → paralel oynatma limiti + oturum telemetrisi; (c) segment
kaydı → post-MVP DRM; (d) API üzerinden yetkisiz URL talebi → sunucu yetki
kontrolü + hız sınırı.

## 5. Ödeme Güvenliği

1. **Doğrulama sunucuda:** mobil, mağaza SDK'sından dönen satın almayı
   `POST /billing/purchases/validate` ile sunucuya taşır; sunucu RevenueCat/
   App Store Server API / Play Developer API ile **ters sorgu** yapar
   (satın alma var mı, bu kullanıcı mı, iade edilmiş mi).
2. **İdempotens (BR-06):** `Idempotency-Key` zorunlu;
   `store_transactions.unique(platform, store_transaction_id)`;
   `credit_ledger.idempotency_key unique`. Aynı satın alma/unlock asla iki
   kez işlenmez.
3. **Webhook güvenliği:** imza doğrulaması (Apple V2 JWT zinciri, RTDN
   Pub/Sub token, RC imza header) → ham olay kaydı → 202 → kuyrukta
   idempotent işleme; worker mağazaya ters sorgu ile teyit eder (sahte
   webhook'a karşı).
4. **Ledger bütünlüğü (BR-04):** bakiye doğrudan değiştirilemez;
   UPDATE/DELETE hakları DB rolüyle kısıtlı; her kayıt `balance_after_*`
   tutar; admin düzeltmeleri `note` + `audit_logs` zorunlu.
5. **İade/iptal (BR-12):** REFUND/REVOKE olaylarında harcanmamış kredi geri
   alınır, abonelik erişimi kesilir; tüm hareketler ledger'a negatif kayıt
   olarak yansır — bakiye asla negatif kısıtına DB `CHECK` ile korunur
   (harcanmış krediden bakiye düşülmez, negatif bakiye oluşmaz; krediyle
   açılmış bölüm hakkı elden çıkarılmaz — "tek seferlik nazik kullanım"
   tercihi Faz 5'te ürün sahibi onayıyla kesinleştirilir ve iki belgede de
   aynı şekilde güncellenir).
6. **Mock politikası:** mock ödeme yalnızca `NODE_ENV=development &&
   __DEV__`; üretim derlemesinde mock modülü `throw` eder; prod flag'i
   yoktur (Genel Kural 8).
7. **Fiyat manipülasyonu:** fiyat/kredi miktarı istemciden alınmaz;
   `plans`/`credit_packs` tablosundaki sunucu değeri esas alınır; mağaza
   ürün kimliği eşleşmesi doğrulanır.

## 6. Veri Koruma ve KVKK

- **Aktarımda:** tüm uçlar TLS 1.2+; HSTS; sertifikalar Let's Encrypt +
  otomatik yenileme.
- **Durguda:** PostgreSQL disk şifrelemesi (LUKS veya yönetilen servisin
  şifrelemesi); yedekler şifreli ve ayrı bölgede.
- **PII minimize:** IP hash'li saklanır; loglara e-posta/token/PERSONEL veri
  yazılmaz (yapılandırılmış logda `userId` referansı yeterli).
- **Veri envanteri:** kullanıcı kimliği, cihaz token, izleme geçmişi,
  finansal kayıtlar. İşleme amaçları kayıt formunda listelenir.
- **KVKK hakları:** erişim/düzeltme/silme — hesap silme BR-11 akışıyla;
  finansal kayıtlar yasal saklama süresi (10 yıl, vergi mevzuatı) kadar
  **anonim** tutulur; push token silme; veri taşınabilirliği P fazı.
- **Rıza:** push bildirim izni ayrı ve geri alınabilir; kampanya bildirimleri
  opt-in (`notification_preferences.promo`).
- **Alt işleyiciler:** video CDN, e-posta, push (Expo/APNs/FCM), yönetilen
  DB — hepsi için DPA/veri işleme ekleri kontrol listesine bağlanır
  (`RELEASE_PLAN.md` Faz 6).
- **Ayar:** `.env.example` dışında gerçek sır içeren dosya depoya girmez;
  CI'da secret-scanning (gitleaks) çalışır.

## 7. API Sertleştirme

| Konu | Uygulama |
|------|----------|
| Girdi doğrulama | Tüm gövde/sorgu/parametreler Zod (`packages/contracts`) veya NestJS DTO validasyonu; bilinmeyen alan reddi (`strict`) |
| Çıktı filtreleme | Entity doğrudan döner mi? Hayır — DTO/projektör; ham SQL hata mesajı sızdırılmaz |
| Hız sınırı | Global 120 istek/dk/IP + uç bazlı: auth 10/dk, unlock 6/dk, playback 30/dk (Redis throttler) |
| CORS | Yalnızca admin alan adı + mobil istemci kökenleri; `*` yasak |
| Header'lar | helmet (HSTS, no-sniff, frameguard), istek boyutu limiti (1 MB), timeout 30 sn |
| Bağımlılıklar | `npm audit` + Dependabot haftalık; `expo-doctor` her sürümde (Genel Kural 12) |
| OWASP API Top 10 | API1 BOLA → sahiplik kontrolü; API2 Broken Auth → §2; API3 Property injection → strict şema; API4 Resource exhaustion → hız sınırı + sayfalama limiti; API5 BFLA → RBAC; API6 Sensitive flows → ödeme uçları ek onay; API7 SSRF → dış URL çekme yok (sağlayıcı API sabit host); API8 Misconfig → helmet+env doğrulaması başlangıçta; API9 Inventory → faz raporlarında uç envanteri; API10 Unsafe consumption → webhook imzası + ters sorgu |

## 8. Sır Yönetimi

| Katman | Kural |
|--------|-------|
| Depo | Yalnızca `.env.example`; gerçek `.env` gitignore'da; gitleaks CI'da |
| Mobil | Yalnızca `EXPO_PUBLIC_` ile **gizli olmayan** değerler pakete girer; imzalama anahtarları EAS credentials (sunucu tarafı) |
| Sunucu | Sırlar ortam değişkeni/secret manager; dosyaya yazılan sır izlenmez |
| Rotasyon | JWT imza anahtarı 90 gün (kid rotasyonu); video imzalama anahtarı 180 gün; sızma şüphesinde derhâl |
| Video sağlayıcı | API anahtarları yalnızca apps/api'de; admin ve mobil bu anahtarları hiç görmez |

## 9. Loglama, İzleme ve Olay Yanıtı

- Yapılandırılmış JSON log (pino): `traceId`, `userId`, uç, süre; PII yok.
- `audit_logs` (ERD §3.5): admin eylemleri + kredi düzeltmeleri değişmez
  denetim kaydı.
- Uyarılar: 5xx oranı, oynatma hata oranı > %0,5, webhook işleme başarısız
  kuyruğu, tekrar eden `REFRESH_REUSED` dalgaları (oturum hırsızlığı sinyali).
- Olay planı: (1) etkilenen oturum/anahtar iptali → (2) sır rotasyonu → (3)
  etki analizi (KVKK bildirim yükümlülüğü kontrolü) → (4) post-mortem
  dokümante edilir.

## 10. Yayın Öncesi Güvenlik Kontrol Listesi

- [ ] Penetrasyon testi (kapsam: auth, unlock, playback, webhook) — Faz 6
- [ ] Tüm uçlar 401/403 ile korunuyor (anonim erişim matrisi test edildi)
- [ ] İmzasız video URL'si sağlayıcıda 403 (Faz 4 kabul kriteri)
- [ ] Paralel unlock yarış testi yeşil (tek düşüm kanıtı)
- [ ] Webhook replay/sahte olay testleri yeşil
- [ ] Hesap silme uçtan uca doğrulandı (anonimleşme sonrası giriş denemesi başarısız)
- [ ] Secret-scanning ve `npm audit` sıfır kritik
- [ ] Yedek geri yükleme tatbikatı yapıldı
