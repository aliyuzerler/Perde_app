# FAZ 7 QA RAPORU — Satın Alma ve Kredi Güvenliği

| | |
|---|---|
| **Faz** | FAZ 7 — Gerçek abonelik ve kredi satın alma altyapısı (RevenueCat) |
| **Doğrulanan geliştirme** | Commit `630c93f` (FAZ 7) + bu QA koşumunda yapılan 4 kusur düzeltmesi (F7-03…F7-06) |
| **Test tarihi** | 2026-10-26 |
| **Test ortamı** | Yerel sandbox: gömülü PostgreSQL 16 (scripts/qa-pg), NestJS dist build, NODE_ENV=test/development koşumları; NODE_ENV=production tam boot'u bilinçli olarak engellidir (bkz. §7) |
| **SONUÇ** | **PASS WITH WARNINGS** |

**Kabul kriteri değerlendirmesi:**

1. **Onaylanmamış işlemle kredi verilmedi** — CANLI KANITLI. Sahte ürün (400/404), imzasız/yanlış imzalı webhook (SKIPPED), RC erişilemez (503 fail-closed), üretim modu (503) ve başkasının işlem kimliği senaryolarının hiçbirinde bakiye değişmedi (A-09, A-14, B-02, B-09, C-02, A-07).
2. **Tekrar gönderilen işlem iki kez işlenmedi** — CANLI KANITLI. Aynı Idempotency-Key birebir önbellek yanıtı döndü; UNIQUE(platform, storeTransactionId) aynı tx'i tekilleştirdi; webhook yeniden gönderimleri duplicate=true + SKIPPED oldu; webhook_events'te (source, eventId) mükerrer satır yok (A-05, A-06, A-16, B-04, B-13).
3. **Erişim yetkisi sunucu tarafından doğrulandı** — CANLI KANITLI. Anonim/sahte token → 401; aboneliksiz premium oynatma → 402; HMAC abonelik aktivasyonundan sonra → 201; RC INITIAL_PURCHASE sonrası entitlement=true; iade/EXPIRATION sonrası entitlement=false (A-15, A-17, A-20, B-03, B-06).

Uyarılar dış bağımlılıklarla ilgilidir (RevenueCat sandbox hesabı, mağaza ürünleri, gerçek cihaz) — bkz. §7. Kritik veya önemli bir kabul kriteri karşılanmadı değil; sonraki faza geçilebilir.

---

## 1. Test Kapsamı

**Faz kapsamı (geliştirme göreviyle birebir):** RevenueCat sağlayıcı adapter'ı (REST ters sorgulu doğrulama + Bearer webhook sırrı), genel HMAC webhook zarfı, abonelik yaşam döngüsü (aktivation/renewal/cancellation/expiration/billing-issue/pause/resume/uncancellation), kredi paketi satın alma + ledger, iade clawback, TRANSFER sahiplik aktarımı, `/billing/config`, `/billing/purchases/validate` (Idempotency-Key), `/billing/entitlements/sync`, `/billing/purchases`, mobil RC SDK akışı (billing-flow, purchases-port, mağaza fiyatları, restore, dürüst "ödeme devrede değil" bildirimi).

**Bu QA'nın ekstra doğrulama katmanları:**
- Üç farklı sunucu yapılandırmasında canlı HTTP kabul probe'u (A: sağlayıcı yok + simülasyon + HMAC zarfı; B: sağlayıcı=revenuecat test anahtarları + RC zarfı; C: üretim env şeması + sağlayıcı savunmaları) — **42 kontrol**.
- 7 yeni birim/entegrasyon regresyon testi (bulunan kusurlara ait).
- Önceki fazların canlı regresyon probe'ları (110 kontrol).

**Kapsam dışı / çalıştırılamayan:** gerçek RevenueCat sandbox satın alması, App Store/Google Play sandbox ürünleri, EAS/native cihaz akışı (bkz. §7).

## 2. Çalıştırılan Gerçek Komutlar

| Komut | Kaynak | Sonuç |
|---|---|---|
| `pnpm typecheck` (4 workspace) | kök package.json | ✅ 4/4 temiz |
| `pnpm lint` (4 workspace) | kök package.json | ✅ 4/4 temiz |
| `pnpm --filter @perdego/contracts test` | packages/contracts | ✅ 71/71 |
| `pnpm --filter @perdego/api test` (vitest, gerçek PG entegrasyonları dahil) | apps/api | ✅ 203/203 (düzeltme öncesi 196; +7 yeni regresyon testi) |
| `pnpm --filter @perdego/mobile test` (jest) | apps/mobile | ✅ 142/142 |
| `pnpm build` (api + admin) | kök | ✅ derlendi |
| `bash scripts/qa-faz7-run-acceptance.sh` (yeni; 3 fazlı canlı kabul probe'u) | QA aracı | ✅ 42/42 (A:21, B:14, C:7) — çıktı: `scripts/qa-faz7-acceptance-output.txt` |
| `bash scripts/qa-faz5-run-probes.sh` (regresyon) | önceki QA aracı | ✅ P2C 41 + F5 16 + AUTH 22 = 79/79 |
| `bash scripts/qa-faz6-run-probes.sh` (regresyon, TTL=60) | önceki QA aracı | ✅ 18/18 |
| `bash scripts/qa-faz2b-smoke.sh` (regresyon, API :3000) | önceki QA aracı | ✅ 13/13 |
| `prisma migrate status` | apps/api | ✅ 6 migration güncel |

Toplam: **416 otomatik test + 152 canlı kontrol**, tamamı yeşil.

## 3. Senaryo Bazlı Sonuçlar (FAZ 7 kabul listesi)

### 3.1 Abonelik senaryoları

| Senaryo | Sonuç | Kanıt |
|---|---|---|
| Test aboneliğinin başarıyla doğrulanması | ✅ (simülasyon) | A-15: HMAC `SUBSCRIPTION_ACTIVATED` → PROCESSED, status=TRIALING, entitlement=true; B-03: RC zarfı `INITIAL_PURCHASE` → TRIALING, dönem bitişi RC `expiration_at_ms`'ten |
| Aktif abonelikle kısıtlı içeriğe erişim | ✅ | A-15: aboneliksiz premium oynatma 402 → aktivasyon sonrası `POST /media/playback/:id/session` 201 |
| İptal edilmiş abonelik | ✅ | B-06: `CANCELLATION` → autoRenew=false, hak dönem sonuna kadar sürdü; `EXPIRATION` → EXPIRED + entitlement=false |
| Mağaza webhook'u ile durum güncelleme | ✅ | B-03/B-06/B-07/B-10: RC zarfı olaylarıyla ACTIVE/TRIALING/ON_HOLD/GRACE_PERIOD/EXPIRED geçişleri canlı doğrulandı |
| Aynı webhook olayının tekrar gönderilmesi | ✅ | A-16, B-04: aynı eventId → duplicate=true + SKIPPED; tek store_transactions satırı; webhook_events'te mükerrer yok (B-13) |
| Satın alımları geri yükleme | ✅ (simülasyon sınırlı) | A-19: sync simüle sağlayıcıda boş durum → NONE, sahte hak üretmez; birim: `syncEntitlements` boş mağaza durumunda açık aboneliği EXPIRED yapar; RC yolu B-14'te fail-closed 503 ile kanıtlandı (gerçek RC subscriber ters sorgusu §7'de) |

### 3.2 Kredi senaryoları

| Senaryo | Sonuç | Kanıt |
|---|---|---|
| Test kredi paketinin doğrulanması | ✅ | A-03: simülasyon validate → 201 (SANDBOX etiketi; üretimde reddedilir) |
| Doğru kredi bakiyesinin oluşması | ✅ | A-03/A-04: PACK_10 → purchased=10, ledger PURCHASE +10, `expires_at=NULL` (süresiz bakiye — Güvenlik-8) |
| Kredi hareketlerinin ledger'a yazılması | ✅ | A-04: `purchase:IOS:<tx>` tek satır; A-12: `unlock:<user>:<ep>` tek satır; B-08: REFUND ledger tek satır |
| Ücretli bölümün doğru maliyetle açılması | ✅ | A-12: maliyet düşüldü, bakiye `10-cost` |
| Aynı bölümü ikinci kez açma | ✅ | A-12: alreadyUnlocked=true, bakiye değişmedi |
| Yetersiz kredi | ✅ | A-11: 402 INSUFFICIENT_CREDITS (bakiye=0) |
| Aynı anda iki bölüm açma isteği | ✅ (F7-04 düzeltmesiyle) | A-13: paralel 2 istek → biri 201, diğeri 409 CONFLICT; tek UNLOCK_SPEND; bakiye tek maliyet düşülmüş. Düzeltme öncesi kaybeden **500** alıyordu (bkz. §4) |
| Aynı satın almanın iki kez işlenmesi | ✅ | A-05: Idempotency-Key tekrarı → anlamsal olarak birebir aynı yanıt (JSONB anahtar sırası farkı not edildi); A-06: farklı key + aynı tx → alreadyProcessed=true, tek ledger satırı |
| İade/iptal sonrası kredi durumu | ✅ (F7-03 düzeltmesiyle) | B-08: PACK_25 (+25+5) → harcama (hediye önce) → REFUND → kalan bakiye clawback (harcanan 2 kredi geri istenmedi), cüzdan 0/0, REFUND ledger tek satır, iade tekrarı SKIPPED. Düzeltme öncesi iade webhook'u FAILED oluyordu (bkz. §4) |

### 3.3 Güvenlik maddeleri

| # | Madde | Sonuç | Kanıt |
|---|---|---|---|
| 1 | İstemci fiyat/kredi beyanına güvenilmez | ✅ | A-08: `priceKurus: 1` bildirimi krediyi değiştirmedi (+10 DB paketinden); kredi miktarı yalnız DB `credit_packs`'ten hesaplanır; mobil taraf mağaza offerings fiyatını kullanır (Güvenlik-10, birim testli) |
| 2 | Doğrulanmadan kredi eklenmediğini kanıtlama | ✅ | Doğrudan kredi ekleme ucu yok (kod denetimi); tek yol validate (sağlayıcı ters sorgusu) veya imzalı webhook; A-11/A-09/A-14: doğrulamasız tüm yollar bakiyeyi 0'da bıraktı |
| 3 | İstemci tarafında sahte başarıyla premium erişim denemesi | ✅ | A-09: sahte ürün → 400/404 + 0 kredi; A-20: anonim/sahte token → 401; A-15: aboneliksiz premium oturum → 402 (sunucu karar verir) |
| 4 | Webhook imzası ve olay tekrarı | ✅ | A-14: imzasız + yanlış HMAC → SKIPPED (INVALID_SIGNATURE); B-05: yanlış RC Bearer → SKIPPED (timing-safe); A-16/B-04: tekrar → SKIPPED; B-13: (source,eventId) UNIQUE ihlali yok |
| 5 | Kredi harcama + bölüm açma atomikliği | ✅ | Kod: tek `$transaction` + cüzdan `FOR UPDATE` + ledger append + UNIQUE(user,episode); A-13: paralel yarışta tek harcama; A-12: idempotent ikinci çağrı |
| 6 | Apple/Google ürün kimliği eşlemesi | ✅ | A-01: `/billing/config` ürün kimlikleri seed DB ile birebir (`perdego.sub.monthly` ×2 platform, `perdego.pack.pack_10` ×2); B-03/B-08: RC `product_id` → plan/paket çözümlemesi iki platformda canlı |
| 7 | Mağazada ürün tanımlı değilse gerçek satın alma | ⚠️ YAPILAMADI | RevenueCat sandbox hesabı ve mağaza ürünleri yok → RC REST ters sorgusu **gerçek anahtarla** ve gerçek mağaza satın alması doğrulanamadı. Test anahtarlı koşumda RC API gerçekten çağrıldı ve 401 → 503 fail-closed kanıtlandı (B-02, B-14) — yani hat yolu çalışıyor, kimlik doğrulaması yapılamıyor. Sahte başarı üretilmedi |

## 4. Bulunan Hatalar ve Düzeltmeler

Bu QA koşumunda **4 ürün kusuru** bulundu, tamamı faz kapsamında düzeltildi ve regresyonla doğrulandı. Önceki koşumlarda geliştirme sırasında yakalanan F7-01 (RC-JWT başlık çakışması) ve F7-02 (webhook 201→202) zaten geliştirme fazında düzeltilmişti; bu koşumda canlı olarak yeniden doğrulandı (A-18/B-05: RC Bearer yolu 401 değil SKIPPED/PROCESSED davranışı gösteriyor; webhook'lar 202).

| ID | Önem | Kusur | Düzeltme | Kanıt |
|---|---|---|---|---|
| **F7-03** | **YÜKSEK** | Kredi paketi iadesinde hediye (bonus) kredi clawback'i **harcanmış hediye krediyi hesaba katmıyordu**: PACK_25 (+25+5) satın alıp 2 hediye kredi harcayan kullanıcının iadesi `refundGranted=5` istiyordu → ledger toplamı −2'ye düşüyordu → `recomputeWalletFromLedger` güvenlik kilidi "Ledger bakiyesi negatife düştü" hatası fırlatıyor → **REFUND webhook'u FAILED**, iade işlenemiyordu (canlı B-08 ve sunucu günlüğüyle yakalandı) | `billing.service.ts applyRefund`: clawback artık **kalan bakiye üst sınırlı**: `refundTotal = min(purchasedPart+grantPart, kalanToplam)`; `refundPurchased = min(purchasedPart, kalanPurchased)`; `refundGranted = min(refundTotal − refundPurchased, kalanGranted)`. Harcanan kredi hiçbir koşulda geri istenmez (iş kuralı korunur) | +3 birim test (harcanmış hediye / kalan sıfır / kısmi harcama), canlı B-08 PASS |
| **F7-04** | ORTA | Global hata filtresinde `statusOf()` Prisma bilinen hatalarını **durum koduna çevirmiyordu**: P2002 gövdesi `CONFLICT/UNIQUE_CONSTRAINT` yazarken HTTP **500** dönüyordu. Eşzamanlı bölüm açma yarışını kaybeden istemci 500 görüyordu (canlı A-13 ile yakalandı) | `error-filter.ts statusOf`: P2002 → 409, P2025 → 404 eşlemesi eklendi (gövde zarfıyla tutarlı) | +2 birim test; canlı A-13: kaybeden artık 409 alıyor |
| **F7-05** | DÜŞÜK | RC `TRANSFER` olayı `app_user_id` taşımadığında `processRevenueCatEvent` erken throw ediyordu → geçerli sahiplik aktarımı FAILED oluyordu (canlı B-11 ile yakalandı) | TRANSFER, `app_user_id` şartından **önce** ele alınır; `transferred_to[0]` + `original_transaction_id` (yoksa `transaction_id`) ile işlenir | +1 birim test; canlı B-11: işlem yeni sahibine taşındı |
| **F7-06** | DÜŞÜK | `syncEntitlements` sağlayıcıya erişilemezse denetlenmemiş 500 `INTERNAL` fırlatıyordu; `validatePurchase` ise 503 `BILLING_PROVIDER_UNREACHABLE` dönüyordu (tutarsızlık) | sync de fail-closed 503 `BILLING_PROVIDER_UNREACHABLE` döner (sahte "senkronlandı" yok) | +1 birim test; canlı B-14: 503 kanıtlandı |

**Araç/ortam düzeltmeleri (ürün kodu değildir):** probe karşılaştırma hatası (JSONB anahtar sırası — önbellek yanıtı alfabetik anahtarla döner, anlamsal eşitlik kullanıldı), `LIKE` ile önceki koşum kayıtlarını sayan A-14 sorgusu, runner'a **port işgalci temizliği** (aşağıdaki ortam tuzağı) ve QA için kayıt rate-limit gevşetmesi eklendi.

### Ortam tuzağı (sonraki ajanlar için önemli)

İlk koşumda Faz A probe'ları **yanlış sunucuya** gitti: önceki geliştirme oturumundan kalma, `perdego_faz7_test` DB'li bir `node dist/main.js` süreci 3199 portunu işgal etmişti; yeni sunucu EADDRINUSE ile sessizce ölüyor, probe eski süreci test ediyordu. Belirti: health "1 denemede" hazır geliyor + DB denetim sorguları boş dönüyor. `scripts/qa-faz7-run-acceptance.sh` artık koşum öncesi port dinleyicilerini öldürür.

## 5. Başarısız veya Çalıştırılamayan Testler

| Test | Durum | Neden |
|---|---|---|
| Gerçek RC anahtarıyla `/billing/purchases/validate` (positif yol) | ⚠️ Çalıştırılamadı | REVENUECAT_SECRET_API_KEY yok (sandbox hesabı yok). Negatif yol (401→503 fail-closed) canlı kanıtlandı. **Güvenlik-7 maddesi uyarınca gerçek satın alma testi YAPILAMADI olarak raporlanır** |
| RC sandbox INITIAL_PURCHASE/CANCELLATION (gerçek mağaza olayları) | ⚠️ Çalıştırılamadı | Mağaza ürünleri tanımlı değil; RC zarfı işleme yolu yerel zarf enjeksiyonuyla canlı kanıtlandı (B fazı) |
| RC SDK cihaz üstü akış (StoreKit/Play Billing satın alma diyaloğu, restore UI) | ⚠️ Çalıştırılamadı | Gerçek cihaz/emülatör + EAS build yok; `react-native-purchases` jest'te native olmadığından mobil taraf port/flow birim testleriyle (billing-flow.test.ts) sınandı |
| `NODE_ENV=production` tam HTTP boot | ⚠️ Bilinçli olarak engelli | Env şeması üretimde `MEDIA_PROVIDER=local` reddeder; bunny/mux/cf fabrikası uygulanmadığından boot'ta hata verir (tasarım kararı). Üretim savunmaları şema+fabrika+sağlayıcı düzeyinde 7 kontrolle kanıtlandı (C fazı: JWT zorunlu, local reddi, webhook sırrı zorunlu, yarım RC yapılandırma reddi, public SDK anahtarı zorunlu, geçerli prod yapılandırma kabulü, simülasyon sağlayıcının üretimde kapalı olması) |
| Mailpit SMTP doğrulaması | ⚠️ Önceki fazlardan kalıtım | Dev outbox transport kullanıldı (FAZ-4 QA'daki ödünle aynı) |

## 6. Önceki Fazlardan Kalan Regresyonlar

| Katman | Sonuç |
|---|---|
| Otomatik: tüm entegrasyon suitleri gerçek PG (faz2b 18, faz2c 11+, faz3, faz4 8, faz7 8) | ✅ 203/203 |
| Canlı: katalog + kişisel listeler (P2C) | ✅ 41/41 |
| Canlı: sayfalama/izolasyon/ek katalog (F5) | ✅ 16/16 |
| Canlı: kimlik doğrulama + oturum (FAZ 3b) | ✅ 22/22 |
| Canlı: video/HLS güvenlik (FAZ 6, TTL=60 gerçek süre aşımı dahil) | ✅ 18/18 |
| Canlı: temel uç + hata sözleşmesi smoke (FAZ 2b) | ✅ 13/13 |

**Regresyon sızıntısı yok.** F7-04 hata filtresi değişikliği tüm uçları etkilediğinden özellikle 402/403/404 davranışları faz6 güvenlik probe'unda (18 kontrol) ve faz2b hata sözleşme smoke'unda yeniden doğrulandı. Kalıtsal kabul edilen ödünler (FAZ-6'dan): bearer imzalı URL hamiliği, dev fallback imza sırrı (üretimde zorunlu sır kuralı F6-01 ile korunuyor).

## 7. Dış Bağımlılıklar ve Dürüst Sınırlar

- **RevenueCat hesabı yok:** sandbox API anahtarı, webhook sırrı ve offerings yapılandırması bulunmuyor. Bu nedenle gerçek sağlayıcı doğrulaması yalnızca "hat yolu + fail-closed" düzeyinde kanıtlanabilir (test anahtarıyla RC API'si gerçekten çağrıldı → 401 → 503).
- **Mağaza ürünleri yok:** App Store Connect / Google Play Console ürünleri tanımlı değil; Güvenlik-7 uyarınca gerçek satın alma testi yapılamadı olarak raporlanır.
- **Gerçek cihaz yok:** RC SDK cihaz üstü akış (satın alma diyaloğu, pending state, restore UI) EAS build gerektirir.
- **Üretim boot engelli:** canlı media sağlayıcı adapter'ı (bunny/mux/cf) henüz uygulanmadığından üretim modu bu depoda tam boot edemez — bilinçli fail-fast tasarımı; üretim öncesi checklist `docs/BILLING_SETUP.md §6`'da.
- **TRANSFER kredi faz kaydı (belgeli sınırlama):** sahiplik aktarımında işlemler/açık bölümler/abonelik yeni kullanıcıya taşınır; kredi **cüzdan bakiyesi** kaynak kullanıcıda kalır (tüketilebilir hak; mağaza düzeyinde de consumable satın alması hesaplar arasında taşınmaz). Ürün kararı gerektirirse GRANT/ADJUSTMENT mekanizması mevcut ledger idempotency altyapısıyla eklenebilir.

## 8. Sonraki Faza Geçiş Kararı

**Geçilebilir.** Kabul kriterlerinin üçü canlı kanıtla karşılandı; bulunan 4 kusur düzeltildi ve 416 otomatik test + 152 canlı kontrol yeşil. Üretim satın alımı açılışı için ön koşullar (RC hesabı, mağaza ürünleri, secret'lar, public SDK anahtarı) `docs/BILLING_SETUP.md` adım adım listeler — **özellik, gerçek satın alma yapılandırması tamamlanmadan üretimde hazır işaretlenmedi** (üretimde yapılandırma eksikse uçlar 503 ile dürüstçe reddediyor; mobil `BillingNotice` ile "ödeme devrede değil" bildiriyor).

**Sonraki ajan için öneriler:** (1) RC sandbox hesabı açıldığında bu raporun §3 tabloları `BILLING_SETUP.md §2-6` adımlarıyla yeniden koşulmalı; (2) `scripts/qa-faz7-run-acceptance.sh` port temizliği ve rate-limit gevşetmesiyle tekrarlanabilir kabul aracıdır; (3) admin panelinde `store_transactions`/`webhook_events` görünümleri ve TRANSFER kredi politikası sonraki faz adayıdır.
