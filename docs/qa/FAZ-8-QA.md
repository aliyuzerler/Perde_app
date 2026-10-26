# FAZ 8 QA RAPORU — Admin Paneli (gerçek backend CRUD + güvenlik)

| | |
|---|---|
| **Faz** | FAZ 8 — Yönetim panelinin gerçek backend API'sine bağlanması |
| **Doğrulanan geliştirme** | Commit `9c21ff9` (FAZ 8) + bu QA koşumunda yapılan 1 kusur düzeltmesi (F8-QA-01) |
| **Test tarihi** | 2026-10-26 |
| **Test ortamı** | Yerel sandbox: gömülü PostgreSQL 16 (scripts/qa-pg), NestJS dist build (3002), **Next.js production build** (3000, `next start`), seed verisi (5 kategori / 7 içerik / 13 bölüm / 3 demo hesap) |
| **SONUÇ** | **PASS WITH WARNINGS** |

**Kabul kriteri değerlendirmesi:**

1. **Temel CRUD işlemleri gerçek backend verisiyle çalışıyor** — CANLI KANITLI. 102/102 kabul probe'u: yapım oluştur/düzenle/taslak/yayınla, sezon/bölüm CRUD + geçiş matrisi, banner ve ana sayfa bölümü yönetimi, erişim modeli (FREE/SUBSCRIPTION/CREDIT + creditCost), plan/kredi paketi güncelleme (step-up'lı), kredi düzeltmesi, kampanya gönderimi — tümü PostgreSQL'e yazıldı ve geri okundu (§3, §5 DB denetimi).
2. **Yetkisiz kullanıcılar yönetim işlemi yapamıyor** — CANLI KANITLI. Anonim → 401; USER rolü → 403 ADMIN_ONLY (yalnız arayüzde değil, doğrudan backend'e karşı kanıtlandı); EDITOR finansal/kritik yazma uçlarında → 403 (kendi step-up token'ıyla bile); step-up'sız kritik güncelleme → 401 STEP_UP_REQUIRED; başkasının step-up token'ı → 403; askıya alınan hesap token'ı → 403; kendi rolünü değiştirme → 409.

Uyarılar dış bağımlılıklarla ilgilidir (gerçek push tüneli, RevenueCat sandbox'lı mağaza akışı, gerçek tablet donanımı) — bkz. §7. Bu QA'da ayrıca **admin production build'ini kıran YÜKSEK dereceli bir kusur bulundu ve düzeltildi** (F8-QA-01, §4) — geliştirme fazında yalnız dev sunucusu çalıştırıldığından yakalanmamıştı.

---

## 1. Test Kapsamı

**Faz kapsamı (görevin 12 maddesi):** admin giriş/oturum, yetkisiz erişim, yapım CRUD + taslak/yayınlama, sezon/bölüm + sıralama + yayın durumu, kategori/afiş/video metaverisi, erişim modeli kuralları, kredi paketi + abonelik ürün ayarları, satın alma kayıtları + kredi hareketleri, bildirim kampanyaları + içerik sıralama, audit log, form doğrulama/sunucu hataları/yükleme durumları, yetkisiz/bozuk API istekleri.

**Doğrulama katmanları:**
- Canlı HTTP kabul probe'u (yeni QA aracı: `scripts/qa-faz8-acceptance-probe.mjs` + runner) — **102 kontrol**, doğrudan API'ye (RBAC zorlaması kanıtı) ve panel production proxy'sine (köprü kanıtı) karşı.
- Tarayıcı E2E (yeni QA aracı: `scripts/qa-faz8-ui-e2e.py` + runner, Playwright) — **19 kontrol**: form doğrulama, yükleme/başarı/hata durumları, EDITOR RBAC görünürlüğü, oturum kalıcılığı, tablet görünümü; 8 ekran görüntüsü (`scripts/qa-faz8-ui-shots/`).
- PostgreSQL denetim sorguları (runner içinde): audit_logs dağılımı, kampanya/bildirim satırları, credit_ledger izleri, bölüm erişim alanları.
- Önceki fazların canlı regresyon probe'ları (183 kontrol, §6).

**Kapsam dışı / çalıştırılamayan:** gerçek push bildirimi teslimi (APNs/FCM tüneli yok), gerçek mağaza satın alması (RC sandbox yok — FAZ 7 sınırı sürüyor), gerçek cihaz/EAS, video dosyası yükleme akışının tarayıcı üzerinden tekrarı (FAZ 4/6 probe'larıyla canlı regresyonda kanıtlandı — 44+18 kontrol).

## 2. Çalıştırılan Gerçek Komutlar

| Komut | Kaynak | Sonuç |
|---|---|---|
| `pnpm -r --if-present run typecheck` | kök package.json | ✅ 4/4 workspace temiz |
| `pnpm -r --if-present run lint` | kök package.json | ✅ 4/4 workspace temiz |
| `pnpm --filter @perdego/contracts test` | packages/contracts | ✅ 88/88 |
| `pnpm --filter @perdego/api test` (DATABASE_URL gerçek PG; 30+ gerçek-PG entegrasyon testi dahil) | apps/api | ✅ 240/240 (23 suite; integration.faz8-admin 32 test + step-up 5 test) |
| `pnpm --filter @perdego/mobile test` | apps/mobile | ✅ 142/142 |
| `pnpm --filter @perdego/api run build` (nest) | apps/api | ✅ derlendi |
| `pnpm --filter @perdego/admin run build` (next) | apps/admin | ❌→✅ İLK KOŞUMDA KIRIKTI (F8-QA-01); düzeltme sonrası 13/13 rota üretildi |
| `bash scripts/qa-faz8-run-acceptance.sh` (yeni; canlı kabul koşumu: PG→API→admin production→probe→DB denetimi→teardown) | QA aracı | ✅ **102/102** — çıktı: `scripts/qa-faz8-acceptance-output.txt` |
| `bash scripts/qa-faz8-run-ui-e2e.sh` (yeni; production admin + Playwright) | QA aracı | ✅ **19/19** — sonuç: `scripts/qa-faz8-ui-results.json` |
| `bash scripts/qa-faz4-run-probes.sh` (regresyon) | önceki QA aracı | ✅ 44/44 |
| `bash scripts/qa-faz6-run-probes.sh` (regresyon, TTL=60) | önceki QA aracı | ✅ 18/18 |
| `bash scripts/qa-faz7-run-acceptance.sh` (regresyon) | önceki QA aracı | ✅ 42/42 (A+B+C fazları) |
| `node scripts/qa-faz2c-catalog-probe.mjs :3002` (regresyon; QA verisi temizliği sonrası) | önceki QA aracı | ✅ 41/41 |
| FAZ 5 F5 ek probe + AUTH probe (runner içinden) | önceki QA aracı | ✅ 16/16 ve 22/22 |

Toplam: **470 otomatik test + 285 canlı kontrol** (102 kabul + 19 UI E2E + 164 regresyon), tamamı yeşil.

**Ortam tuzakları (bu koşumda yakalandı):** (1) Önceki oturumdan kalma `next dev` süreci (pid 10371) 3000 portunu işgal ediyordu — runner'lara port temizliği eklendi; (2) sandbox arka plan süreçleri araç çağrıları arasında öldürüldüğünden tüm koşumlar tek çağrıda tamamlanacak şekilde runner'lara alındı; (3) auth rate limit (5 giriş/dk) probe bütçesini aşıyordu — yalnız QA env'inde gevşetildi (FAZ 7 deseni; 429 davranışının kendisi FAZ 3b'de kanıtlandı ve bu koşumda da 429 RATE_LIMITED ürettiği ayrıca gözlendi).

## 3. Madde Bazlı Sonuçlar (görevin 12 maddesi)

| # | Madde | Sonuç | Kanıt (probe/E2E) |
|---|---|---|---|
| 1 | Admin giriş ve oturum yönetimi | ✅ | 1.1-1.6: doğru/yanlış parola, bilinmeyen e-posta 401, refresh yeni token, sahte refresh 401; U5 reload sonrası oturum korunur; U12 çıkış → /login |
| 2 | Yetkisiz kullanıcıyla admin endpoint'lerine erişim | ✅ | 2.1-2.10: anonim 401; USER 403 ADMIN_ONLY (dashboard/yapım/kullanıcı); EDITOR 8 okuma ucu 200, finansal/kritik yazmalar 403; editörün kendi step-up token'ıyla bile 403 (7.8) |
| 3 | Yapım oluşturma, düzenleme, taslak, yayınlama | ✅ | 3.1-3.8: DRAFT oluşturma, PATCH (başlık+afiş+kategori) geri okuma, DRAFT→PUBLISHED+publishedAt, katalogda taslak görünmez/yayınlanınca görünür, geçersiz geçiş 400, matris PUBLISHED→ARCHIVED→PUBLISHED, legacy publish ucu |
| 4 | Sezon ve bölüm: oluşturma, sıralama, yayın durumu | ✅ | 4.1-4.12: sezon+409 tekrarı, bölüm+409 tekrarı, numaraya göre sıralı döner, DRAFT başlangıcı, matris PUBLISHED→ARCHIVED→DRAFT, geçersiz geçiş 400, temiz taslak silinir, yayındaki silinemez 409 |
| 5 | Kategori, afiş ve video metadata yönetimi | ✅ | 3.3 (poster+kategori), 5.1-5.8: hero/dikey önizleme/slogan kaydı, banner CRUD + sıra, ana sayfa bölümü + item ekle/çıkar |
| 6 | Ücretsiz/abonelik/kredi erişim kuralları kaydı | ✅ | 4.6 (CREDIT cost 25), 6·a (CREDIT cost'suz → 400), 6.1 (yapım SUBSCRIPTION), 6.2 (bölüm CREDIT'e cost'suz geçiş → 400), 6.3 (cost 15), DB: D4b sorgusu alanları PostgreSQL'de doğruladı |
| 7 | Kredi paketi ve abonelik ürün ayarları | ✅ | 7.1-7.8: ürün kimlikleriyle liste, step-up'sız 401 STEP_UP_REQUIRED, yanlış parola 401, fiyat 5490 kayıt + 4990 geri alma, paket bonus 12 kayıt + geri alma, EDITOR+step-up → 403 |
| 8 | Satın alma kayıtları ve kredi hareketleri | ✅ | 8.1-8.7: store-transactions items+meta, state+productType filtresi, ledger şeması, ADMIN kredi düzeltmesi (+5) → ledger GRANT/ADMIN_ADJUSTMENT izi (API + DB D3 sorgusu), kısa not 400, sıfır delta 400 |
| 9 | Bildirim oluşturma ve içerik sıralama | ✅ | 9.1-9.5: derhal gönderim → SENT (35 sn polling, alıcı 3), planlı → SCHEDULED → iptal → CANCELLED, boş gövde 400; sıralama: 5.3 (banner sortOrder) + 5.8 (bölüm item ekle/çıkar) |
| 10 | Audit log kayıtlarının oluşumu | ✅ | 10.1-10.8: CONTENT_UPDATE (önce/sonra + aktör), PLAN_UPDATE (5490 izi), USER_STATUS_CHANGE ×2 (askıya alma + geri alma; askı hesap girişi 403 / geri alım sonrası 201), CAMPAIGN_SENT, actorId filtresi, self-role 409; DB D1: 21 eylem türü |
| 11 | Form doğrulaması, sunucu hataları, yükleme durumları | ✅ | 11.1-11.9 (eksik alan VALIDATION_FAILED, geçersiz slug, yıl 1800, 404'ler, bozuk tarih 400, aşırı pageSize 400, sunucu ayakta) + U1/U6 (boş form hataları), U2 (yanlış parola alert), U8 (başarı bildirimi) |
| 12 | Yetkisiz/bozuk API istekleri + panel köprüsü | ✅ | 12.1-12.10: bozuk JSON 400 (500 değil), dizgi gövde 400, sahte bearer 401, sahte step-up 403, yabancı step-up 403, SQL desenli arama 200 (veri bütünü), XSS deseni çökertmez; panel proxy üzerinden login+dashboard+step-up'lı yazma; proxy'de anonim 401 |

## 4. Bulunan Hatalar ve Yapılan Düzeltmeler

### F8-QA-01 (YÜKSEK) — Admin paneli production build'i kırıktı

**Belirti:** `pnpm --filter @perdego/admin run build` ilk koşumda başarısız (`next build`, Next.js 16.4.3 + `cacheComponents: true`). Geliştirme fazında yalnız `next dev` çalıştırıldığından (worklog: "production build dışı") fark edilmemişti. Deploy edilememenin yanında iki sayfada hidrasyon uyuşmazlığı riski vardı.

**Üç kök neden ve düzeltmeler (tümü ürün kodunda):**

1. `/titles` — `useState` başlatıcısında `new Date().getFullYear()` prerender sırasında değerlendiriliyor → prerender hatası. **Düzeltme:** alan boş başlar; güncel yıl modal açılışında (kullanıcı etkileşimi) hesaplanır.
2. `/titles/[id]` ve `/users/[id]` — `useParams()` cacheComponents altında dinamik okuma; Suspense sınırı yokken prerender `CLIENT_HOOK_DYNAMIC` ile çöküyor. **Düzeltme:** sayfa gövdeleri `<Suspense>` sınırına alındı (Next'in belgelenen [stream] çözümü); rotalar artık ◐ Partial Prerender ile üretiliyor.
3. `/revenue` (3 bileşen) ve `/notifications` — render anında `readSession()` (localStorage) sunucuda her zaman `false` üretip hidrasyon uyuşmazlığı yaratıyordu. **Düzeltme:** yeni `lib/use-session.ts` — `useSyncExternalStore` tabanlı `useIsAdmin()` (sunucu anlık görüntüsü sabit `false`, istemci gerçek rol; effect-setState kuralı ihlali de yok).

**Doğrulama:** `next build` 13/13 rota ✅; `tsc --noEmit` + `eslint` ✅; UI E2E 19/19 (aynı sayfalar production modunda) ✅; kabul probe 102/102 ✅.

### Araç kalibrasyonu (ürün hatası değil; probe/runner düzeltmeleri)

- NestJS POST uçları 201 döndürüyor (login/refresh/cancel dahil) — probe 200\|201 kabulüne çekildi.
- Hata zarfı: `error.code` genel (UNAUTHORIZED/FORBIDDEN/BAD_REQUEST), spesifik neden `error.details.reason`'da (ADMIN_ONLY, STEP_UP_REQUIRED, VALIDATION_FAILED…) — probe `reasonOf()` yardımcısına geçti. Step-up'sız kritik güncelleme tasarıma uygun **401** (403 değil) döndürüyor.
- Audit eylem adları: CONTENT_UPDATE / PLAN_UPDATE / USER_STATUS_CHANGE / CAMPAIGN_SENT (probe ilk denemede TITLE_UPDATED varsaymıştı).
- Pozitif kredi düzeltmesi ledger'a `type=GRANT` + `referenceType=ADMIN_ADJUSTMENT` olarak yazılıyor (ADJUSTMENT yalnız negatifler için) — probe ve DB sorgusu düzeltildi.
- Kampanya iptali `{ok,id}` döndürüyor; durum liste uçundan doğrulandı.

### QA veri kirliliği (regresyon taramasında yakalandı)

Kabul probe'unun oluşturup yayınladığı `qa8-*` içerikleri katalog sıralamasının en üstüne çıkıp FAZ 5 P2C-18 denetimini bozmuştu (bölümsüz film ilk sırada). **Düzeltme:** `scripts/qa-faz8-cleanup-p2c-rerun.sh` ile QA içerikleri silindi (kalan=0), P2C tekrar koşuldu → 41/41. Ürün kodu etkilenmedi; kalıcı kirlilik bırakmamak için temizlik runner'ı arşive eklendi.

## 5. DB Denetimi (PostgreSQL — probe izleri)

Koşum sonunda `scripts/qa-faz8-acceptance-output.txt` içindeki sorgu kanıtları:

- **audit_logs (15 dk):** 21 eylem türü — CONTENT_CREATE ×3, CONTENT_UPDATE ×6, CONTENT_PUBLISH, CONTENT_STATUS_CHANGE ×3, EPISODE_CREATE ×4, EPISODE_UPDATE ×3, EPISODE_STATUS_CHANGE ×5, EPISODE_DELETE, SEASON_CREATE, BANNER_CREATE/UPDATE/DELETE, HOME_SECTION_CREATE/ITEM_ADD ×2/ITEM_REMOVE, PLAN_UPDATE ×2, CREDIT_PACK_UPDATE ×2, CREDIT_ADJUSTMENT, USER_STATUS_CHANGE ×2, CAMPAIGN_SENT, CAMPAIGN_CANCEL.
- **notification_campaigns:** SENT (alıcı 3, failed 0) + CANCELLED (planlı); **notifications** tablosunda 3 bildirim satırı (3 demo hesaba dispatch).
- **credit_ledger:** GRANT / grantedDelta=5 / referenceType=ADMIN_ADJUSTMENT / note="QA8 kabul: kredi düzeltme kanıtı".
- **episodes (qa8-dizi):** B1 FREE/null, B2 SUBSCRIPTION/null, B3 CREDIT/25 — erişim modeli PostgreSQL'de birebir.

## 6. Regresyon Sonuçları (önceki fazlar)

| Suite | Sonuç |
|---|---|
| contracts (88) + api (240, gerçek PG entegrasyonları dahil) + mobile (142) testleri | ✅ 470/470 |
| FAZ 4 medya probe (yükleme→READY, HLS/MP4/VTT, imza ihlalleri) | ✅ 44/44 |
| FAZ 6 güvenlik probe (TTL=60 gerçek süre aşımı, 402/403/404, sızıntı taramaları) | ✅ 18/18 |
| FAZ 7 kabul probe (sağlayıcı yok / RC test anahtarı / üretim şeması; kredi+abonelik+iade) | ✅ 42/42 |
| FAZ 5 P2C katalog probe | ✅ 41/41 (QA verisi temizliği sonrası; bkz. §4) |
| FAZ 5 F5 ek probe (kişisel listeler) | ✅ 16/16 |
| FAZ 3b AUTH probe (kayıt/doğrulama/oturum) | ✅ 22/22 |
| Swagger | ✅ 93 yol (FAZ 8 admin uçları dahil) |

Mevcut kod gerekçesiz yeniden yazılmadı; ürün değişikliği yalnız F8-QA-01 kapsamındaki 5 admin UI dosyası + yeni `lib/use-session.ts` ile sınırlı.

## 7. Dürüst Sınırlar / Dış Bağımlılıklar (başarı olarak işaretlenmeyenler)

1. **Gerçek push teslimi doğrulanamadı** — bildirim kampanyalarının dispatch'i DB satırlarıyla (3 notification) kanıtlı; APNs/FCM/Expo push tüneli yok. Push tünellemesi sonraki faz kapsamı.
2. **Gerçek mağaza satın alması doğrulanamadı** — RevenueCat sandbox hesabı/mağaza ürünleri yok (FAZ 7'den devreden sınır). Plan/paket yönetimi ve satın alma kayıtlarının görüntülenmesi mevcut yerel veriyle kanıtlandı.
3. **Gerçek cihaz/EAS yok** — tablet doğrulaması Playwright 768×1024 viewport ile sınırlı (çekmece davranışı, tablo kullanılabilirliği).
4. **Video yükleme akışının tarayıcı tekrarı bu koşumda yapılmadı** — upload-url→PUT→transkod akışı FAZ 4/6 canlı probe'larında (44+18 kontrol) ve FAZ 8 entegrasyon testlerinde kanıtlı; bu QA bunları regresyonda yeniden doğruladı.
5. **Dev ortamı paylaşımları** (FAZ 6'dan devreden ödünler): playback URL'leri bearer imzalı (cihaz bağlaması sonraki faz önerisi), dev fallback imza sırrı biliniyor (üretimde güçlü sır zorunlu — env şeması kanıtlı).

## 8. Sonraki Faza Geçiş Kararı

**PASS WITH WARNINGS** — Kabul kriteri canlı kanıtla sağlandı: panel görsel iskelet olmaktan çıkmış, 9 modülün tamamı gerçek uçlarla çalışıyor, rol/step-up denetimleri yalnız arayüzde değil backend'de zorlanıyor, tüm eylemler audit logda. Bulunan tek kusur (F8-QA-01, YÜKSEK) bu fazda düzeltildi ve regresyonla doğrulandı; kritik açık kusur yok. Uyarılar dış bağımlılık sınırlarıdır (push, RC sandbox, gerçek cihaz).

**Sonraki ajan için notlar:**
- Kabul koşumu yeniden koşulması: `bash scripts/qa-faz8-run-acceptance.sh` (102 kontrol + DB denetimi) ve `bash scripts/qa-faz8-run-ui-e2e.sh` (19 tarayıcı kontrolü). Her ikisi de kendi sunucularını kurup kapatır; koşum sonrası `qa8-*` verisi DB'de kalır → katalog sayımına dokunacak önceki-faz probe'ları öncesi `scripts/qa-faz8-cleanup-p2c-rerun.sh` §1 bloğu çalıştırılmalı.
- Port işgali tuzağı standart karşılanım: her iki runner da 3000/3002 dinleyicilerini koşum öncesi kapatır.
- Admin UI'da `readSession()` render anında kullanılmamalı; `lib/use-session.ts` `useIsAdmin()` kullanın. Dinamik rotalarda `useParams` Suspense sınırı içinde kalmalı (cacheComponents).
