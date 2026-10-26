/**
 * BillingProvider portu (Faz 7) — ödeme sağlayıcısı soyutlaması.
 *
 * ARCHITECTURE §: Medya sağlayıcı gibi ödeme sağlayıcısı da portun ardına
 * gizlenir; sağlayıcı (RevenueCat) topluca değiştirilebilir. İki uygulama:
 *
 *   revenuecat → gerçek sağlayıcı. Satın alma doğrulaması RC REST API ters
 *                sorgusuyla yapılır (Güvenlik-1: istemci beyanına güvenilmez),
 *                webhook'lar Bearer sırrı doğrulanarak kabul edilir.
 *   simulated  → geliştirme/test adapter'ı. Yalnızca NODE_ENV != production;
 *                istemci beyanını SANDBOX ortamı etiketiyle kabul eder ve her
 *                yanıtta bunu loglar (Güvenlik-9: üretimde sahte başarı yok).
 *
 * Ürün → iç kimlik çözümlemesi DB'dedir (plans.platform_product_id_*,
 * credit_packs.platform_product_id_*) ve ortam başına ayrık veritabanı
 * satırlarıyla yönetilir (ortamlar arası ürün ayrıştırma).
 */
import type { SubscriptionPlatform } from '@prisma/client';

/** Sağlayıcının doğruladığı mağaza satın alması. */
export interface VerifiedStorePurchase {
  /** Mağaza ürün kimliği (RC product_id). */
  productId: string;
  productType: 'SUBSCRIPTION' | 'CREDIT_PACK';
  platform: SubscriptionPlatform;
  storeTransactionId: string;
  storeOriginalTransactionId?: string;
  /** RC expiration_at_ms — abonelikse dönem bitişi; paketse null. */
  expiresAt?: Date | null;
  willRenew?: boolean;
  /** RC period_type — deneme/kampanya dönemleri. */
  periodType?: 'NORMAL' | 'TRIAL' | 'INTRO';
  /** Doğrulama ortamı — üretimde SANDBOX satın almalara kredi/abonelik yazılmaz. */
  environment: 'SANDBOX' | 'PRODUCTION';
}

export interface VerifyEntitlementArgs {
  /** RC app_user_id (PerdeGo kullanıcı kimliği). */
  appUserId: string;
  platform: SubscriptionPlatform;
  productType: 'SUBSCRIPTION' | 'CREDIT_PACK';
  /** Mağaza ürün kimliği (RC offerings'ten gelir). */
  productId: string;
  /** İstemcinin bildirdiği işlem kimliği — doğrulamada bilgi amaçlı. */
  transactionId?: string;
}

/**
 * Sağlayıcı tarafındaki abonelik/cüzdan durumu (entitlement senkronu —
 * Geri Yükleme ve mağaza durum eşitlemesi için çekilir).
 */
export interface ProviderSubscriberState {
  environment: 'SANDBOX' | 'PRODUCTION';
  subscriptions: Array<{
    productId: string;
    expiresAt: Date | null;
    willRenew: boolean;
    periodType: 'NORMAL' | 'TRIAL' | 'INTRO';
    inGrace: boolean;
    sandbox: boolean;
  }>;
  nonSubscriptions: Array<{
    productId: string;
    transactionId?: string;
    sandbox: boolean;
  }>;
}

/**
 * Ödeme sağlayıcı portu. Uçlar yalnızca bu arayüzü bilir.
 */
export interface BillingProviderPort {
  readonly kind: 'revenuecat' | 'simulated';
  /** Yapılandırma tam mı? (yanlışsa satın alma uçları 503 döner.) */
  readonly configured: boolean;

  /**
   * Satın almayı sağlayıcı tarafında doğrular. Ürün/işlem bulunamazsa
   * null döner (çağıran taraf PURCHASE_VERIFICATION_FAILED hatası verir).
   */
  verifyPurchase(args: VerifyEntitlementArgs): Promise<VerifiedStorePurchase | null>;

  /**
   * Sağlayıcıdaki abonelik/kredi satın alma durumunu çeker (senkron).
   * Bilinmeyen app_user_id için null döner.
   */
  fetchSubscriberState(appUserId: string): Promise<ProviderSubscriberState | null>;

  /**
   * Sağlayıcı webhook isteğinin kaynağını doğrular (Güvenlik-4).
   * RevenueCat: Authorization: Bearer <webhook auth secret> (timing-safe).
   */
  verifyWebhookSource(headers: { authorization?: string }): boolean;
}

/** BillingProvider sağlayıcı enjeksiyon token'ı. */
export const BILLING_PROVIDER = Symbol('BILLING_PROVIDER');
