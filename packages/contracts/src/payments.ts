/**
 * Ödeme doğrulama ve webhook sözleşmeleri (Faz 7: gerçek RevenueCat
 * entegrasyonu — sunucu doğrulama arayüzü + webhook zarfı + ürün yapılandırma).
 */
import { z } from 'zod';
import { pageMetaSchema } from './common';

export const platformSchema = z.enum(['IOS', 'ANDROID']);
export const productTypeSchema = z.enum(['SUBSCRIPTION', 'CREDIT_PACK']);

/**
 * POST /api/v1/billing/purchases/validate gövdesi.
 * storeTransactionId: mağazadan alınan dış satın alma kimliği — aynı kimlik
 * ikinci kez işlenemez (UNIQUE(platform, store_transaction_id)).
 *
 * Faz 7 güvenlik kuralı (Güvenlik-1): istemcinin bildirdiği satın alma
 * sonucuna TEK BAŞINA güvenilmez; BILLING_PROVIDER=revenuecat iken sunucu
 * satın almayı RevenueCat REST API'siyle ters sorgular (appUserId = RC
 * app_user_id = PerdeGo kullanıcı kimliği) ve yalnızca doğrulanan veriyi
 * işler. appUserId verilmediğinde doğrulama yalnızca simülasyon sağlayıcısı
 * (geliştirme) ile kabul edilir.
 */
export const purchaseValidateSchema = z.object({
  platform: platformSchema,
  productType: productTypeSchema,
  productId: z.string().min(1).max(120),
  storeTransactionId: z.string().min(1).max(200),
  storeOriginalTransactionId: z.string().min(1).max(200).optional(),
  /** RevenueCat app_user_id (PerdeGo kullanıcı kimliği). */
  appUserId: z.string().min(1).max(200).optional(),
  /** Mağazadan doğrulanan fiyat (kuruş) — yalnızca simülasyon sağlayıcısı kullanır. */
  priceKurus: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  purchaseToken: z.string().min(1).max(4096).optional(),
});
export type PurchaseValidate = z.infer<typeof purchaseValidateSchema>;

/** CREDIT_PACK doğrulama yanıtı. */
export const purchaseValidateResponseSchema = z.object({
  storeTransactionId: z.string().min(1),
  alreadyProcessed: z.boolean(),
  productType: productTypeSchema,
  wallet: z
    .object({
      purchased: z.number().int().min(0),
      granted: z.number().int().min(0),
    })
    .optional(),
  subscription: z
    .object({
      status: z.string().min(1),
      currentPeriodEnd: z.string().nullable().optional(),
    })
    .optional(),
});
export type PurchaseValidateResponse = z.infer<
  typeof purchaseValidateResponseSchema
>;

/** Mağaza işlemi görünümü (kullanıcı geçmişi). */
export const storeTransactionViewSchema = z.object({
  id: z.string().min(1),
  platform: platformSchema,
  productType: productTypeSchema,
  productId: z.string().min(1),
  storeTransactionId: z.string().min(1),
  priceKurus: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  purchaseState: z.enum(['PENDING', 'PURCHASED', 'REFUNDED', 'REVOKED']),
  refundedAt: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
export type StoreTransactionView = z.infer<typeof storeTransactionViewSchema>;

export const storeTransactionListResponseSchema = z.object({
  items: z.array(storeTransactionViewSchema).default([]),
  meta: pageMetaSchema,
});
export type StoreTransactionListResponse = z.infer<
  typeof storeTransactionListResponseSchema
>;

/**
 * POST /api/v1/billing/webhooks gövdesi (sağlayıcı bağımsız zarf).
 * source: APPLE | GOOGLE | REVENUECAT. (source, eventId) UNIQUE —
 * aynı olay ikinci kez işlenmez (Kural 7). Yanıt her zaman 202.
 */
export const webhookIngestSchema = z.object({
  source: z.enum(['APPLE', 'GOOGLE', 'REVENUECAT']),
  eventId: z.string().min(1).max(200),
  eventType: z.string().min(1).max(120),
  payload: z.unknown().optional(),
});
export type WebhookIngest = z.infer<typeof webhookIngestSchema>;

export const webhookIngestResponseSchema = z.object({
  accepted: z.boolean(),
  duplicate: z.boolean(),
  eventId: z.string().min(1),
  state: z.enum(['RECEIVED', 'PROCESSED', 'FAILED', 'SKIPPED']),
});
export type WebhookIngestResponse = z.infer<typeof webhookIngestResponseSchema>;

// ---------------------------------------------------------------------------
// Kredi bakiyesi ve bölüm açma (API_CONTRACT §6)
// ---------------------------------------------------------------------------

/** GET /credits/balance yanıtı. */
export const creditBalanceSchema = z.object({
  purchased: z.number().int().min(0),
  granted: z.number().int().min(0),
  total: z.number().int().min(0),
  nextExpiry: z.string().nullable().optional(),
});
export type CreditBalanceResponse = z.infer<typeof creditBalanceSchema>;

/** POST /credits/unlock/:episodeId gövdesi (boş gövde geçerli). */
export const unlockRequestSchema = z.object({
  /** İstemci referansı (opsiyonel; sunucu doğal idempotensi kullanır). */
  clientRequestId: z.string().min(8).max(64).optional(),
});
export type UnlockRequest = z.infer<typeof unlockRequestSchema>;

/** POST /credits/unlock/:episodeId yanıtı. */
export const unlockResponseSchema = z.object({
  unlocked: z.boolean(),
  alreadyUnlocked: z.boolean(),
  balance: z.object({
    purchased: z.number().int().min(0),
    granted: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  ledgerId: z.string().nullable().optional(),
});
export type UnlockResponse = z.infer<typeof unlockResponseSchema>;

// ---------------------------------------------------------------------------
// Faz 7: ödeme sağlayıcı yapılandırma, mağaza senkronu ve RevenueCat zarfı
// ---------------------------------------------------------------------------

/** Yapılandırılmış ödeme sağlayıcı. none → ödeme devrede değil. */
export const billingProviderSchema = z.enum(['none', 'revenuecat']);
export type BillingProvider = z.infer<typeof billingProviderSchema>;

/** Mağaza ürün kimliği çifti (ortam başına DB'de yapılandırılır). */
export const storeProductIdsSchema = z.object({
  ios: z.string().min(1),
  android: z.string().min(1),
});
export type StoreProductIds = z.infer<typeof storeProductIdsSchema>;

/**
 * GET /billing/config yanıtı (anonim erişilebilir).
 * configured=false iken istemci satın alma akışını başlatmaz ve kullanıcıyı
 * anlaşılır biçimde bilgilendirir (Güvenlik-9: sahte başarılı yanıt yok).
 * publicSdkKey, RevenueCat SDK'sının istemcide kullanılacak HERKESE AÇIK
 * anahtarıdır; gizli anahtar (secret) asla istemciye verilmez.
 */
export const billingConfigResponseSchema = z.object({
  provider: billingProviderSchema,
  configured: z.boolean(),
  revenuecat: z
    .object({
      /** RC "Apple API key" / "Google API key" (public SDK key). */
      publicSdkKey: z.string().min(1).nullable(),
    })
    .optional(),
  subscriptionProducts: z
    .array(
      z.object({
        planId: z.string().min(1),
        billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
        trialDays: z.number().int().min(0),
        productIds: storeProductIdsSchema,
      }),
    )
    .default([]),
  creditPackProducts: z
    .array(
      z.object({
        packId: z.string().min(1),
        productIds: storeProductIdsSchema,
      }),
    )
    .default([]),
});
export type BillingConfigResponse = z.infer<typeof billingConfigResponseSchema>;

/**
 * POST /billing/entitlements/sync gövdesi — mağaza/RC abonelik durumunu
 * sunucuyla eşitler (Geri Yükleme + durum eşitleme). appUserId gönderilmez;
 * kimlik access token'dan alınır.
 */
export const entitlementSyncRequestSchema = z.object({
  platform: platformSchema,
});
export type EntitlementSyncRequest = z.infer<typeof entitlementSyncRequestSchema>;

/** POST /billing/entitlements/sync yanıtı. */
export const entitlementSyncResponseSchema = z.object({
  syncedAt: z.string().min(1),
  subscription: z.object({
    status: z.enum(['NONE', 'TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'ON_HOLD', 'CANCELED', 'EXPIRED']),
    planId: z.string().nullable(),
    autoRenew: z.boolean(),
    currentPeriodEnd: z.string().nullable(),
    /** RC will_renew işareti — autoRenew ile aynı anlamlıdır. */
    willRenew: z.boolean(),
    /** RC period_type: deneme/kampanya dönemleri için. */
    periodType: z.enum(['NORMAL', 'TRIAL', 'INTRO']).nullable().optional(),
  }),
  wallet: z
    .object({
      purchased: z.number().int().min(0),
      granted: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .optional(),
});
export type EntitlementSyncResponse = z.infer<typeof entitlementSyncResponseSchema>;

/**
 * RevenueCat webhook zarfı (v1) — POST /billing/webhooks/revenuecat.
 * Kimlik doğrulama: Authorization: Bearer <REVENUECAT_WEBHOOK_AUTH_SECRET>
 * (Güvenlik-4). event.id UNIQUE ile çift olay SKIPPED olur (yeniden gönderim
 * güvenli). Sağlayıcı tarafından tüm olay tipleri için event.id benzersizdir.
 */
export const revenueCatWebhookSchema = z.object({
  api_version: z.string().min(1).optional(),
  event: z.object({
    type: z.string().min(1).max(120),
    id: z.string().min(1).max(200),
    app_user_id: z.string().max(200).nullable().optional(),
    /** Anonim RC kullanıcıları: alias ile gerçek kullanıcı bulunur. */
    original_app_user_id: z.string().min(1).max(200),
    product_id: z.string().max(200).nullable().optional(),
    transaction_id: z.string().max(200).nullable().optional(),
    original_transaction_id: z.string().max(200).nullable().optional(),
    expiration_at_ms: z.number().int().nullable().optional(),
    purchased_at_ms: z.number().int().nullable().optional(),
    environment: z.enum(['PRODUCTION', 'SANDBOX']).optional(),
    store: z.enum(['APP_STORE', 'PLAY_STORE', 'STRIPE', 'PROMOTIONAL', 'MAC_APPSTORE', 'RAZORPAY']).optional(),
    period_type: z.enum(['NORMAL', 'TRIAL', 'INTRO']).optional(),
    will_renew: z.boolean().nullable().optional(),
    cancel_reason: z.string().nullable().optional(),
    /** BILLING_ISSUE'da mevcutsa abonelik grace döneminde demektir. */
    grace_period_expiration_at_ms: z.number().int().nullable().optional(),
    /** TRANSFER olayında sahipliği devralan/alınan kullanıcılar. */
    transferred_from: z.array(z.string().max(200)).optional(),
    transferred_to: z.array(z.string().max(200)).optional(),
  }),
});
export type RevenueCatWebhook = z.infer<typeof revenueCatWebhookSchema>;
export type RevenueCatEvent = RevenueCatWebhook['event'];

/** RevenueCat olay tipleri — sunucunun işlediği küme (bilinmeyenler kayda geçer).
 * REFUND: RC varsayılan olarak iade webhook'u göndermez; iade sinyali
 * (Apple REFUND / Google voided purchase aktarımı veya ops olayı) genel zarfla
 * veya bu tipten gelebilir — sunucu ikisini de idempotent işler. */
export const REVENUECAT_EVENT_TYPES = [
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED',
  'REFUND',
  'REFUND_REVERSED',
  'TRANSFER',
  'TEST',
] as const;
export type RevenueCatEventType = (typeof REVENUECAT_EVENT_TYPES)[number];
