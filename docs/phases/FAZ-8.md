# FAZ 8 — Yönetim Paneli (Admin) — Faz Raporu

**Kapsam**: `apps/admin` (Next.js 16 App Router + Tailwind 4) yönetim panelinin gerçek
backend API'sine bağlanması. Panel artık görsel bir iskelet değil; her modül gerçek
uçlarla çalışır, yükleme/hata durumları ve form doğrulamaları uçtan uca uygulanmıştır.

> Not: Kök ROADMAP'teki "Faz 6 — Admin Paneli" kapsamı bu fazda gerçeklenmiştir
> (kullanıcının faz numaralandırmasına göre FAZ 8).

---

## 1. Teslim Edilen Modüller

| Modül | Uçlar (backend) | Panel sayfası | Durum |
|---|---|---|---|
| Dashboard | `GET /admin/dashboard?from&to` | `/` | ✅ kullanıcı/abonelik/katalog sayımları, satın alma + kredi özetleri, tarih aralıklı rapor, günlük seri (kayıt/gelir/açma), son denetim kayıtları |
| Yapım yönetimi | `GET/PATCH /admin/titles(/:id)`, `POST /admin/titles`, durum matrisi, banner + home-section uçları | `/titles`, `/titles/[id]`, `/home-layout` | ✅ oluşturma/düzenleme (afiş, başlık, açıklama, kategori, yayın yılı), taslak→işleniyor→yayında→arşivde geçişleri, öne çıkan banner + ray sırası yönetimi |
| Sezon & bölüm | `POST /admin/titles/:id/seasons`, `PATCH /admin/seasons/:id`, `POST /admin/titles/:id/episodes`, `PATCH/DELETE /admin/episodes/:id`, `PATCH /admin/episodes/:id/status` | `/titles/[id]` (bölümler sekmesi) | ✅ sezon/bölüm oluşturma, numara/süre/açıklama/yayın tarihi, yayınla-yayından kaldır matrisi, kısıtlı silim |
| Medya | `POST /admin/episodes/:id/media/upload-url`, `PUT` (sağlayıcıya doğrudan), `GET /admin/media/:id`, `POST /admin/media/:id/sync`, `POST /admin/episodes/:id/preview` (FAZ 8 yeni) | `/titles/[id]` medya paneli | ✅ süreli imzalı yükleme, transkod takibi (otomatik polling), yayın öncesi önizleme (imzalı, yöneticiye özel oturum) |
| Erişim modeli | bölüm `accessType` + `creditCost` (CREDIT ⇒ >0, sözleşme + sunucu çifte savunma) | bölüm formu | ✅ ücretsiz / abonelik / kredi; kredi fiyatı alanı koşullu görünür ve her iki tarafta doğrulanır |
| Gelir modeli | `GET /admin/plans`, `PATCH /admin/plans/:id` (ADMIN+step-up), `GET/PATCH /admin/credit-packs/:id`, `GET /admin/store-transactions`, `GET /admin/credit-ledger` | `/revenue` | ✅ plan/paket ürün kimlik yönetimi, satın alma kayıtları (iade durumuyla), ledger hareketleri (tip filtresi + kalan bakiye) |
| Kullanıcı yönetimi | `GET /admin/users(/:id)`, `POST /admin/users/:id/credits/adjust`, `PATCH /admin/users/:id/status` ve `/role` (ADMIN+step-up) | `/users`, `/users/[id]` | ✅ arama, profil+cüzdan+abonelik+hareketler, kredi düzeltmesi (gerekçe zorunlu), askıya alma, rol değişikliği |
| Bildirim yönetimi | `NotificationCampaign` modeli (migration), `GET/POST /admin/notification-campaigns`, `POST .../:id/cancel`, 30 sn dispatch çevrimi | `/notifications` | ✅ derhal/planlı duyuru, alıcı/okunma sayaçları, planlı gönderimi iptal |
| Denetim | `GET /admin/audit-logs?action&actorId&entityType` (FAZ 8 filtreleri) | `/audit` | ✅ kim/ne zaman/neyi; önce/sonra JSON diff; append-only |

## 2. Güvenlik Uygulamaları

- **Rol denetimi yalnızca frontend'de değil**: her `/admin/*` ucunda `JwtAuthGuard` +
  `RolesGuard` (EDITOR/ADMIN hiyerarşisi); finansal/kritik uçlar ayrıca `ADMIN` rolü
  ister. Paneldeki disabled butonlar yalnızca UX'tir — sunucu her isteği yeniden
  denetler (entegrasyon testi: EDITOR plan güncellemesi 403 ADMIN_ONLY).
- **Step-up (yeniden kimlik doğrulama)**: `POST /auth/step-up` doğru parolayla 5 dk
  geçerli, sahibine bağlı (sub eşleşmesi) HMAC token üretir. `StepUpGuard` global
  guard olarak kritik uçlarda `X-Step-Up-Token` zorunlu tutar: plan/paket güncelleme,
  kullanıcı durum/rol, kampanya gönderimi/iptali. Panelde ek onay diyaloğu + parola
  modalı akışı vardır.
- **Video sağlayıcı anahtarları tarayıcıya gitmez**: yükleme anahtarı sunucuda üretilir
  (süreli + imzalı), dosya doğrudan sağlayıcıya PUT edilir; panel `/api/v1/*` rewrite
  köprüsüyle aynı menşede konuşur (CORS yok).
- **Kritik işlemler audit log'a yazılır**: içerik/sezon/bölüm/plan/paket/kullanıcı/
  kampanya eylemlerinin tamamı `audit_logs` tablosuna önce/sonra değerlerle kaydedilir.
- **`requestOrigin` proxy desteği**: `X-Forwarded-Host/Proto` önceliklenir; ters proxy
  arkasında üretilen imzalı yükleme/önizleme URL'leri tarayıcıdan erişilebilir kalır.

## 3. Veri Modeli Değişiklikleri

- `NotificationCampaign` modeli + `CampaignStatus` enum'u (migration
  `20261026140000_faz8_admin`): tip, çift dilli metin, `dataJson` deep-link, durum
  makinesi (DRAFT/SCHEDULED/SENDING/SENT/FAILED/CANCELLED), alıcı/hata sayaçları.
  Gönderim koşullu idempotent: yalnızca SCHEDULED/DRAFT→SENDING geçişi alır (paralel
  dispatch kaybedeni sıfır etkiler); alıcılar yalnızca ACTIVE kullanıcılar.

## 4. Doğrulama (Gerçek Komutlar ve Sonuçlar)

| Koşum | Sonuç |
|---|---|
| `pnpm -r` contracts `vitest run` | **88/88 yeşil** (FAZ 8 sözleşme testleri dahil) |
| API `vitest run` (gerçek PG, tüm suitler) | **240/240 yeşil** — 32 FAZ 8 entegrasyon + 5 step-up birim testi yeni |
| API/admin `tsc --noEmit` | temiz |
| API/admin `eslint .` | temiz (0 hata, 0 uyarı) |
| Canlı HTTP smoke | `/health` 200, login 200, dashboard gerçek sayımlar, step-up zorunluluğu (401→403→200 zinciri) |
| Tarayıcı E2E (Agent Browser) | giriş→dashboard→yapım düzenleme→bölüm oluşturma→video yükleme (PROCESSING→READY)→**önizleme videosu gerçekten oynadı** (readyState=4)→plan fiyatı step-up ile güncellendi (DB kanıtlı)→kullanıcı askı/geri al→kampanya gönderimi (3 bildirim satırı DB'de)→audit log diff'leri→EDITOR RBAC görünümü (butonlar disabled + dürüst uyarı)→tablet görünürlüğü (çekmece + yatay kaydırma) |

## 5. Bulunan ve Düzeltilen Kusurlar

- **F8-01 (Orta)**: Bölüm oluşturma formu FREE bölümlerde `creditCost: null` gönderiyordu;
  sözleşme alanı `optional` (null değil) → 400. Düzeltildi: alan yalnızca CREDIT'te
  gönderilir. (UI E2E'de yakalandı, tek satırlık kök neden.)
- **F8-02 (Orta)**: `requestOrigin` ters proxy arkasında `Host` başlığını kullanıyordu;
  Next rewrite arkasında yükleme URL'leri tarayıcıdan erişilemez oluyordu.
  `X-Forwarded-Host/Proto` önceliklendirildi (mobil doğrudan erişim davranışı korunur).
- **F8-03 (Düşük)**: Next 16 dev modunda `allowedDevOrigins` eksikliği sayfayı boş
  render ediyordu (HMR varlıkları engelleniyordu) — yapılandırmaya eklendi.
- **F8-04 (Düşük)**: `listHomeSections` item kimliği dönmüyordu; panelden "listeden
  çıkar" işlemi imkânsızdı — `itemId` yanıta eklendi.

## 6. Dürüst Sınırlar

- **Gerçek mağaza ödemeleri yok**: RevenueCat sandbox hesabı/mağaza ürünleri bu ortamda
  olmadığından (FAZ 7'de belgelenen sınır) gelir görünümü yalnızca mevcut
  `store_transactions` kayıtları üzerinden doğrulanmıştır.
- **Push bildirimi yok**: kampanya gönderimi uygulama içi bildirim satırı üretir; cihaz
  push tünelleme (Expo Notifications/FCM/APNs) roadmap'teki sonraki faza aittir.
- **Üretim sağlayıcıları**: MEDIA_PROVIDER=local geliştirme adaptörü kullanılmıştır;
  Bunny/Mux/Cloudflare sağlayıcıları docs/MEDIA_SETUP.md ile kuruluma hazırdır.
- E2E koşuları sandbox'taki gömülü PostgreSQL + LOCAL medya sağlayıcı ile yapılmıştır;
  tarayıcı önizleme videosu örnek paket ve YÜKLENMİŞ dosya ile ayrı ayrı oynatılmıştır.
