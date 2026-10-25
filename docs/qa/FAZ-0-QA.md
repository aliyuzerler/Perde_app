# Faz 0 QA Raporu — Ürün Analizi ve Mimari (Dokümantasyon)

> Tarih: 2026-10-25 · Denetçi: QA oturumu (ana ajan)
> **Karar: PASS WITH WARNINGS** — temel kabul kriterleri karşılandı;
> açık dış bağımlılık riskleri §9'daki risk listesinde izlenmeli.
> Bu oturumda uygulama kodu yazılmamıştır; yalnızca belge düzeltmeleri ve
> iki kırık npm script referansının temizliği yapılmıştır.

## 1. Faz Adı ve Test Kapsamı

| Kalem | Kapsam |
|-------|--------|
| Faz | **Faz 0 — Ürün Analizi ve Mimari** (7 belge: PRD, ARCHITECTURE, ERD, API_CONTRACT, SECURITY, COST_ESTIMATE, RELEASE_PLAN) |
| Statik doğrulama | 10 maddelik kabul kontrol listesi (§3), gereksinim izlenebilirlik tablosu (§4), belgeler arası çelişki taraması |
| Kod tarafı (regresyon) | Faz 1 çıktısı: `packages/contracts` + `apps/mobile` — typecheck, lint, birim testler, expo-doctor, gerçek bundle derlemesi (bu fazda kod değişikliği hedefi yoktur; regresyon kanıtı için çalıştırıldı) |
| Kapsam dışı (bilinçli) | Yeni özellik geliştirme; Faz 2+ kod yazımı; canlı ödeme/gerçek bildirim/üretim DB işlemi (yasak, madde 9) |

## 2. Çalıştırılan Komutlar ve Gerçek Sonuçlar

Komutlar depoda **gerçekten tanımlı** olanlardır (kök `package.json` →
contracts + mobile workspace'lerine delege eder). Tahmini komut
çalıştırılmamıştır.

| # | Komut (dizin) | Gerçek sonuç |
|---|---------------|--------------|
| 1 | `npm run typecheck` (kök) | ✅ PASS — `tsc --noEmit` contracts + mobile, 0 hata |
| 2 | `npm run lint` (kök) | ✅ PASS — `eslint .` (contracts) + `expo lint` (mobile), 0 hata/0 uyarı |
| 3 | `npm run test` (kök) | ✅ PASS — vitest **16/16** (contracts) + jest **49/49** (mobile, 8 dosya) = **65/65** |
| 4 | `npx expo-doctor` (apps/mobile) | ✅ **20/20** kontrol geçti |
| 5 | `npx expo export --platform ios` (apps/mobile) | ✅ iOS HBC bundle derlendi (3,9 MB) → build kanıtı; sonrasında `dist/` temizlendi |
| 6 | `npm run contracts:build` (kök) | ❌ **FAIL** — `Missing script: "build"` (bozuk script tespit edildi → düzeltildi, bkz. §5 D-09) |
| 7 | Düzeltme sonrası 1–3'ün tekrarı | ✅ PASS — typecheck/lint temiz, 65/65 test yeşil |

Not: Metro dev-server ile interaktif UI gezinmesi bu headless oturumda
tekrarlanmadı; derleme kanıtı `expo export` ile verildi. UI gezinme smoke
testi Faz 1 raporunda belgelenmiştir ve bu fazda UI kodu değişmemiştir.

## 3. Faz 0 Kabul Kontrol Listesi (10 madde, madde madde)

| # | Doğrulama sorusu | Sonuç | Kanıt / not |
|---|------------------|-------|-------------|
| 1 | Müşterinin istediği temel özellikler gereksinim dokümanında var mı? | ✅ | §4 izlenebilirlik tablosunda 9/9 kapsam maddesi PRD özellik ID'lerine bağlandı |
| 2 | Mobil/backend/admin/video sorumlulukları açık mı? | ✅ | ARCHITECTURE §3–§6; mobilde DB/ödeme yasağı, admin'in DB'ye doğrudan bağlanmaması tanımlı |
| 3 | ERD kullanıcılar, yapımlar, bölümler, abonelik, satın alma, kredi hareketleri, bölüm açma kayıtlarını doğru ilişkilendiriyor mu? | ✅ (düzeltilerek) | ERD §2 diyagram + §3 tablolar; **eksik `playback_sessions` tablosu bu oturumda eklendi** (bkz. §5 M-02) |
| 4 | Ücretsiz/abonelik/kredi kuralları çelişiyor mu? | ✅ (düzeltilerek) | BR-01..03 ↔ API §3/4/6 ↔ SECURITY §3–5 tutarlı; iade-ifadesi çelişkisi hizalandı (D-05) |
| 5 | Çift işleme (satın alma/unlock) engellendi mi? | ✅ | BR-06: `Idempotency-Key` zorunlu + `unique(platform, store_transaction_id)` + `credit_ledger.idempotency_key unique` + `unique(user_id, episode_id)` + `unique(source, event_id)` (webhook) |
| 6 | HLS imzalı erişim + backend yetkilendirmesi mimaride var mı? | ✅ | ARCH §6.3 (adapter + TTL 300 sn), API §4 (yetki kontrolü → imzalı URL), SECURITY §4 (imza, token bağı, hotlink) |
| 7 | Apple/Google dijital satın alma kuralları için doğrulanacak noktalar ayrı ayrı belirtilmiş mi? | ✅ | ARCH §7.1 (iki satıcı ayrı bloklar), COST §2 (kaynak+tarihli tablo), RELEASE_PLAN §4.1/4.2 checklist |
| 8 | Güvenlik, yedekleme, hesap silme, yönetici yetkilendirmesi ele alındı mı? | ✅ | SECURITY §2/3/6 + §10 (yedek geri yükleme tatbikatı); ARCH §10 (PITR zorunlu); BR-11; ARCH §5 (RBAC + MFA + audit_logs) |
| 9 | Teslim süresi ve maliyetler kesin vaat yerine açık varsayım/senaryo ile mi? | ✅ (düzeltilerek) | COST §1/§3 senaryo+formül tabanlı; **teslim süresi eksikti → RELEASE_PLAN §1.1 "Zaman Varsayımları" eklendi** (M-07) |
| 10 | Belgeler arası çelişki/eksik karar var mı? | ✅ (bulunanlar giderildi) | 12 bulgu sınıflandırıldı ve kapsam içi olanlar düzeltildi (§5); kalanlar risk listesinde (§9) |

## 4. Gereksinim İzlenebilirlik Tablosu

| Gereksinim (müşteri kapsamı) | İlgili belge | Tasarlanan çözüm | Durum | Eksik nokta |
|------------------------------|--------------|------------------|-------|-------------|
| Kayıt, giriş, profil ve hesap silme | PRD F-01..F-04; API_CONTRACT §2; SECURITY §2; ERD §3.1 | E-posta+şifre, argon2id, RS256 access + rotasyonlu refresh, cihaz oturumları, BR-11 anonimleştirme | ✅ Tam | Sosyal giriş bilinçli P fazına ertelendi (gerekçe PRD §6'da) |
| Dikey kısa filmler, mini diziler, diziler ve bölümler | PRD F-14; contracts `contentKind`; ERD contents/episodes | `kind=SHORT_FILM/SERIES/FILM` + `series_format=MINI` (mini dizi); 9:16/2:3/16:9 oran kuralları | ✅ Tam | — |
| Ana sayfa, kategori, arama ve içerik detayları | PRD F-10..F-13; API §3; ERD categories/content_categories | `FeedSection` HERO/RAIL/GRID, sayfalı kategori/arama, `access` alanı sunucu kararı | ✅ Tam | — |
| İzleme geçmişi, izlemeye devam et, favoriler | PRD F-22/F-23; API §4; ERD watch_history/favorites | ≤10 sn konum senkronu (BR-09), UNIQUE(user_id, episode_id), devam et rayı | ✅ Tam | — |
| Ücretsiz, abonelik gerektiren ve kredi ile açılan bölümler | PRD BR-01..BR-03, F-30; API §3/§4/§6; ERD episodes.access_type + credit_cost | Sunucu tarafı erişim kararı; `access.canPlay` sunucudan; 402 kodları | ✅ Tam | — |
| Aylık ve yıllık otomatik yenilenen abonelikler | PRD F-31; ARCH §7.1–7.3; API §5; ERD plans/subscriptions | RevenueCat + sunucu ters sorgu; BR-10 grace period; webhook'lar idempotent | ✅ Tam | Mağaza ürün onayları ve RC hesabı dış bağımlılık (Faz 5) |
| Kredi paketleri, kredi cüzdanı ve bölüm kilidi açma | PRD F-32/F-33; ARCH §7.3; API §6; ERD credit_ledger/credit_wallets/episode_unlocks | Append-only ledger (BR-04), atomik unlock + FOR UPDATE, satın alınan kredi süresiz (BR-05) | ✅ Tam | Apple PLA Schedule 2 kredi maddesinin birincil kaynak teyidi (Faz 6 hukuk) |
| Bildirimler ve yeni bölüm duyuruları | PRD F-40..F-43; ARCH §8; API §7; ERD notifications/devices/notification_preferences | Expo Push (APNs/FCM), BullMQ job, tercih filtresi | ✅ Tam | APNs/FCM anahtarları (Faz 7 manuel adım) |
| Tüm içeriklerin yönetilebildiği web admin paneli | PRD F-50..F-55; ARCH §5; API §9; ERD audit_logs | Next.js + RBAC (ADMIN/EDITOR) + MFA + presigned upload iş akışı | ✅ Tam | — |
| Ek zorunlu iş kuralları (BR-04..BR-13) | PRD §5; SECURITY §5; ERD §4 | Ledger, idempotens, iade, KVKK silme akışları | ✅ Tam | BR-12 "nazik kullanım" kararı Faz 5'te ürün sahibi onayıyla kesinleşecek |

## 5. Bulunan Hatalar ve Düzeltmeler

Önem dereceleri: **Kritik** (güvenlik/veri kaybı/ödeme/açılmama),
**Yüksek** (temel işlev), **Orta** (senaryo bazlı hata/işlev kaybı),
**Düşük** (ikincil). Kritik ve Yüksek seviyede bulgu **yoktur**.

| ID | Sev. | Bulgu | Düzeltme | Durum |
|----|------|-------|----------|-------|
| M-01 | Orta | COST_ESTIMATE §4 iç çelişkili hesap: iki farklı kur varsayımı (₺35 ↔ ₺43), "$1.370 toplam maliyet" ile tablodaki −$1.112 uyumsuz, kırılım "460 abonelik" yanlış, PRD §7'ye hatalı atıf ("3. ayda 50.000 MAU") | §4 tek kur varsayımıyla (1 USD ≈ ₺43, açıkça işaretli) yeniden yazıldı: kırılım ≈ **380 ödeyen abonelik**, katkı ≈ +$2.794/ay; atıf düzeltildi; birim maliyet tablosunda 0,89 → 0,90 (yuvarlama) | ✅ Düzeltildi |
| M-02 | Orta | SECURITY §4 "playback session kaydı" ve "paralel oynatma limiti (2 cihaz) sunucuda sayılır" diyor; ancak ERD'de bu kaydı tutan tablo tanımlı değildi — uygulama fazında tasarım boşluğu yaratacak eksik karar | ERD §3.3'e **`playback_sessions`** tablosu eklendi (user/episode/device FK, expires_at=+300 sn, kısmi unique indeks ile paralel sayaç, günlük temizlik job'ı); ERD §4 akış izine ve SECURITY §4'e çapraz referans eklendi | ✅ Düzeltildi |
| D-03 | Düşük | ERD `users.birth_year` yorumu 18+ kuralını yanlış "F-14"e bağlıyordu (F-14 içerik türü maddesidir) | Referans "PRD §8" olarak düzeltildi | ✅ |
| D-04 | Düşük | ERD `episodes.free_until_at` alanının MVP'de kullanım kararı belirsizdi ("ölü alan" riski) | "MVP'de kullanılmaz (Faz 5+ kararı); oynatma kararında yalnızca access_type esas alınır" notu eklendi | ✅ |
| D-05 | Düşük | SECURITY §5.5 iade maddesi ("unlock hakkı iade edilir") PRD BR-12'nin "iade politikasına göre yönetilir" ifadesiyle çelişkiliydi | İki belge hizalandı: bakiye negatife sokulmaz (DB CHECK), açılmış bölüm hakkı elden çıkarılmaz; kesin karar Faz 5'te ürün sahibi onayıyla | ✅ |
| D-06 | Düşük | RELEASE_PLAN §4.1 Apple checklist "restore purchases akışı var" istiyor; API_CONTRACT'ta restore tanımı yoktu | API_CONTRACT §5'e restore akışı eklendi: istemci SDK restore → aynı `validate` ucu (idempotent), ayrı uç yok | ✅ |
| D-07 | Düşük | Kabul maddesi 9 kapsamında: hiçbir belgede teslim süresi varsayımı yoktu | RELEASE_PLAN §1.1 "Zaman Varsayımları" eklendi (faz bazlı süre aralıkları + MVP toplam ~4–6 ay, "kesin vaat değildir" etiketiyle) | ✅ |
| D-08 | Düşük | ROADMAP (Faz 1–7) ile RELEASE_PLAN'ın "Faz 0" numaralandırması kronoloji karışıklığı yaratıyordu | RELEASE_PLAN §1'e numaralandırma notu eklendi | ✅ |
| D-09 | Düşük | Kırık script (kod/config): kök `npm run contracts:build` → `Missing script: "build"` (contracts'ta build script'i yok; dist çıktısı D2 kararıyla Faz 2 kapsamı) | Kırık script kök `package.json`'dan **kaldırıldı** (erken Faz 2 implementasyonu yapılmadı, Genel Kural 2) | ✅ |
| D-10 | Düşük | Kırık script (kod/config): mobile `npm run reset-project` → silinmiş `scripts/reset-project.js` dosyasına referans (Faz 1'de dosya gerekçeli kaldırılmıştı, script kalmıştı) | Script satırı mobile `package.json`'dan kaldırıldı | ✅ |
| D-11 | Düşük | Vitest yapılandırma uyarısı: `vitest.config.ts` CJS bağlamında ESM sözdizimi (planlanan `configLoader: 'native'` davranış değişikliği bildirimi) — test sonucunu etkilemiyor | Düzeltilmedi; kayda alındı. Gerekçe: yalnızca uyarı, gereksiz yapılandırma değişikliği risk almamak; Faz 2'de contracts `dist/` çıkışına geçilirken (D2) `type: module` kararı tek seferde verilecek | 📌 Bilinen uyarı |
| D-12 | Düşük | RELEASE_PLAN §3.7'de belirsiz ifade ("yayın → webhook yok") | "bölüm yayını mağaza webhook'u gerektirmez: admin publish → kuyruk → APNs/FCM" olarak netleştirildi | ✅ |

## 6. Başarısız veya Çalıştırılamayan Testler

| Test/kontrol | Durum | Neden | Dürüstlük notu |
|--------------|-------|-------|----------------|
| API e2e/entegrasyon testleri | **Yok** | apps/api Faz 2 kapsamındadır; bu fazda mevcut değildir | Çalıştırılmadı ve PASS sayılmadı — faz kapsamı dışıdır |
| Mağaza sandbox ödeme testi (StoreKit/Play sandbox, RC webhook) | **Çalıştırılamaz** | Apple Developer, Google Play Console ve RevenueCat hesapları mevcut değil (Faz 5 manuel adımı) | Mock ile simüle edilip gerçek test gibi gösterilmedi |
| Video oynatma / imzalı URL entegrasyon testi | **Çalıştırılamaz** | Bunny/CF/Mux hesabı ve anahtarları yok (Faz 4 manuel adımı) | — |
| Gerçek cihazda UI smoke testi | **Çalıştırılamaz** | Fiziksel cihaz/Emülatör erişimi bu oturumda yok | Derleme kanıtı `expo export` ile verildi; cihaz testi Faz 2+ kabulünde zorunlu |
| Canlı ödeme/üretim DB/bildirim testi | **Yapılmadı (yasak)** | Görev madde 9 — test amaçlı canlı ödeme, gerçek veri silme, üretim DB değişikliği, gerçek bildirim gönderimi yapılmaz | Bu fazda zaten üretim ortamı yoktur |

## 7. Önceki Fazlardan Kalan Regresyonlar

| Kontrol | Sonuç | Not |
|---------|-------|-----|
| Faz 1 birim testleri (tema token, placeholder, i18n, mock adapter, api-client, format, access, PosterCard) | ✅ 49/49 yeşil | Regresyon yok |
| contracts sözleşme testleri | ✅ 16/16 yeşil | Regresyon yok |
| Mock politikası (yalnızca `__DEV__ && EXPO_PUBLIC_MOCK_API=1`) | ✅ testleriyle korunuyor | Kural 8 ihlali yok |
| expo-doctor bağımlılık uyumu | ✅ 20/20 | Genel Kural 12 uygun |
| Bundle derlemesi (iOS) | ✅ 3,9 MB HBC | Faz 1'deki 1280 modüllük Metro smoke testine eşdeğer derleme kanıtı |
| Kod değişikliği | ⚠️ Yalnızca 2 kırık npm script referansı kaldırıldı (D-09, D-10) | Kaynak kodu (src/) ve yapılandırmalar dokunulmadı; gerekçe §5 tablosunda |

## 8. Yeniden Çalıştırma Sonucu

Düzeltmeler (yalnızca `.md` + 2 `package.json` script satırı) sonrası:
`typecheck` ✅ · `lint` ✅ · `test` ✅ 65/65 — Faz 1 işlevselliğinde bozulma yok.

## 9. Dış Bağımlılık Risk Listesi (henüz doğrulanamayanlar)

Bu liste, geliştirme fazlarını **engellemez**; ilgili fazın manuel adım
listesine bağlanmıştır.

| # | Risk / doğrulanmamış kalem | Sahip belge | Faz / aksiyon |
|---|-----------------------------|-------------|----------------|
| R-01 | Apple PLA Schedule 2'de satın alınan kredilerin süresizliği maddesi bu oturumda birincil kaynaktan teyit edilemedi → tasarım güvenli tarafta (kredi süresiz, BR-05) | ARCH §7.1, RELEASE_PLAN §4.1 | Faz 6: güncel PLA metninin hukuk incelemesi |
| R-02 | Apple/Google/RC/mağaza sandbox hesapları yok → ödeme ve webhook akışları gerçek doğrulanmamış | FAZ-1 §6, RELEASE_PLAN §4 | Faz 5 öncesi hesap açılışları |
| R-03 | Video sağlayıcı (Bunny) hesabı ve imzalama anahtarı yok → imzalı URL davranışı canlı doğrulanmamış (fiyatlar ise 2026-10-25'te resmi sayfadan doğrulandı) | ARCH §6.2, COST §2 | Faz 4 öncesi hesap + adapter contract testleri |
| R-04 | Hosting/DB/Redis liste fiyatları "teyit edilecek" etiketli tahmin | COST §3.2 | Yayın öncesi teklif teyidi |
| R-05 | TRY/USD kursu ve abonelik fiyat kademeleri varsayım (₺43) | COST §4 | Mağaza fiyat kademesi seçiminde teyit |
| R-06 | Google'ın 2026 yeni servis bedeli tablosunun Türkiye'ye yayılma zamanı izlenmeli | COST §2, §5 | Çeyreklik fiyat yeniden doğrulama prosedürü (COST §6) |
| R-07 | Google yeni geliştirici hesabı kapalı test gereksiniminin (testçi/süre) yayın tarihindeki güncel hâli | RELEASE_PLAN §4.2 | Faz 7'de güncel politika metniyle teyit |
| R-08 | EAS/Expo ücret planları teyit edilecek | COST §3.2 | Faz 7 build öncesi |
| R-09 | Mağaza inceleme süresi (1–4 hafta) deneyimsel varsayım | RELEASE_PLAN §1.1 | Faz 7 gerçek veriyle güncellenir |

## 10. Bir Sonraki Faza Geçiş Kararı

**Karar: PASS WITH WARNINGS — Faz 2'ye (API Temeli ve İçerik Hizmeti) geçiş ONAYLANDI.**

- Geliştirmeye başlanmasını engelleyen mimari belirsizlik **kalmadı**: 10 kabul
  maddesinin tamamı ✅; belgeler arası çelişkiler (M-01, M-02, D-03..D-08,
  D-12) giderildi; idempotens/ledger/erişim kararları ERD→API→SECURITY
  zincirinde tutarlı.
- Uyarılar yalnızca §9'daki **dış bağımlılık** kalemleridir; hiçbiri Faz 2
  kapsamını (NestJS iskeleti, katalog uçları, seed, gerçek adapter geçişi)
  engellemez.
- Faz 2 başlangıcında zorunlu girdiler: yerel PostgreSQL 16 (Docker kabul),
  `apps/api` workspace'i; beklemede olan dış hesaplar (R-02, R-03) Faz 4–5
  öncesine kadar gerekli değildir.
