/**
 * Abonelik, kredi ve cüzdan alanı sözleşmeleri (Faz 3 UI + sonraki fazlarda
 * gerçek ödeme hizmeti). Tutarlar TRY kuruşsuz tam sayı değildir; fiyat alanı
 * kuruş cinsinden taşıınır (örn. 4990 = ₺49,90) ve görüntüleme istemcide
 * biçimlendirilir. Ödeme işlemleri bu sözleşmelerle Faz 5'te sunucuya bağlanır.
 */
import { z } from 'zod';

/** Abonelik planı. */
export const subscriptionPlanSchema = z.object({
  id: z.string().min(1),
  /** Görüntüleme adı (sunucu yerelleştirilmiş döner; mock'ta TR). */
  name: z.string().min(1),
  /** Aylık | Yillik benzeri görüntüleme dönem etiketi istemcidedir. */
  billingPeriod: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  /** Kuruş cinsinden fiyat (4990 = ₺49,90). */
  priceKurus: z.number().int().min(0),
  /** Yıllık/3 aylık planda aylık eşdeğer (kuruş). */
  monthlyEquivalentKurus: z.number().int().min(0).optional(),
  currency: z.literal('TRY'),
  trialDays: z.number().int().min(0).default(0),
  isBestValue: z.boolean().default(false),
  benefits: z.array(z.string().min(1)).default([]),
});
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;

export const plansResponseSchema = z.object({
  plans: z.array(subscriptionPlanSchema).min(1),
});
export type PlansResponse = z.infer<typeof plansResponseSchema>;

/** Cüzdan bakiyesi. Sunucu tarafında purchased/granted ayrımı tutulur (ERD). */
export const walletSchema = z.object({
  userId: z.string().min(1),
  creditBalance: z.number().int().min(0),
  purchasedCredits: z.number().int().min(0),
  grantedCredits: z.number().int().min(0),
  /** Mock'ta statik metin; gerçek API'de ISO-8601. */
  subscriptionStatus: z.enum(['NONE', 'TRIALING', 'ACTIVE', 'EXPIRED']),
  subscriptionRenewsAt: z.string().nullable().optional(),
});
export type Wallet = z.infer<typeof walletSchema>;

export const walletResponseSchema = z.object({
  wallet: walletSchema,
});
export type WalletResponse = z.infer<typeof walletResponseSchema>;

/** Kredi paketi. */
export const creditPackSchema = z.object({
  id: z.string().min(1),
  credits: z.number().int().min(1),
  priceKurus: z.number().int().min(0),
  currency: z.literal('TRY'),
  /** "En çok tercihilen" gibi vurgu. */
  isBestValue: z.boolean().default(false),
  /** Kuruş cinsinden paket başına fiyat yerine indirim oranı görüntüsü. */
  bonusCredits: z.number().int().min(0).default(0),
});
export type CreditPack = z.infer<typeof creditPackSchema>;

export const creditPacksResponseSchema = z.object({
  packs: z.array(creditPackSchema).min(1),
});
export type CreditPacksResponse = z.infer<typeof creditPacksResponseSchema>;

/** Cüzdan hareketi (mock görüntüleme; gerçek tablo credit_ledger'dır). */
export const walletTransactionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['CREDIT_PURCHASE', 'EPISODE_UNLOCK', 'GRANT', 'REFUND', 'ADJUSTMENT', 'EXPIRY']),
  amount: z.number().int(),
  balanceAfter: z.number().int().min(0),
  createdAt: z.string().min(1),
  /** Görüntüleme açıklaması (yerelleştirilmiş). */
  label: z.string().min(1),
});
export type WalletTransaction = z.infer<typeof walletTransactionSchema>;

export const walletTransactionsResponseSchema = z.object({
  items: z.array(walletTransactionSchema).default([]),
});
export type WalletTransactionsResponse = z.infer<
  typeof walletTransactionsResponseSchema
>;
