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
| `POST /auth/register` | E-posta ile kayıt | Anonim |
| `POST /auth/login` | Giriş | Anonim |
| `POST /auth/refresh` | Access token yenileme (rotasyonlu) | Refresh token |
| `POST /auth/logout` | Oturum iptali | Access |
| `POST /auth/password/forgot` / `POST /auth/password/reset` | Şifre sıfırlama | Anonim / reset token |
| `DELETE /account` | Hesap silme (BR-11) | Access + şifre onayı |
| `GET /me` · `PATCH /me` | Profil oku/güncelle | Access |

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

**DELETE /account** — `details` içinde kalan bakiye/aktif abonelik uyarısı
döner; ikinci çağrıda `confirm: true` gövdesi zorunlu (BR-11, US-06).

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

## 4. Oynatma (Faz 4)

| Yöntem ve yol | Özet | Kimlik |
|---------------|------|--------|
| `POST /playback/episodes/{id}/session` | Yetki kontrolü + imzalı HLS URL üretimi | Anonim (FREE) / Access |
| `POST /playback/episodes/{id}/progress` | Konum senkronizasyonu (≤10 sn aralık) | Access |
| `GET /watch-history?page=` | İzleme geçmişi | Access |
| `GET /continue-watching` | Devam et listesi (ray) | Access |
| `GET /favorites` · `PUT /favorites/{contentId}` · `DELETE /favorites/{contentId}` | Favoriler | Access |

**POST /playback/episodes/{id}/session** — sunucu sırasıyla `episode.status`,
`accessType`, abonelik (`subscriptions`), `episode_unlocks` ve `age_rating`
kontrolü yapar; başarılıysa `VideoProviderAdapter.createPlayback` çağırır
(TTL 300 sn):

```jsonc
// yanıt (data)
{
  "episodeId": "ep_…",
  "playbackUrl": "https://cdn…/manifest.m3u8?token=…",
  "expiresAt": "2026-10-25T09:05:00Z",
  "positionSeconds": 187,            // kaldığı yer (BR-09)
  "quality": ["240p", "360p", "480p", "720p", "1080p"]
}
```

Hata durumları: `402 PAYMENT_REQUIRED` + `reason: NEEDS_SUBSCRIPTION |
INSUFFICIENT_CREDITS`; `403 FORBIDDEN` + `reason: AGE_RESTRICTED |
ACCOUNT_SUSPENDED`; `409 CONFLICT` + `reason: EPISODE_NOT_READY` (encode
sürüyor); `404 NOT_FOUND`.

İmzasız/erişimsiz URL istekleri sağlayıcı düzeyde 403 döner — istemci bunu
`NETWORK_ERROR` değil `403` görünümüne çevirir (Faz 4 kabul kriteri).

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

## 7. Bildirimler (Faz 7)

| Yöntem ve yol | Özet |
|---------------|------|
| `POST /devices` | Push token kaydı (`{ platform, pushToken, appVersion }`) |
| `DELETE /devices/{id}` | Token iptali (çıkışta) |
| `GET /notifications?page=&unreadOnly=` | Uygulama içi bildirim merkezi |
| `POST /notifications/{id}/read` · `POST /notifications/read-all` | Okundu işaretleme |
| `GET /notification-preferences` · `PATCH /notification-preferences` | Tercihler |

## 8. Sunucudan Sunucuya Uçlar (Faz 5)

| Yol | Kaynak | Doğrulama |
|-----|--------|-----------|
| `POST /webhooks/apple` | App Store Server Notifications V2 | JWT zinciri (x5c) imza kontrolü |
| `POST /webhooks/google` | Play RTDN | Pub/Sub token + Play Developer API sorgusu |
| `POST /webhooks/revenuecat` | RevenueCat Webhooks | `Authorization` imza header'ı |

Tümü: ham gövde `webhook_events`'e yazılır → `202 Accepted` derhâl döner →
BullMQ worker idempotent işler (`UNIQUE(source, event_id)`). Worker,
mağazaya **ters sorgu** ile olayı teyit eder (sahte webhook savunması).

## 9. Admin Uçları (Faz 6, özet)

`/admin/*` altında ayrı RBAC guard (`role IN (ADMIN, EDITOR)`), tümü
`audit_logs` üretir: `contents` CRUD + publish, `episodes` CRUD + upload
oturumu (`POST /admin/episodes/{id}/upload` → presigned URL),
`categories` CRUD, `plans`/`credit_packs` yönetimi, `users` arama/askıya
alma, kredi düzeltmesi (`POST /admin/users/{id}/credits/adjust` — `note`
zorunlu, ledger `ADMIN_ADJUSTMENT`), `store_transactions` listesi, bildirim
kampanyası (`POST /admin/notifications/campaign`), metrik özeti (P).

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
