# PerdeGo — API Sözleşmesi (REST /api/v1)

> Sürüm: 1.0 · Tarih: 2026-10-25 · apps/api (NestJS) ↔ apps/mobile ↔ apps/admin
> Zarf, hata kodu ve sayfalama sözleşmeleri `packages/contracts` içindeki
> Zod şemalarıyla birebir örtüşür (`common.ts`, `content.ts`, `user.ts`).
> Bu belge Faz 2–5'te uygulanacak uçları tanımlar; her uç hayata geçtiğinde
> ilgili faz raporunda "uygulandı" olarak işaretlenir.

## 1. Genel Kurallar

1. **Taban adres:** `https://api.perdego.com/api/v1` (geliştirme:
   `http://localhost:3000/api/v1` — bkz. `.env.example`).
2. **Zarf:** Her yanıt `ApiEnvelope`'dır:
   - Başarı: `{ "ok": true, "data": { … } }`
   - Hata: `{ "ok": false, "error": { "code": "NOT_FOUND", "message": "…", "details": { … } } }`
   `message` kullanıcıya gösterilebilir çeviri anahtarıdır; ham sunucu hatası
   sızdırılmaz (ARCHITECTURE v1 §6'dan devralındı).
3. **Kimlik doğrulama:** `Authorization: Bearer <accessToken>` (15 dk ömürlü
   JWT RS256). Refresh uçları hariç tüm uçlar 401 ile korumadır; `FREE`
   oynatma konuklara da açıktır (BR-08) — bu uçlar anonim token'la da çalışır.
4. **Idempotency:** Para/kredi hareketi içeren POST uçları
   `Idempotency-Key: <uuid>` header'ı **zorunlu** tutar (BR-06). Aynı anahtar
   24 saat içinde aynı yanıtı döner; ikinci işlem yazmaz.
5. **Sayfalama:** `?page=1&pageSize=20` (max 50). Yanıt meta'sı `PageMeta`
   şemasıdır.
6. **Dil:** `Accept-Language: tr | en` → sunucu metin alanları bu başlığa göre
   seçilir; mobil istemci seçili `locale`'i header olarak taşır.
7. **Tarih/saat:** ISO-8601 UTC. **Süre:** saniye (int). **Kredi:** tamsayı.
8. **Hız sınırı:** `RATE_LIMITED` (HTTP 429) — yanıt `Retry-After` içerir.

## 2. Kimlik Doğrulama ve Hesap (Faz 3)

| Yöntem ve yol | Özet | Kimlik |
|---------------|------|--------|
| `POST /auth/register` | E-posta ile kayıt (doğrulama e-postası gider) | Anonim |
| `POST /auth/login` | Giriş — doğrulanmamış e-postada 403 EMAIL_NOT_VERIFIED | Anonim |
| `POST /auth/refresh` | Access token yenileme (rotasyonlu) | Refresh token |
| `POST /auth/logout` | Mevcut oturum iptali | Access |
| `POST /auth/logout-all` | Tüm cihazlardan çıkış | Access |
| `GET /auth/sessions` | Aktif oturum listesi | Access |
| `DELETE /auth/sessions/{id}` | Tek oturumu uzaktan iptal | Access |
| `POST /auth/verify-email` | E-posta doğrulama anahtarını tüketir | Anonim |
| `POST /auth/resend-verification` | Doğrulama e-postasını yeniden gönder | Anonim |
| `POST /auth/forgot-password` | Sıfırlama e-postası (yanıt daima olumlu) | Anonim |
| `POST /auth/reset-password` | Parola sıfırlama + tüm oturumlar kapanır | Anonim |
| `POST /auth/change-password` | Parola değiştirme + diğer oturumlar kapanır | Access |
| `GET /me` · `PATCH /me` | Profil oku/güncelle | Access |
| `POST /me/avatar` · `DELETE /me/avatar` | Profil fotoğrafı (jpeg/png/webp ≤ 2 MB) | Access |
| `POST /account/delete-request` | Hesap silme talebi (parola teyitli, 30 gün nefallet) | Access |
| `POST /account/restore` | Nefallet içinde silme talebini geri al | Anonim |
| `GET /legal/terms` · `GET /legal/privacy` | Yasal metinler (sürümlü, anonim) | Anonim |

**Rate limit (Faz 3b)**: register/login/forgot/resend/reset uçları IP başına
kayan pencere ile sınırlıdır (varsayılan 60 sn'de login 5, register 3, reset 3).
Aşım → `429 RATE_LIMITED` + `details.retryAfterSeconds`. Yatay ölçeklemede
Redis tabanlı sayaç gerekir (tek örnekli bellek içi uygulama).

**E-posta doğrulama politikası**: kayıt oturum açar (göz atma penceresi) ancak
`emailVerifiedAt` mühürlenmeden YENİ giriş ve refresh reddedilir
(`403` + `reason: "EMAIL_NOT_VERIFIED"`). Anahtarlar tek kullanımlık, DB'de
yalnızca SHA-256 özeti saklanır; yeni anahtar üretimi eski tüketilmemiş
anahtarı geçersiz kılar. Geliştirmede Mailpit (`SMTP_HOST=localhost:1025`)
veya dosya outbox'u (`MAIL_OUTBOX_FILE`) kullanılır.

**POST /auth/register**
```jsonc
// istek
{ "displayName": "Ayşe", "email": "ayse@ornek.com", "password": "••••••••", "locale": "tr" }
// yanıt (data)
{
  "user": { "id": "usr_…", "displayName": "Ayşe", "maskedEmail": "a***@ornek.com",
            "preferredLocale": "tr", "joinedAt": "2026-10-25T09:00:00Z" },
  "tokens": { "accessToken": "eyJ…", "refreshToken": "…", "expiresIn": 900 }
}
```
Doğrulama: e-posta RFC + normalize; şifre min 8, en az 1 harf + 1 rakam
(Zod şeması contracts'a Faz 3'te eklenir).

**POST /auth/refresh** — refresh token rotasyonu: eski token tek kullanımlık;
yeniden kullanım denemesi (`reuse detection`) ilgili oturum ailesini iptal
eder → `401 UNAUTHORIZED` + `reason: "REFRESH_REUSED"`.

**POST /account/delete-request** — parola teyitli; hesabı derhal kilitler
(status=DELETED), tüm oturumları kapatır ve 30 günlük nefallet başlatır
(yanıt: `purgeAt`). Süre sonunda kişisel veri anonimleştirilir; finansal
kayıtlar yasal saklama süresince korunur (docs/ACCOUNT_DELETION.md).
`POST /account/restore` nefallet içinde hesabı geri açar ve tam oturum döner.

**GET /auth/sessions** — `items[]: { id, userAgent, createdAt, expiresAt,
current }`. Access token, oturumu kapalı olsa bile TTL'i (15 dk) dolana dek
kriptografik olarak geçerlidir; iptal zorlaması refresh akışındadır
(bilinçli ödün: kısa TTL + rotasyon, bkz. SECURITY.md).

## 3. Katalog ve Keşif (Faz 2)

| Yöntem ve yol | Özet | Kimlik |
|---------------|------|--------|
| `GET /catalog/feed` | Ana sayfa bölümleri (`FeedResponse`) | Anonim |
| `GET /catalog/categories` | Kategori listesi | Anonim |
| `GET /catalog/categories/{slug}` | Sayfalı kategori içeriği | Anonim |
| `GET /search?query=…` | Sayfalı arama (`SearchResponse`) | Anonim |
| `GET /contents/{slug}` | İçerik detayı (`Content`) | Anonim |
| `GET /contents/{slug}/episodes` | Sezonlu bölüm listesi + kullanıcı erişim durumu | Anonim (kayıtlıysa kişisel) |

İçerik detayı yanıtı Faz 1 sözleşmesine (`contentSchema`) uyar; Faz 2'de
şemaya yalnızca **eklenebilir** (breaking değişiklik yasaktır). Bölüm
listesinde her bölüm ek alan taşır:

```jsonc
// GET /contents/{slug}/episodes (data.episodes[])
{
  "id": "ep_…", "seasonNumber": 1, "episodeNumber": 3,
  "title": "Son Perde", "durationSeconds": 512,
  "accessType": "CREDIT",
  "creditCost": 2,                    // yalnızca accessType=CREDIT
  "access": { "canPlay": false, "reason": "NEEDS_CREDITS", "unlockedAt": null }
}
```
`access` alanı **sunucu kararidir** (BR-07): `canPlay=true` olmayan bölüme
oynatma oturumu istenemez (sunucu yine de doğrular). `reason` değerleri:
`FREE` | `SUBSCRIPTION_ACTIVE` | `NEEDS_SUBSCRIPTION` | `NEEDS_CREDITS` |
`UNLOCKED` | `SCHEDULED` (yayın tarihi gelecekte) | `AGE_RESTRICTED`.

## 4. Oynatma (FAZ 4 — gerçek video akışı, MediaProvider portu)

| Yöntem ve yol | Özet | Kimlik |
|---------------|------|--------|
| `POST /media/playback/{episodeId}/session` | Erişim kararı + imzalı akış kaynakları (hls/mp4) + altyazı listesi | Anonim (FREE) / Access |
| `GET /media/hls/{episodeId}/{sessionId}/*file` | İmzalı dosya servisi: master/varyant playlist, `.ts` segment, `.vtt` altyazı, `video.mp4` (Range 206) | İmzalı (token+exp) |
| `PUT /media/upload/{mediaId}` | Sağlayıcıya doğrudan yükleme (local mod) — ham dosya gövdesi | İmzalı (token+exp) |
| `POST /admin/episodes/{episodeId}/media/upload-url` | Süreli imzalı yükleme anahtarı üretimi | EDITOR/ADMIN |
| `GET /admin/media/{mediaId}` · `POST /admin/media/{mediaId}/sync` | İşleme durumu (AWAITING_UPLOAD/PROCESSING/READY/ERROR) takibi | EDITOR/ADMIN |
| `GET /admin/episodes/{episodeId}/media` · `DELETE /admin/media/{mediaId}` | Bölüm medya listesi / silme | EDITOR/ADMIN |
| `PUT /watch-progress/{episodeId}` | Konum senkronizasyonu (5 sn aralık) | Access |
| `GET /watch-progress` | İzleme geçmişi + devam et rayı (scope=continue\|history) | Access |
| `GET /watchlist` · `POST/DELETE /watchlist/{contentId}` | Favoriler | Access |

**POST /media/playback/{episodeId}/session** — sunucu sırasıyla `content.status`,
`episode.status`, `accessType`, abonelik (`subscriptions`), `episode_unlocks`
ve `age_rating` kontrolü yapar (BR-07); başarılıysa MediaProvider portundan
OTURUMA ÖZGÜ imzalı kaynaklar üretir (TTL = `PLAYBACK_TTL_SECONDS`, varsayılan 300 sn):

```jsonc
// yanıt (data) — contracts playbackSessionSchema
{
  "episodeId": "ep_…",
  "provider": "LOCAL",                      // LOCAL | BUNNY | CLOUDFLARE | MUX
  "playbackUrl": "https://…/media/hls/{ep}/{session}/master.m3u8?token=…&exp=…",
  "sources": {
    "hls": "https://…/master.m3u8?token=…&exp=…",   // native (ABR + altyazı grubu)
    "mp4": "https://…/video.mp4?token=…&exp=…"      // web/ilerleyici yedek
  },
  "expiresAt": "2026-10-25T09:05:00Z",
  "positionSeconds": 187,            // kaldığı yer (BR-09)
  "quality": ["240p", "360p", "540p"],
  "guest": false,
  "textTracks": [
    { "language": "tr", "label": "Türkçe", "isDefault": true,
      "url": "https://…/subtitles/tr.vtt?token=…&exp=…" }
  ]
}
```

**İmza modeli**: tüm dosya istekleri `?token=&exp=` taşır; token =
HMAC-SHA256(secret, `playback:{sessionId}:{episodeId}:{exp}`) (32 hex). Her
dosya isteğinde: imza + süre + oturum iptali (DB) + READY denetimi. Segment
satırları manifest içinde sunucu tarafından imzalı mutlak URL'e yeniden
yazılır — istemci hiçbir anahtar barındırmaz, kalıcı public URL üretilemez.

Hata durumları (oturum): `402 PAYMENT_REQUIRED` + `reason: NEEDS_SUBSCRIPTION |
NEEDS_CREDITS`; `403 FORBIDDEN` + `reason: AGE_RESTRICTED`; `409 CONFLICT` +
`reason: EPISODE_NOT_READY | PLAYBACK_LIMIT_REACHED`; `404 NOT_FOUND`.
Dosya uçları: `403` bozuk/süresi geçmiş imza (TOKEN_INVALID/TOKEN_EXPIRED),
`409` MEDIA_MISSING (örnek paketler üretilmemiş).

**Yükleme akışı** (sağlayıcı bağımsız): `POST /admin/episodes/{id}/media/upload-url`
→ `{ mediaId, uploadUrl, method: "PUT", headers, maxSizeBytes, expiresAt }`
→ dosya DOĞRUDAN `uploadUrl`'e PUT edilir (ham bayt gövdesi; JSON değil)
→ `POST /admin/media/{mediaId}/sync` ile `AWAITING_UPLOAD → PROCESSING → READY`
izlenir. Yükleme anahtarı tek kullanımlıktır (ikinci PUT 409
MEDIA_ALREADY_UPLOADED), TTL'i `MEDIA_UPLOAD_TTL_SECONDS` ile sınırlıdır.
Detay: `docs/MEDIA_SETUP.md`.

## 5. Abonelik ve Ürünler (Faz 5)

| Yöntem ve yol | Özet | Kimlik |
|---------------|------|--------|
| `GET /billing/products` | Aktif planlar + kredi paketleri (platforma göre fiyat/ürün kimliği) | Anonim |
| `GET /billing/subscription` | Mevcut abonelik durumu | Access |
| `POST /billing/purchases/validate` | Mağaza satın almasını doğrula (Idempotency-Key zorunlu) | Access |
| `GET /billing/purchases` | Kullanıcının mağaza işlem geçmişi | Access |
| `GET /billing/manage-urls` | Mağaza abonelik yönetim derin bağlantıları | Access |

**POST /billing/purchases/validate**
```jsonc
// istek
{
  "platform": "IOS",                       // IOS | ANDROID
  "productType": "CREDIT_PACK",            // SUBSCRIPTION | CREDIT_PACK
  "productId": "pack_10",
  "storePayload": { /* RC purchase token / JWS sürümü */ },
  "clientId": "c8f…"                       // istemci tarafı satın alma referansı
}
// yanıt (data) — CREDIT_PACK örneği
{
  "storeTransactionId": "2000000123456789",
  "credits": { "purchased": 10, "granted": 2, "balancePurchased": 12, "balanceGranted": 0 },
  "alreadyProcessed": false                // replay'de true döner, yeni ledger yazılmaz
}
```
Kurallar: doğrulama **sunucu tarafında** RevenueCat/App Store Server API/Play
Developer API üzerinden yapılır (BR-07); `store_transactions`
`unique(platform, store_transaction_id)` — ikinci kez gelirse `200
alreadyProcessed=true` (idempotent davranış, hata değil). Doğrulama
başarısızsa `402 PAYMENT_REQUIRED` + `reason: STORE_VALIDATION_FAILED`.

**Restore akışı:** Mağaza geri yükleme (StoreKit restore / Play Billing
`queryPurchases`, RevenueCat `restorePurchases`) istemcide tetiklenir ve
sonucu **aynı** `POST /billing/purchases/validate` ucuyla sunucuda idempotent
doğrulanır — ayrı bir restore ucu tanımlanmaz (BR-06; RELEASE_PLAN §4.1
Apple checklist gereksinimi bu akışla karşılanır).

## 6. Kredi Cüzdanı ve Bölüm Açma (Faz 5)

| Yöntem ve yol | Özet | Kimlik |
|---------------|------|--------|
| `GET /credits/balance` | `{ purchased, granted, total, nextExpiry? }` | Access |
| `GET /credits/transactions?page=` | Ledger görünümü (salt okunur) | Access |
| `POST /playback/episodes/{id}/unlock` | Kredi ile bölüm açma (Idempotency-Key zorunlu) | Access |

**POST /playback/episodes/{id}/unlock** — atomik akış: bölüm `CREDIT` mi →
zaten açık mı (→ `200 { unlocked: true, alreadyUnlocked: true }`) → bakiye
yeterli mi (→ `402 INSUFFICIENT_CREDITS`, `details.balance` ve
`details.creditCost` taşır) → `credit_ledger(UNLOCK_SPEND)` +
`episode_unlocks` yazımı.

**GET /credits/transactions** yanıtı (ledger salt okunur; iade/düzeltme
kayıtları da görünür):
```jsonc
{ "items": [
  { "id": "led_…", "type": "PURCHASE",      "delta": 12, "purchasedDelta": 12, "grantedDelta": 0,
    "createdAt": "2026-10-25T09:12:00Z", "note": null },
  { "id": "led_…", "type": "UNLOCK_SPEND",  "delta": -2, "purchasedDelta": -2, "grantedDelta": 0,
    "createdAt": "2026-10-25T09:30:00Z", "note": null }
], "meta": { … } }
```

## 7. Bildirimler (Faz 7 iskeleti + FAZ 9 push altyapısı)

| Yöntem ve yol | Özet |
|---------------|------|
| `POST /notifications/devices` | Push token kaydı (upsert; çoklu cihaz; `{ platform, pushToken, appVersion?, locale }`) |
| `DELETE /notifications/devices/{id}` | Token iptali |
| `GET /notifications?page=&pageSize=` | Uygulama içi bildirim merkezi (sayfalı + `unreadCount`) |
| `POST /notifications/{id}/read` · `POST /notifications/read-all` | Okundu işaretleme |
| `GET /notifications/preferences` · `PATCH /notifications/preferences` | Tercihler (`system` salt okunur true) |

**FAZ 9 push kuralları:** olay bildirimleri tercihe göre süzülür (tercihle
çelişen kullanıcıya satır bile açılmaz); `dedupKey` aynı olayın aynı
kullanıcıya iki kez düşmesini engeller; cihaz başına gönderim izi
`notification_sends` tablosunda tutulur (PENDING/SENT/FAILED + attempts +
hata izi); sağlayıcı `DeviceNotRegistered` dönerse token `invalidAt` ile
işaretlenir ve TTL sonunda süpürülür; push payload'ı izin listesiyle
sınırlandırıdır (tutar/ödeme verisi taşınmaz). Kurulum: docs/PUSH_SETUP.md.

**Olay tetikleyicileri:** içerik/bölüm yayını (NEW_CONTENT /
NEW_EPISODE — favori+takip hedefli), mağaza satın alma ve iade
(SYSTEM/BILLING), admin kredi düzeltmesi (SYSTEM/BILLING), abonelik
yenileme/bitiş/ödeme sorunu hatırlatması (SYSTEM/SUB_REMINDER,
`SUB_REMINDER_DAYS` penceresi, dönem başına dedup).

## 8. Ödeme Altyapısı ve Sunucudan Sunucuya Uçlar (Faz 7)

Sağlayıcı: **RevenueCat** (StoreKit + Google Play Billing üzerinden yönetilir).
Sağlayıcı seçimi env'dedir (`BILLING_PROVIDER=none|revenuecat`);
`none` iken satın alma uçları `503 BILLING_NOT_CONFIGURED` döner — sahte
başarılı yanıt üretilmez.

### 8.1 İstemci uçları

| Yol | Kimlik | Amaç |
|-----|--------|------|
| `GET /billing/config` | anonim | Sağlayıcı durumu + mağaza ürün kimlikleri + RC public SDK anahtarı (gizli anahtar ASLA dönülmez) |
| `GET /billing/products` | anonim | Planlar + kredi paketleri (bilgilendirme fiyatları; gerçek fiyat mağazadan) |
| `GET /billing/subscription` | access | Abonelik durumu + entitlement |
| `POST /billing/purchases/validate` | access + `Idempotency-Key` | Satın alma doğrulaması: RC REST ters sorgusuyla istemci beyanı doğrulanır, `store_transactions` + ledger idempotent işlenir |
| `POST /billing/entitlements/sync` | access | Mağaza durum eşitleme / geri yükleme: RC subscriber durumu çekilir, abonelik + kredi DB'ye yansıtılır |
| `GET /billing/purchases` | access | Mağaza işlem geçmişi |

### 8.2 Sunucudan sunucuya (webhook) uçları

| Yol | Kaynak | Doğrulama |
|-----|--------|-----------|
| `POST /billing/webhooks/revenuecat` | RevenueCat Webhooks | `Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH_SECRET>` (timing-safe); ham gövde `webhook_events` (UNIQUE source+event_id) → `202` → idempotent işleme |
| `POST /billing/webhooks` | genel zarf / ops aktarımı | `X-PerdeGo-Signature: sha256=HMAC(WEBHOOK_SIGNING_SECRET, body)` |

İşlenen RC olay tipleri: `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`,
`NON_RENEWING_PURCHASE`, `CANCELLATION` (dönem sonu iptal), `UNCANCELLATION`,
`EXPIRATION`, `BILLING_ISSUE` (grace → `GRACE_PERIOD`, aksi `ON_HOLD`),
`SUBSCRIPTION_PAUSED`, `SUBSCRIPTION_EXTENDED`, `REFUND` / `PURCHASE_REFUNDED`
(kredide REFUND ledger clawback, abonelikte EXPIRED), `REFUND_REVERSED`
(abonelik hakkı geri açılır), `TRANSFER` (satın alma ailesi yeni kullanıcıya
taşınır), `TEST`. Bilinmeyen tipler kayda geçer, hataya düşmez.

Not: RevenueCat varsayılan olarak iade webhook'u stream etmez; iade sinyali
(Apple REFUND / Google voided purchase aktarımı ya da ops olayı) genel zarfla
veya `REFUND` tipiyle kabul edilir. Yeniden gönderim güvenli: çift olay
`duplicate=true, state=SKIPPED`.

### 8.3 Doğrulama kuralları (özet)

1. İstemcinin bildirdiği satın alma sonucuna tek başına güvenilmez —
   `revenuecat` sağlayıcısında sunucu RC subscriber API'siyle ters sorgu yapar.
2. Üretimde sandbox satın alma (`environment=SANDBOX`) reddedilir
   (`SANDBOX_PURCHASE_REJECTED`).
3. Kredi bakiyesi doğrudan artırılmaz; doğrulanmış `store_transactions`
   kaydı + `credit_ledger` PURCHASE satırı oluşur (satın alınan kredi
   `expires_at = NULL` — süresiz bakiye politikası).
4. Kredi harcama + bölüm açma tek transaction, cüzdan satırı `FOR UPDATE`.
5. Webhook `event.id` UNIQUE ile çift olay idempotent işlenir.

## 9. Admin Uçları (Faz 6, özet)

`/admin/*` altında ayrı RBAC guard (`role IN (ADMIN, EDITOR)`), tümü
`audit_logs` üretir: `contents` CRUD + publish, `episodes` CRUD + upload
oturumu (`POST /admin/episodes/{id}/upload` → presigned URL),
`categories` CRUD, `plans`/`credit_packs` yönetimi, `users` arama/askıya
alma, kredi düzeltmesi (`POST /admin/users/{id}/credits/adjust` — `note`
zorunlu, ledger `ADMIN_ADJUSTMENT`), `store_transactions` listesi, bildirim
kampanyası (`POST /admin/notifications/campaign`), metrik özeti (P).
FAZ 9 ekleri: `GET /admin/notification-campaigns/{id}/sends` (cihaz başına
push gönderim izleri + sayaçlar) ve `POST /admin/push/dispatch` (dispatch +
süpürmeleri elle tetikleme — ADMIN + step-up).

## 10. Hata Kodları

`code` alanı Faz 1 sözleşmesindeki kapanık kümeyi kullanır
(`apiErrorCodeSchema`); ayrıntılı neden `error.details.reason` içinde taşınır:

| HTTP | `code` | `details.reason` örnekleri |
|------|--------|---------------------------|
| 400 | `BAD_REQUEST` | `VALIDATION_FAILED` (+ `fields[]`), `SLUG_INVALID` |
| 401 | `UNAUTHORIZED` | `TOKEN_EXPIRED`, `TOKEN_INVALID`, `REFRESH_REUSED`, `BAD_CREDENTIALS` |
| 403 | `FORBIDDEN` | `AGE_RESTRICTED`, `ACCOUNT_SUSPENDED`, `ADMIN_ONLY`, `EPISODE_NOT_UNLOCKED` |
| 404 | `NOT_FOUND` | `CONTENT_NOT_FOUND`, `EPISODE_NOT_FOUND`, `PLAN_NOT_FOUND` |
| 409 | `CONFLICT` | `EPISODE_NOT_READY`, `EMAIL_ALREADY_EXISTS`, `IDEMPOTENCY_CONFLICT` |
| 402 | `PAYMENT_REQUIRED` | `NEEDS_SUBSCRIPTION`, `NEEDS_CREDITS`, `INSUFFICIENT_CREDITS`, `STORE_VALIDATION_FAILED`, `SUBSCRIPTION_EXPIRED` |
| 429 | `RATE_LIMITED` | `TOO_MANY_REQUESTS` (+ `Retry-After`) |
| 500 | `INTERNAL` | `UNEXPECTED` (traceId içerir) |
| 503 | `SERVICE_UNAVAILABLE` | `VIDEO_PROVIDER_UNAVAILABLE`, `STORE_API_UNAVAILABLE` |

Kural: istemci `code`'a göre genel davranış, `reason`'a göre spesifik
görünüm seçer; `message` doğrudan gösterime girmez (i18n anahtarıdır).

## 11. Sözleşme Sürümleme Kuralları

1. `packages/contracts` tek gerçek kaynaktır; API, sözleşmeye uymayan yanıt
   döndüğünde e2e testler kırmızıdır.
2. Breaking değişiklik: `/api/v2` zorunludur; `v1` en az 6 ay paralel bakılır.
3. Alan ekleme (optional) breaking sayılmaz ve minor sürümde yapılabilir.
4. Her faz, dokümandaki uçların hangi kısmını gerçeklediğini faz raporunda
   tablo hâlinde bildirir (`docs/phases/FAZ-N.md`).
