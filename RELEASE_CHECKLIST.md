# PerdeGo — RELEASE_CHECKLIST (Sürüm 1.0.0 RC)

> Oluşturma: 2026-10-26 (FAZ 10 — Release Candidate ve Regresyon testi)
> **Kural**: Test edilemeyen veya gerçek ortamda doğrulanmamış maddeler
> ❌/⚠️ olarak işaretlendi — hiçbir doğrulanmamış madde ✅ GÖSTERİLMEZ.
> Kanıt ayrıntısı: `docs/qa/FAZ-10-QA.md` ve `docs/qa/FINAL_RELEASE_REPORT.md`.

Durum göstergeleri: ✅ kanıtlandı · ⚠️ kısmen/bilinçli risk · ❌ yapılamadı (dış bağımlılık)

## 1. Otomatik Kalite Kapıları ✅

- [x] TypeScript typecheck 4/4 workspace — `pnpm typecheck`
- [x] ESLint 4/4 workspace — `pnpm lint`
- [x] Birim/entegrasyon testleri **526/526** — contracts 95 + API 278 (gerçek PostgreSQL) + mobile 153 — `pnpm test`
- [x] API production build — `nest build`
- [x] Admin production build — `next build` (13 rota, PPR korunur)
- [x] Temiz veritabanında migration'lar — `prisma migrate deploy` (6 migration) + seed (7 içerik / 13 bölüm / 2 plan / 3 paket)

## 2. Kimlik ve Hesap Akışları ✅ (canlı probe kanıtı)

- [x] Kayıt + e-posta doğrulama + giriş + refresh rotasyonu (AUTH 22/22)
- [x] Brute-force koruması: login 5/dk, register 3/dk, reset 3/dk, **step-up 5/dk (F10-02)** → 429 (FAZ10-C 20/20)
- [x] RBAC: anonim 401, USER 403, EDITOR finansal yazma 403, yabancı step-up token 403
- [x] Kullanıcılar arası veri izolasyonu: liste/cihaz/oturum/bildirim/geçmiş (FAZ10-A S2)
- [x] Hesap silme: uygulama içi ekran + `/account/delete-request` + nefalet/purge (docs/ACCOUNT_DELETION.md)

## 3. Katalog, Arama, Favoriler, İzleme Geçmişi ✅

- [x] Katalog sayfalama + arama + filtreler (P2C 41/41)
- [x] Favori ekleme/izolasyon (FAZ10-A S2), bölüm detay/dizi detay (faz2c)
- [x] "Kaldığı yerden devam": sunucu senkronu (faz4 probe 16. adım) + mobil birim testleri
- [x] Büyük katalog performansı: 2.000 yapım / 8.000 bölümde sayfa-1 ort 5ms, derin sayfa 7ms, arama 8ms, devam-et 6ms; liste sorgusu indeks kullanıyor (EXPLAIN — FAZ10-A S13)

## 4. Video Oynatma ve Yetkiler ✅

- [x] Ücretsiz bölüm: konuk + üye oynatma (faz4 44/44; oturumlu imzalı URL'ler)
- [x] Abonelik bölümü: aktif abone ✅, aboneliksiz 402, **süresi dolmuş abonelik 402** (FAZ10-A S6)
- [x] Kredi bölümü: yetersiz bakiye 402, **eşzamanlı çift açma yarışında tek başarı + bakiye tam 1 düşüş** (FAZ10-A S4)
- [x] Playback token: bozuk imza 403, **süresi dolmuş token 403**, iptal edilen oturum anında kesilir (FAZ10-A S7)
- [x] Oynatıcı kaynak yönetimi ve hata/çevrimdışı ekranları (mobil birim testleri 153/153 kapsamı)
- [ ] ⚠️ Gerçek cihazda oynatma (HLS uyumu, dokunma davranışı) — cihaz yok → §12

## 5. Ödeme / Abonelik / Kredi ✅ (sunucu tarafı; sandbox sınırlı)

- [x] Webhook replay/idempotency: aynı olay iki kez → duplicate=true, çift kredi yok (FAZ10-A S3, FAZ10-B)
- [x] RC Bearer doğrulaması: yanlış/eksik Bearer → SKIPPED (işlenmez)
- [x] Sahte satın alma: sağlayıcı yokken 503 fail-closed; üretimde simüle sağlayıcı env-kapalı (FAZ10-D C-07)
- [x] İade: kredi clawback + abonelik EXPIRED; iade tekrarı idempotent (FAZ10-B B2)
- [x] Abonelik yaşam döngüsü: grace/hold, transfer, bilinmeyen olay toleransı (faz7 42/42)
- [ ] ❌ **Gerçek mağaza sandbox satın alması** (RevenueCat sandbox hesabı + mağaza ürünleri yok) — §10

## 6. Bildirimler ✅ (simüle sağlayıcıyla uçtan uca)

- [x] Cihaz token kaydı/upsert/çoklu cihaz, tercih süzme, dedup, gönderim izleme, geçersiz token temizliği, kampanya fan-out, in-app okuma (faz9 36/36)
- [x] Bildirim tercihleri gönderim anında uygulanıyor; mükerrer bildirim kontrolü (unique dedupKey)
- [x] Derin bağlantı çözümlemesi + bildirim merkezi (mobil birim testleri)
- [ ] ❌ Gerçek cihaz push (APNs/FCM tüneli ve cihaz yok) — PUSH_SETUP §4-5

## 7. Admin Paneli ✅

- [x] 9 modül canlı kabul: 102/102 kontrol (RBAC, step-up, CRUD, gelir modeli, kullanıcı, kampanya, audit)
- [x] UI E2E (Playwright, production admin): 19/19 — form doğrulama, RBAC görünürlüğü, tablet viewport
- [x] Tüm kritik yazma işlemleri ADMIN + step-up + audit log

## 8. Güvenlik Sertleştirmesi ✅

- [x] Secret taraması: repoda gerçek sırrı yok; `.env` dosyaları takip dışı (kök `.env` çıkarıldı — F10-05)
- [x] Güvenlik başlıkları: nosniff/DENY/no-referrer her yanıtta; HSTS üretimde (F10-01, bootstrap.spec)
- [x] Swagger üretimde varsayılan KAPALI (F10-03, bootstrap.spec)
- [x] Log maskeleme: parola/anahtar/token günlüklerde yok (S12); alıcı e-postası maskeli (F10-04)
- [x] Kötü niyetli istekler: SQLi parametrik, XSS zararsız, bozuk JSON 400, 1.2MB gövde reddi, path-traversal sızdırmaz, alg=none JWT 401 (FAZ10-A S8)
- [x] Append-only kredi defteri DELETE reddi canlı (BR-04, FAZ10-A A14.0)
- [x] Bağımlılıklar: js-yaml 5.4.1 + multer 2.5.0 override'landı; `pnpm audit --prod` kalan 2 yüksek (node-forge, zod) **yalnız Expo CLI geliştirme araç zincirinde** — cihaz paketine girmez, node-forge için yama yok (kabul edilmiş risk, izleme maddesi §11)
- [x] Üretim env savunmaları 7/7 (JWT zorunlu, local medya reddi, imza sırrı, RC yarım yapılandırma, simüle push yasak — qa-faz7-prod-refine-check)

## 9. Mağaza Hazırlığı ⚠️ (yapısı hazır, dış adımlar eksik)

- [x] `apps/mobile/eas.json`: development/staging/production profilleri + ortam değişkeni ayrımı + kanallar
- [x] Sürüm numaraları: app version 1.0.0, android versionCode 1, ios buildNumber 1
- [x] Uygulama kimlikleri: `com.perdego.app` (iOS + Android)
- [x] Mağaza metaverisi taslakları: `docs/store/` (listeleme, gizlilik, koşullar, review notları, yaş derecesi önerisi)
- [x] Store ürün kimlikleri tanımlı ve seed/RC eşlemesi kanıtlanmış (`docs/store/REVIEW_NOTES.md` §3)
- [x] Hesap silme akışı + gizlilik politikası taslağı (hukuk onayı bekliyor)
- [x] İkon/uygulanabilir ikon/açılış görselleri mevcut
- [ ] ❌ EAS Build (hesap + `eas init` gerekli; `projectId` placeholder)
- [ ] ❌ Android imzalı dağıtım (upload keystore üretimi + Play Console)
- [ ] ❌ iOS TestFlight (Apple Developer hesabı, sertifika/profil)
- [ ] ❌ Ekran görüntüleri + öne çıkan görsel (cihaz/emülatör gerekli)
- [ ] ⚠️ Gizlilik politikası + kullanım koşulları: taslak hazır, **hukuk incelemesi ve yayımlanmış URL** eksik

## 10. Kullanıcının Sağlayacağı Harici Hesaplar/Bilgiler

| # | Gereksinim | Nerede kullanılıyor |
|---|-----------|---------------------|
| 1 | Apple Developer hesabı ($99/yıl) | TestFlight/App Store, APNs anahtarı |
| 2 | Google Play Console hesabı ($25) | Play yayını, Play Billing ürünleri |
| 3 | RevenueCat hesabı + proje + ürünler | `REVENUECAT_*` env'leri (BILLING_SETUP §2-6) |
| 4 | Canlı video sağlayıcı (bunny/mux/cloudflare) | `MEDIA_PROVIDER` + MEDIA_SETUP (üretimde local yasak) |
| 5 | SMTP sağlayıcı | `SMTP_*` (doğrulama/şifre e-postaları) |
| 6 | EAS hesabı + `npx eas init` | `expo.extra.eas.projectId`, push |
| 7 | Üretim PostgreSQL + barındırma | `DATABASE_URL` |
| 8 | Hukuk incelemesi + şirket/iletişim bilgileri | docs/store taslaklarının yayımı |
| 9 | Destek e-postası/web | mağaza listeleri |
| 10 | İçerik lisansları | ageRating + yayın hakları |

## 11. Yayın Öncesi Kalan Manuel Adımlar (sıralı)

1. RC sandbox'ta RevenueCat hesabı → `BILLING_SETUP §2-6` → `bash scripts/qa-faz7-run-acceptance.sh` yeniden koş (42 kontrol).
2. `npx eas init` → projectId'yi app.json'a yaz → EAS development build → gerçek cihazda push + oynatma smoke testi (PUSH_SETUP §4-5).
3. Mağaza ürünlerini Apple/Google/RC'de oluştur → RC webhook URL + Bearer sırrı ayarla → sandbox satın alma + iade testi.
4. Staging ortamı: `MEDIA_PROVIDER=bunny|mux` + üretim env şeması → boot kanıtı (`NODE_ENV=production` sürümü başarılı şekilde ayağa kalkmalı).
5. docs/store taslaklarını hukuka ver → yayımla → URL'leri mağaza formlarına yaz.
6. Ekran görüntüleri + öne çıkan görsel üret → STORE_LISTINGS §4.
7. Play Console / App Store Connect'te derecelendirme anketleri → STORE_LISTINGS §3.
8. İnceleme test hesabını üretimde oluştur → REVIEW_NOTES §1-2.
9. `bash scripts/qa-faz10-run.sh` + `scripts/qa-faz10-baseline.sh` son kez koş (yeşil kanıt).
10. Gönderim: Play internal track → TestFlight → inceleme.

## 12. Yapılamayan Testler (dürüst sınırlar)

- Gerçek cihaz/emülatörde uygulama davranışı (oynatma, push, arka plan/ön plan
  geçişleri, farklı ekran boyutları) — sandbox'ta Android/iOS SDK ve cihaz yok.
  Mobil taraf 153 birim testi + sunucu tarafı 431 canlı kontrolle karşılanabildi.
- Gerçek mağaza satın alma/renewal/iade (sandbox hesabı yok) — mock/simüle
  sonuçları üretim doğrulaması olarak SUNULMADI.
- EAS build, imzalı AAB, TestFlight — hesap gerektirir.
- Yatay ölçekleme davranışı (bellek-içi rate limit + in-process push kuyruğu
  tek örnek içindir; çok örnekli üretimde Redis/BullMQ geçişi gerekir —
  PUSH_SETUP §6, SECURITY.md).
