/**
 * Simüle edilmiş ödeme sağlayıcısı (Faz 7) — yalnızca geliştirme/test.
 *
 * Dürüstlük kuralları:
 *  - PRODUCTION'da SATIN ALMA DOĞRULAMASI YAPMAZ (Güvenlik-9): verifyPurchase
 *    çağrısı ProductionBillingError fırlatır; sağlayıcı seçimi zaten env
 *    doğrulamasıyla sınırlıdır. Webhook kaynağı HMAC genel zarfla doğrulanır
 *    (eski /billing/webhooks akışı) — bu adapter yalnızca device-claim
 *    doğrulamasının simülasyonudur.
 *  - Her doğrulama SANDBOX ortam etiketi taşır; üretimde bu etikete sahip
 *    doğrulanmış satın alma işlenmez (fail-closed).
 *  - Satın alma beyanı loglanır (geliştirmede izlenebilirlik).
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/env.module';
import type { Env } from '../../config/env.schema';
import type {
  BillingProviderPort,
  ProviderSubscriberState,
  VerifiedStorePurchase,
  VerifyEntitlementArgs,
} from './billing-provider.port';

@Injectable()
export class SimulatedBillingProvider implements BillingProviderPort {
  private readonly logger = new Logger(SimulatedBillingProvider.name);
  readonly kind = 'simulated' as const;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured(): boolean {
    // Yapılandırma gerektirmez; ancak üretimde ASLA yapılandırılmış sayılmaz.
    return this.env.NODE_ENV !== 'production';
  }

  async verifyPurchase(args: VerifyEntitlementArgs): Promise<VerifiedStorePurchase | null> {
    if (this.env.NODE_ENV === 'production') {
      // Savunma katmanı 2 (env şeması birinci katman).
      throw new Error('SimulatedBillingProvider üretimde kullanılamaz');
    }
    this.logger.warn(
      `[DEV] Satın alma istemci beyanıyla doğrulandı: ${args.productType}/${args.productId} tx=${args.transactionId ?? 'yok'}`,
    );
    return {
      productId: args.productId,
      productType: args.productType,
      platform: args.platform,
      storeTransactionId: args.transactionId ?? `sim:${args.appUserId}:${args.productId}`,
      storeOriginalTransactionId: args.transactionId,
      expiresAt: args.productType === 'SUBSCRIPTION' ? new Date(Date.now() + 30 * 86400_000) : null,
      willRenew: args.productType === 'SUBSCRIPTION',
      periodType: 'NORMAL',
      environment: 'SANDBOX',
    };
  }

  /**
   * Simüle sağlayıcıda senkron: kalıcı sağlayıcı yoktur — boş durum döner
   * (eşitleme hiçbir şeyi değiştirmez). Üretimde çağrılamaz.
   */
  async fetchSubscriberState(): Promise<ProviderSubscriberState | null> {
    if (this.env.NODE_ENV === 'production') {
      throw new Error('SimulatedBillingProvider üretimde kullanılamaz');
    }
    return { environment: 'SANDBOX', subscriptions: [], nonSubscriptions: [] };
  }

  /**
   * Simüle sağlayıcıda webhook kaynağı doğrulaması genel HMAC zarfıyla
   * (X-PerdeGo-Signature) BillingService.verifySignature içinde yapılır;
   * bu adapter RC Bearer sırrını bilmez → her zaman false.
   */
  verifyWebhookSource(): boolean {
    return false;
  }
}
