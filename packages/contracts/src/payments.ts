/**
 * Ödeme doğrulama ve webhook sözleşmeleri (Faz 2b; gerçek mağaza entegrasyonu
 * Faz 5'te RevenueCat ile devreye girer — sunucu doğrulama arayüzü hazırdır).
 */
import { z } from 'zod';
import { pageMetaSchema } from './common';

export const platformSchema = z.enum(['IOS', 'ANDROID']);
export const productTypeSchema = z.enum(['SUBSCRIPTION', 'CREDIT_PACK']);

/**
 * POST /api/v1/billing/purchases/validate gövdesi.
 * storeTransactionId: mağazadan alınan dış satın alma kimliği — aynı kimlik
 * ikinci kez işlenemez (UNIQUE(platform, store_transaction_id)).
 */
export const purchaseValidateSchema = z.object({
  platform: platformSchema,
  productType: productTypeSchema,
  productId: z.string().min(1).max(120),
  storeTransactionId: z.string().min(1).max(200),
  storeOriginalTransactionId: z.string().min(1).max(200).optional(),
  /** Mağazadan doğrulanan fiyat (kuruş). */
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
