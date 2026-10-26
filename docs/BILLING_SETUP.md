# PerdeGo — Gerçek Abonelik ve Kredi Satın Alma Altyapısı (FAZ 7)

> **Durum: ÜRETİME HAZIR DEĞİL.** Bu belge, gerçek satın alma yapılandırması
> tamamlandığında izlenecek kurulum adımlarını tanımlar. `BILLING_PROVIDER=none`
> iken ödeme uçları `503 BILLING_NOT_CONFIGURED` döner; mobil istemci bunu
> "Ödeme henüz devrede değil" bildirimiyle gösterir. Sahte satın alma başarılı
> yanıtı üretilemez (canlı ortamda simülasyon sağlayıcısı yasaktır).

## 1. Mimari Özet

```
Mobil (expo)                       Backend (NestJS)                    Sağlayıcı
────────────                       ────────────────                    ─────────
react-native-purchases
 (RC SDK, StoreKit/GP Billing)
   │ offerings + purchase
   ▼
BillingFlow (purchaseAndValidate)
   │ POST /billing/purchases/validate
   │   (Idempotency-Key zorunlu)
   │                              BillingProviderPort
   │                              ├─ RevenueCatProvider ─────────────► GET /v1/subscribers/{app_user_id}
   │                              └─ SimulatedBillingProvider          (gizli API anahtarı; ters sorgu)
   │                                  (yalnız dev/test)
   │                              store_transactions UNIQUE + credit_ledger PURCHASE
   │
RC SDK → RevenueCat Webhooks ─────────────────────────────────────────► POST /billing/webhooks/revenuecat
                                  Bearer sırrı doğrulaması             (Authorization başlığı)
                                  webhook_events UNIQUE(source,event_id)
                                  abonelik durum makinesi + kredi ledger
```

Güvenlik ilkeleri:

1. **İstemci beyanına güvenilmez.** Mobil uygulamanın bildirdiği satın alma
   sonucu tek başına hak vermez; sunucu RC REST API'siyle ters sorgu yapar.
2. **Webhook yetkili asenkron kaynaktır.** Bearer sırrı doğrulanır
   (timing-safe); `event.id` UNIQUE ile yeniden gönderimler idempotent işlenir.
3. **Kredi bakiyesi doğrudan artırılmaz.** Doğrulanmış `store_transactions`
   kaydı + append-only `credit_ledger` PURCHASE satırı oluşur; cüzdan ledger
   toplamından türetilir.
4. **Kredi harcama + bölüm açma atomiktir.** Tek transaction, cüzdan satırı
   `FOR UPDATE`, `episode_unlocks UNIQUE(user_id, episode_id)`.
5. **Ortam ayrımı.** RC projesi ortam başına ayrıdır (farklı API anahtarları);
   ürün kimlikleri veritabanı satırlarında (`plans`, `credit_packs`) tutulur ve
   `/billing/config` ile istemciye iletilir. Sandbox satın almalara üretimde
   hak yazılmaz.

## 2. RevenueCat Kurulumu (ortam başına)

Dev / Staging / Production için **ayrı RC projeleri** açın (her projenin kendi
API anahtarları ve ürünleri vardır — ortamlar arası ürün ayrıştırmanın birinci
katmanı budur; ikinci katman ortam veritabanındaki ürün satırlarıdır).

1. **Ürünler (App Store Connect / Play Console + RC):**
   - Abonelikler: `perdego.sub.monthly` (aylık), `perdego.sub.yearly` (yıllık)
     — RC'de entitlement (örn. `premium`) altına bağlanır.
   - Kredi paketleri (CONSUMABLE): `perdego.pack.pack_10`, `perdego.pack.pack_25`,
     `perdego.pack.pack_60`.
   - Ortam önekleri isteniyorsa RC dev projesinde `dev_` öneki kullanın;
     DB'deki `platform_product_id_*` sütunlarını ortamın değerleriyle güncelleyin.
2. **Offerings:** Paywall/kredi mağazası RC offerings'ten paketleri ve mağaza
   fiyatlarını okur. Deneme/kampanya paketleri RC tarafında intro offer /
   özel paket olarak yapılandırılır (sunucu `period_type` ve RC `expires_date`
   ile TRIAL dönemini yazar — genişletilebilir yapı).
3. **Webhook:** RC Dashboard → Integrations → Webhooks:
   - URL: `https://<api-host>/api/v1/billing/webhooks/revenuecat`
   - Authorization header: `Bearer <REVENUECAT_WEBHOOK_AUTH_SECRET>` ile aynı değer
   - En az bir kez teslim (retry) açık kalır — sunucu idempotenttir.
4. **App user id:** Mobil SDK `Purchases.configure({ appUserID: perdegoUserId })`
   ile kurulur (kullanıcı kimliği = RC `app_user_id`). Webhook'lar kullanıcıyı
   bu kimlikle çözümler.

## 3. Sunucu Ortam Değişkenleri

```env
BILLING_PROVIDER=revenuecat
REVENUECAT_SECRET_API_KEY=sk_...            # gizli — yalnız sunucu
REVENUECAT_WEBHOOK_AUTH_SECRET=...          # RC webhook Authorization değeri
REVENUECAT_PUBLIC_SDK_KEY=appl_.../goog_... # istemciye /billing/config ile verilir
REVENUECAT_API_BASE_URL=https://api.revenuecat.com  # varsayılan
```

Kurallar (env şeması doğrular):

- `BILLING_PROVIDER=revenuecat` → gizli anahtar + webhook sırrı **birlikte**
  zorunlu (yarım yapılandırma reddedilir).
- `NODE_ENV=production` + `revenuecat` → public SDK anahtarı da zorunludur.
- `WEBHOOK_SIGNING_SECRET` üretimde zaten zorunludur (genel webhook zarfı için).

## 4. Mobil Uygulama

- Bağımlılık: `react-native-purchases` (Expo dev build / EAS gerekir — Expo Go
  ve web mağaza SDK'sını çalıştıramaz; ekranlar bunu dürüstçe bildirir).
- Yerel yapılandırma: `EXPO_PUBLIC_API_BASE_URL` (RC anahtarı sunucudan
  `/billing/config` ile alınır; istemcide sır YOKTUR).
- Ekranlar: Paywall (abonelik) ve Kredi Mağazası RC offerings fiyatlarını
  gösterir (istemci fiyat sabitlemesi yoktur — mağaza yerelleştirilmiş fiyat
  metni kullanılır). Satın alma → sunucu doğrulaması → cüzdan/abonelik
  sorguları yenilenir. "Satın Almaları Geri Yükle" → `restorePurchases` +
  `POST /billing/entitlements/sync`.

## 5. İade / Chargeback Düzeltmesi (Güvenlik-7)

- **Abonelik iadesi:** İade sinyali `EXPIRED` yazar + `expiresAt=now`; erişim
  derhâl kapanır. (`REFUND_REVERSED` gelirse hak dönem bitişine kadar geri açılır.)
- **Kredi paketi iadesi:** Kullanılmış krediler geri istenemez (mağaza politikası);
  **kalan bakiye kadar** `REFUND` ledger satırı düşer (önce hediye, sonra satın
  alınan — kullanıcı lehine sıra korunur). `refund:<platform>:<tx>` idempotency
  anahtarıyla çift clawback imkânsızdır.
- İade sinyali kanalları: (a) Apple/Google sunucu bildirimlerini RC'ye aktarın
  ve RC'de iade webhook'larını açın (desteklenen olaylar `REFUND_REVERSED` vb.),
  (b) doğrudan Apple S2S / Google voided purchase aktarımı genel zarfla:
  `POST /billing/webhooks` + `X-PerdeGo-Signature`, `eventType=PURCHASE_REFUNDED`.

## 6. Üretime Alma Kontrol Listesi

- [ ] RC prod projesi + ürünler onaylı (App Store Connect / Play Console)
- [ ] `BILLING_PROVIDER=revenuecat` + üç anahtar prod secret store'da
- [ ] Webhook URL + sırrı RC panelden girilmiş, test olayı (`TEST`) 202 dönüyor
- [ ] Sandbox satın alma üretimde reddediliyor (`SANDBOX_PURCHASE_REJECTED`)
- [ ] Prod'da `/billing/config` → `configured: true`
- [ ] Mobil prod derlemesi RC SDK ile kurulu, offerings fiyatları görünüyor
- [ ] İade senaryosu manuel doğrulandı (sandbox)
- [ ] `webhook_events` izleme/alarma: `state=FAILED` sayısı için uyarı

## 7. Test Kapsamı

- Birim: sağlayıcı doğrulaması (RC REST mock), webhook kaynak doğrulaması,
  olay eşleme (tüm RC tipleri), idempotensi, fail-closed 503, env doğrulaması.
- Entegrasyon (gerçek PostgreSQL, `apps/api/src/integration.faz7-billing.spec.ts`):
  config uçları, validate + Idempotency-Key tekrarı + UNIQUE işlem, krediyle
  bölüm açma (regresyon), HMAC webhook abonelik aktivasyonu + yeniden gönderim,
  imzasız reddi, iade clawback + abonelik EXPIRED, denetim izi.
- Mobil: akış katmanı (mağaza sonucu → zorunlu sunucu doğrulaması), durum
  makinesi (unconfigured / unsupported-device / ready), mock adapter idempotensi.
