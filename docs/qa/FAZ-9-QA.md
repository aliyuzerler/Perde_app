# FAZ 9 QA — Push ve Uygulama İçi Bildirimleri (kabul testi)

| | |
|---|---|
| **Faz** | FAZ 9 — Uçtan uca bildirim altyapısı (Expo push + backend dispatch servisi + admin izleme + derin bağlantı) |
| **Doğrulanan commit** | `578f762` (FAZ 9 geliştirmesi; çalışma ağacı temiz) |
| **Tarih** | 2026-10-26 |
| **Sonuç** | **PASS WITH WARNINGS** — kabul kriterleri canlı kanıtla sağlandı; açık risk: gerçek cihaz push'u (APNs/FCM) doğrulanamadı |

---

## 1. Faz Adı ve Test Kapsamı

Doğrulanan faz: **FAZ 9 — Push ve uygulama içi bildirimleri**. Görev yeni özellik geliştirme değildi; mevcut kodun doğruluğu test edildi, hatalar bulundu ve kapsamindekiler düzeltildi.

Kapsam: cihaz token kaydı (upsert/çoklu cihaz), token yenileme ve geçersiz token temizliği, olay bildirimleri (yeni bölüm/yeni içerik), tercihe göre süzme, mükerrer (dedup) önleme, push dispatch + gönderim izleme (SENT/FAILED/PENDING), başarısız gönderim ve yeniden deneme, payload gizliliği (izin listesi), derin bağlantı yönlendirme, kampanya fan-out, abonelik hatırlatma süpürmesi, admin gönderim durum kayıtları, bozuk/izinsiz isteklere dayanıklılık ve önceki fazların regresyonu.

**Kapsam dışı / doğrulanamayan (dürüst sınır):** gerçek cihazda APNs/FCM push teslimi, OS izin diyaloğu davranışı, uygulama açık/arka plan/kapalı durumlarının cihaz üstü gözlemi. Sandbox'ta fiziksel cihaz, EAS derlemesi ve Expo push kimlik bilgisi yok (EAS projectId yer tutucu). Bu sınırlar PUSH_SETUP.md §3-5'te belgelenmiştir; bu sebeple koşulamayan test başarılı işaretlenmemiştir.

## 2. Çalıştırılan Komutlar (gerçek)

| Komut | Kapsam | Sonuç |
|---|---|---|
| `pnpm -r --if-present run typecheck` | 4 workspace (contracts/api/mobile/admin) | ✅ 4/4 temiz |
| `pnpm -r --if-present run lint` | 4 workspace | ✅ 4/4 temiz (1 lint hatası QA sırasında bulundu ve düzeltildi — bkz. §5) |
| `pnpm test` (packages/contracts, vitest) | sözleşme şemaları | ✅ **95/95** |
| `pnpm test` (apps/mobile, jest) | mobil birim testler (derin bağlantı + mock adapter dahil) | ✅ **153/153** (19 suite) |
| `pnpm test` (apps/api, vitest) | birim + gerçek-PG entegrasyon (faz9 14 test; faz8 32; faz7 8; faz2b/2c/3/4 suitleri) | ✅ **272/272** (26 dosya) |
| `pnpm build` (apps/api, `nest build`) | API üretim derlemesi | ✅ webpack OK |
| `pnpm build` (apps/admin, `next build`) | admin üretim derlemesi | ✅ 13/13 rota (◐ PPR korunur) |
| `bash scripts/qa-faz9-run-acceptance.sh` | canlı kabul probe'u (PG→API simulated push→probe→DB denetimi→teardown) | ✅ **36/36 PASS** + DB denetimi (bkz. §4) |
| `bash scripts/qa-faz7-run-acceptance.sh` | FAZ 7 regresyon (abonelik+kredi+üretim savunmaları) | ✅ FAZ A+B+C **TÜMÜ GEÇTİ** |
| `bash scripts/qa-faz8-run-acceptance.sh` | FAZ 8 regresyon (admin panel canlı kabul) | ✅ **102/102 PASS** |
| `bash scripts/qa-faz6-run-probes.sh` | FAZ 6 regresyon (oynatma güvenliği) | ✅ **18/18** |
| `bash scripts/qa-faz4-run-probes.sh` | FAZ 4 regresyon (medya/oynatma) | ✅ **44/44** |
| `bash scripts/qa-faz5-run-probes.sh` | FAZ 5 + P2C + AUTH regresyonu | F5 ✅ 16/16, AUTH ✅ 22/22; P2C 39/40 (ilk koşum — bkz. §5) |
| `bash scripts/qa-faz8-cleanup-p2c-rerun.sh` (düzeltilmiş) | QA verisi temizliği + P2C tekrarı | ✅ **P2C 41/41** |

Toplam otomatik test: **520/520** (contracts 95 + api 272 + mobile 153). Bunların 16'sı bu QA'da eklendi (bkz. §5).

## 3. Kabul Maddelerinin Gerçek Sonuçları (12 madde)

| # | Madde | Kanıt | Sonuç |
|---|---|---|---|
| 1 | Bildirim izninin istenmesi ve reddedilmesi | Kod doğrulaması: `push-registration.ts` izni sorar; ret → `PERMISSION_DENIED`, tekrar istemez (ekran ayarlara yönlendirir). **Cihaz üstü diyaloğu canlı test edilemedi** (cihaz yok); PUSH_SETUP §5.1 senaryosu belgeli | ⚠️ Kod düzeyi OK, cihaz testi beklemede |
| 2 | Cihaz token'ının backend'e kaydı | Canlı: S1.1-S1.5 (kayıt, maskeli yanıt, kimliksiz 401); entegrasyon: upsert aynı token→aynı cihaz, çoklu cihaz | ✅ PASS |
| 3 | Token yenileme + geçersiz token temizliği | Her açılışta upsert (yenileme yolu, S1.2); `DeviceNotRegistered` → `invalidAt` işaretleme (canlı S3 + DB denetimi D3); TTL süpürmesi satırı siler (entegrasyon testi); geçersiz cihaz yeni kampanyaya dahil edilmez (S5.6) | ✅ PASS |
| 4 | Yeni bölüm bildirimi doğru yapım için | Canlı S2.5-2.7 + entegrasyon: `NEW_EPISODE` yalnız favori/takipçilere, `data.episodeId` doğru bölümü gösterir; DB denetimi D1 tür dağılımı | ✅ PASS |
| 5 | Bildirime tıklayınca doğru ekran | Derin bağlantı çözümleyici birim testli (EPISODE→oynatıcı, TITLE→içerik, CAMPAIGN→merkez, BILLING/SUB_REMINDER→hesap, kirli veri→null, encodeURIComponent); köprü `NotificationBridge` dokunma + soğuk başlangıç dinleyicileri kurulu. **Cihaz üstü dokunma canlı test edilemedi** | ⚠️ Birim düzeyi PASS, cihaz testi beklemede |
| 6 | Tercihlerin kaydı ve gönderimde dikkate alınması | PATCH `/notifications/preferences` sonrası kapatılan tür için **bildirim satırı bile açılmıyor** (canlı S4.1 + entegrasyon); kampanya tarafında tercih filtresi (entegrasyon + S5) | ✅ PASS |
| 7 | Mükerrer bildirim önleme | `dedupKey` unique(userId, dedupKey) + `skipDuplicates`; yeniden yayın bildirim üretmez (S2.8 + entegrasyon); DB denetimi D4: dedupKey başına >1 satır **0** | ✅ PASS |
| 8 | Başarısız gönderim ve yeniden deneme | FAILED satırları izleniyor (D2: 2 FAILED); sağlayıcı erişilemez → **PENDING korunur + attempts artar** (yeni birim test); kalıcı hata + MAX_ATTEMPTS(5) → FAILED (yeni birim test); bayat cihaz sağlayıcı çağrılmadan FAILED/TOKEN_INVALID (yeni birim test) | ✅ PASS |
| 9 | Özel bilgi payload'da yok | `toPushMessage` izin listesi birim testli (e-posta/IBAN/tutar/token bantlanır, 64 karakter üstü ve sayısal türler elenir); faturalandırma metinleri kod incelemesi: tutar/kart yok, yalnız kullanıcının kendi bilgisi; admin izlerinde token maskeli (S5.3) | ✅ PASS |
| 10 | Uygulama açık / arka plan / kapalı | Ön plan sunum yapılandırması + dokunma dinleyicisi + soğuk başlangıç (`getLastNotificationResponseAsync`) kod olarak mevcut; **cihaz üstü üç durum canlı gözlemlenemedi** (PUSH_SETUP §5.3-5.4 senaryoları belgeli) | ⚠️ Kod düzeyi OK, cihaz testi beklemede |
| 11 | Zamanlanmış işler / kuyruk / tekrar işleme | Kampanya `SCHEDULED→SENDING` koşullu atomik claim (faz8 entegrasyonu); dispatch çevrimi 30 sn; gönderim kuyruğu DB destekli (notification_sends), retry MAX_ATTEMPTS'e kadar (yeni birim testler); abonelik hatırlatma süpürmesi dönem başına dedup (S6.1-6.3 + entegrasyon). Redis/BullMQ yok — tek örnek in-process çevrim kararı PUSH_SETUP §6'da belgeli (yatay ölçekleme sonraki aşama) | ✅ PASS (mimari notuyla) |
| 12 | Admin gönderim durum kayıtları | `GET /admin/notification-campaigns/:id/sends` sayfa+istatistik+durum filtresi (S5.2/5.5/5.7 + entegrasyon); admin `/notifications` ekranında Gönderim modalı; tokenler maskeli; `POST /admin/push/dispatch` ADMIN+step-up (S0.3), anonim 401 (S0.5) | ✅ PASS |

**Kabul kriteri değerlendirmesi:** Bildirim tercihleri uygulanıyor (madde 6), doğru hedefe yönlendirme çalışıyor (madde 4-5: doğru episodeId + testli rota çözümlemesi), mükerrer bildirimler kontrol altında (madde 7) — üçü de canlı + otomatik kanıtla sağlandı.

## 4. Canlı Kabul Koşumu Detayı (36/36)

`scripts/qa-faz9-run-acceptance.sh` çıktısı (`PUSH_PROVIDER=simulated` — sahte başarı yok; geçersiz token reddedilir; üretimde simulated env refine ile yasak):

- **S0 Ortam (5):** API ayakta, admin+step-up hazır, manuel dispatch ucu ADMIN+step-up ile çalışıyor, anonim dispatch 401.
- **S1 Cihaz token'ı (5):** kayıt + maskeli token, aynı token upsert→aynı cihaz, ikinci cihaz ayrı kayıt, geçersiz işaretli token kayıt altına alınır (temizlik sonradan), kimliksiz 401.
- **S2 Olay bildirimleri (8):** taslak oluşturma, taslağa favori 404 (kural 6), bütünsel yayın, favori/takip, 2. bölüm yayını, NEW_EPISODE + NEW_CONTENT düşer, yeniden yayın→mükerrer yok.
- **S3 Dispatch + izleme (3):** bekleyenler gönderildi, sayaç şeması, `pushSentAt` doldu.
- **S4 Tercih süzme (1):** newEpisode=false → bildirim oluşturulmaz.
- **S5 Kampanya + admin izleme (7):** kampanya SENT, izler items+stats, maskeli token, 2. dispatch→SENT, geçersiz cihaz dışarıda, durum filtresi.
- **S6 Abonelik hatırlatma (3):** SYSTEM/SUB_REMINDER merkezde, aynı dönemde tekrar yok, dedup sonrası tek.
- **S7 In-app okuma (4):** okunmamış var, tek okundu, tümü okundu, unreadCount=0.

**DB denetimi (PostgreSQL):** D1 bildirim tür dağılımı doğru; D2 gönderim izleri SENT=6/FAILED=2 (simulated); D3 geçersiz cihaz `DeviceNotRegistered` gerekliyle işaretli; D4 dedupKey tekilleştirme ihlali **0**; D5 hatırlatma dönem başına 1 satır.

## 5. Bulunan Hatalar ve Yapılan Düzeltmeler

Bu QA'da **ürün kodunda kusur bulunamadı**; ürün dosyası değişmedi. Bulunan ve düzeltilen dört kalem:

| Kod | Önem | Kusur | Düzeltme | Doğrulama |
|---|---|---|---|---|
| F9-QA-01 | Orta (QA aracı) | `qa-faz8-cleanup-p2c-rerun.sh` qa8/qa9 içeriklerini silemiyordu: `watch_history` (content+episode), `playback_sessions`, `episode_unlocks` FK'leri **Restrict** olduğundan DELETE sessizce başarısız oluyor (`set -e` olmadığından akış devam edip 7 yetim içerik kalıyordu; katalog sıralamasını bozuyordu) | Silme sırası Restrict tabloları önceleyecek şekilde genişletildi (notification_sends→notifications→watch_history→playback_sessions→episode_unlocks→episodes→seasons→favorites→home_section_items→contents); Cascade'li tabloların kendiliğinden gittiği belgelendi | Temizlik sonrası `kalan_qa8_icerik=0`, P2C 41/41 |
| F9-QA-02 | Orta (QA aracı) | Aynı betik P2C probe'unu taban adresi geçmeden çağırıyordu; probe varsayılan `localhost:3000`'e bağlanıp API 3002'de olduğundan ECONNREFUSED ile çöküyordu | Probe çağrısına `http://127.0.0.1:3002` argümanı eklendi (açıklayıcı yorumla) | P2C koşumu tamamlanıyor, exit 0 |
| F9-QA-03 | Düşük (test boşluğu) | Kabul maddesi 8'in **retry yolu** (sağlayıcı erişilemez→PENDING, attempts++, MAX_ATTEMPTS→FAILED) ve madde 9'un **payload izin listesi** hiçbir otomatik testle kanıtlanmıyordu; ExpoPushProvider (parçalama/bilet eşleme/DeviceNotRegistered) testsizdi | 16 yeni birim test eklendi: `push.provider.spec.ts` (8) + `push-dispatch.spec.ts` (8 — F9-01 sendId korelasyon regresyonu dahil). Ürün davranışı değişmedi; testler mevcut davranışı doğruladı | 16/16 PASS; api suite 256→272 |
| F9-QA-04 | Düşük (araca özgü) | Yeni spec'te kullanılmayan `where` parametresi lint hatası veriyordu (`@typescript-eslint/no-unused-vars`) | Parametre `_args` olarak yeniden adlandırıldı | lint 4/4 temiz |

**P2C-18 ilk koşumdaki FAIL (39/40):** ürün regresyonu değildi — koşum anında katalogdaki en yeni yayınlanan yapım qa8-film (FILM → 0 sezon) olduğu için probe'un "ilk yapımın bölüm satırı" varsayımı bozuldu (QA verisi kirliliği; FAZ 8 QA'da bilinen aynı davranış). Düzeltilmiş temizlik + tekrar → **41/41**.

## 6. Başarısız veya Çalıştırılamayan Testler

| Test | Sebep | Durum |
|---|---|---|
| Gerçek push teslimi (exp.host → APNs/FCM → cihaz) | Fiziksel cihaz yok; EAS projectId yer tutucu (`__EAS_PROJECT_ID__`); Expo push kimlik bilgisi yok | Çalıştırılamadı — `PUSH_PROVIDER=simulated` ile sunucu tarafı uçtan uca koşuldu; exp.host adapter'ı mock fetch ile birim testli; üretim adımları PUSH_SETUP §4 |
| OS bildirim izni diyaloğu (kabul/ret) + "ayarlara git" akışı | Cihaz/simülatör etkileşimi gerektirir | Çalıştırılamadı — kod yolu doğrulandı (ret→PERMISSION_DENIED, tekrar istemez), senaryo PUSH_SETUP §5.1 |
| Uygulama kapalıyken bildirime dokunma (soğuk başlangıç) cihaz üstü | Gerçek cihaz gerektirir | Çalıştırılamadı — `getLastNotificationResponseAsync` yolu kod doğrulamalı; rota çözümlemesi birim testli |
| BullMQ/Redis kuyruğu | Sandbox'ta Redis yok; faz kararı: DB destekli in-process çevrim (PUSH_SETUP §6) | Kapsam dışı (belgeli geçiş yolu) |

Bu kalemler başarılı işaretlenmedi; sınırlar açıkça raporlandı.

## 7. Önceki Fazlardan Kalan Regresyonlar

| Faz | Suite | Sonuç |
|---|---|---|
| FAZ 4 (medya/oynatma) | canlı probe | ✅ 44/44 |
| FAZ 6 (oynatma güvenliği) | canlı probe | ✅ 18/18 |
| FAZ 7 (satın alma/kredi) | kabul probe (A+B+C) | ✅ TÜMÜ GEÇTİ — FAZ 9'un billing.service'e eklediği bildirim kancaları satın alma/iade akışını bozmuyor |
| FAZ 8 (admin paneli) | kabul probe | ✅ 102/102 — bildirim kampanyaları + step-up + audit uçları yerinde |
| P2C (katalog) | canlı probe | ✅ 41/41 (temizlik sonrası; ilk koşumdaki 1 FAIL veri kirliliğiydi — §5) |
| FAZ 5 + AUTH | canlı probe | ✅ F5 16/16, AUTH 22/22 |
| Entegrasyon suitleri (faz2b/2c/3/4/7/8/9) | api vitest (gerçek PG) | ✅ 272/272 içinde |

Kalan bilinen sınırlar (önceki fazlardan, değişmedi): RC sandbox hesabı/mağaza ürünleri yok (gerçek mağaza satın alması doğrulanamıyor — BILLING_SETUP §6), canlı medya sağlayıcısı yok (MEDIA_PROVIDER=local).

## 8. Bir Sonraki Faza Geçiş Kararı

**Sonuç: PASS WITH WARNINGS.**

Kabul kriterleri (tercihler uygulanmalı, doğru hedefe yönlendirme, mükerrer kontrolü) canlı kanıt ve 520 otomatik testle sağlandı; kritik hata yok. Sonraki faza geçilebilir, **ancak** şu açık riskler bilinerek:

1. **Gerçek cihaz push doğrulaması** (madde 1/5/10'un cihaz üstü kısmı) bir EAS derlemesi + gerçek cihazla PUSH_SETUP §4-5 adımlarıyla yapılmalı — üretim yayını öncesi zorunlu.
2. EAS projectId yer tutucusu `eas init` ile doldurulmalı; üretimde `PUSH_PROVIDER=expo` + `EXPO_PUSH_BASE_URL` ayarlanmalı (PUSH_SETUP §8 checklist).
3. Yatay ölçekleme gerektiğinde BullMQ geçişi (PUSH_SETUP §6) planlanmalı; tek örnek in-process çevrim şu anki ölçek için yeterli.
