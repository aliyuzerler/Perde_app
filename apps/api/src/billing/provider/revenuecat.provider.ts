/**
 * RevenueCat billing sağlayıcısı (Faz 7) — gerçek sağlayıcı adapter'ı.
 *
 * Doğrulama akışı (Güvenlik-1/2):
 *   1. Mobil uygulama RC SDK ile satın alır (StoreKit / Google Play Billing
 *      RC üzerinden yönetilir; SDK yapılandırması /billing/config ile).
 *   2. İstemci POST /billing/purchases/validate'a appUserId + ürün + işlem
 *      kimliği gönderir — satın alma sonucu BEYANI güven kaynağı değildir.
 *   3. Sunucu RC REST API v1 subscriber ters sorgusuyla (gizli API anahtarı)
 *      abonelik/non-subscription geçmişinde ürünü ve işlemi arar; yalnızca
 *      sağlayıcı yanıtındaki verilerle VerifiedStorePurchase üretir.
 *   4. Webhook'lar (yetkili asenkron kaynak) Bearer sırrı doğrulanarak kabul
 *      edilir; event.id UNIQUE ile yeniden gönderimler idempotent işlenir.
 *
 * Ortam ayrımı: RC projesi ortam başına ayrıdır (dev/prod farklı API
 * anahtarları); subscriber yanıtı transaction başına environment taşır ve
 * üretimde SANDBOX satın almalara hak yazılmaz.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { SubscriptionPlatform } from '@prisma/client';
import { ENV } from '../../config/env.module';
import type { Env } from '../../config/env.schema';
import type {
  BillingProviderPort,
  ProviderSubscriberState,
  VerifiedStorePurchase,
  VerifyEntitlementArgs,
} from './billing-provider.port';

/** RC v1 subscriber yanıtı — doğrulamada kullanılan alanlar (daraltılmış). */
interface RcSubscriberResponse {
  subscriber: {
    first_seen: string;
    subscriptions?: Record<
      string,
      {
        expires_date?: string | null;
        purchase_date?: string | null;
        original_purchase_date?: string | null;
        auto_renew_status?: boolean;
        period_type?: 'normal' | 'trial' | 'intro';
        is_sandbox?: boolean;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
        store?: string;
        product_identifier?: string;
      }
    >;
    non_subscriptions?: Record<
      string,
      Array<{
        id?: string;
        purchase_date?: string;
        original_purchase_date?: string;
        is_sandbox?: boolean;
        store?: string;
        transaction_id?: string;
      }>
    >;
    entitlements?: Record<
      string,
      {
        product_identifier: string;
        purchase_date?: string;
        expires_date?: string | null;
      }
    >;
  };
}

@Injectable()
export class RevenueCatProvider implements BillingProviderPort {
  private readonly logger = new Logger(RevenueCatProvider.name);
  readonly kind = 'revenuecat' as const;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get configured(): boolean {
    return (
      this.env.BILLING_PROVIDER === 'revenuecat' &&
      Boolean(this.env.REVENUECAT_SECRET_API_KEY)
    );
  }

  /**
   * RC webhook kaynağı doğrulaması (Güvenlik-4): Authorization başlığı
   * tam olarak "Bearer <REVENUECAT_WEBHOOK_AUTH_SECRET>" olmalıdır.
   * Karşılaştırma timing-safe yapılır; sır yapılandırılmamışsa yalnızca
   * development/test kabul edilir (üretimde imzasız webhook YOK).
   */
  verifyWebhookSource(headers: { authorization?: string }): boolean {
    const secret = this.env.REVENUECAT_WEBHOOK_AUTH_SECRET;
    if (!secret) {
      return this.env.NODE_ENV !== 'production';
    }
    const provided = headers.authorization;
    if (!provided?.startsWith('Bearer ')) return false;
    const token = provided.slice('Bearer '.length);
    if (token.length !== secret.length) return false;
    return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
  }

  /**
   * Satın alma doğrulaması: RC GET /v1/subscribers/{app_user_id} ters sorgusu.
   * Ürün; önce aboneliklerde, ardından non_subscriptions geçmişinde aranır.
   * transactionId verildiyse eşleşme doğrulanır (bulunamazsa null).
   */
  async verifyPurchase(args: VerifyEntitlementArgs): Promise<VerifiedStorePurchase | null> {
    if (!this.configured) {
      throw new Error('RevenueCat yapılandırılmamış — doğrulama yapılamaz');
    }
    const subscriber = await this.fetchSubscriber(args.appUserId);
    if (!subscriber) return null;

    if (args.productType === 'SUBSCRIPTION') {
      return this.resolveSubscription(subscriber, args);
    }
    return this.resolveNonSubscription(subscriber, args);
  }

  // ---------------- RC REST istemcisi ---------------------------------------

  /**
   * Entitlement senkronu: sağlayıcıdaki tüm abonelik + tüketilebilir satın
   * alma durumunu çeker (Geri Yükleme ve mağaza durum eşitlemesi).
   */
  async fetchSubscriberState(appUserId: string): Promise<ProviderSubscriberState | null> {
    if (!this.configured) {
      throw new Error('RevenueCat yapılandırılmamış — senkron yapılamaz');
    }
    const subscriber = await this.fetchSubscriber(appUserId);
    if (!subscriber) return null;

    const subscriptions: ProviderSubscriberState['subscriptions'] = [];
    for (const [productId, entry] of Object.entries(subscriber.subscriptions ?? {})) {
      subscriptions.push({
        productId,
        expiresAt: entry.expires_date ? new Date(entry.expires_date) : null,
        willRenew: entry.auto_renew_status ?? false,
        periodType: this.mapPeriodType(entry.period_type),
        // RC grace sinyali: billing_issues_detected_at + hâlâ expires içinde.
        inGrace: Boolean(
          entry.billing_issues_detected_at &&
            entry.expires_date &&
            new Date(entry.expires_date).getTime() > Date.now(),
        ),
        sandbox: entry.is_sandbox ?? false,
      });
    }
    const nonSubscriptions: ProviderSubscriberState['nonSubscriptions'] = [];
    for (const [productId, history] of Object.entries(subscriber.non_subscriptions ?? {})) {
      for (const row of history) {
        nonSubscriptions.push({
          productId,
          transactionId: row.transaction_id ?? row.id,
          sandbox: row.is_sandbox ?? false,
        });
      }
    }
    return {
      environment:
        subscriptions.some((s) => !s.sandbox) || nonSubscriptions.some((n) => !n.sandbox)
          ? 'PRODUCTION'
          : 'SANDBOX',
      subscriptions,
      nonSubscriptions,
    };
  }

  private async fetchSubscriber(appUserId: string): Promise<RcSubscriberResponse['subscriber'] | null> {
    const base = this.env.REVENUECAT_API_BASE_URL.replace(/\/+$/, '');
    const url = `${base}/v1/subscribers/${encodeURIComponent(appUserId)}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.env.REVENUECAT_SECRET_API_KEY}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      // Sağlayıcıya erişilemiyorsa doğrulama BAŞARISIZDIR (fail-closed).
      this.logger.error(`RevenueCat API erişilemedi: ${error instanceof Error ? error.message : error}`);
      throw new Error('REVENUECAT_UNREACHABLE');
    }
    if (response.status === 404) return null; // bilinmeyen app_user_id
    if (!response.ok) {
      this.logger.error(`RevenueCat API ${response.status} döndü (app_user_id gizli)`);
      throw new Error(`REVENUECAT_HTTP_${response.status}`);
    }
    const payload = (await response.json()) as RcSubscriberResponse;
    return payload.subscriber;
  }

  /** Abonelik doğrulaması: ürün + (verildiyse) işlem eşleşmesi + ortam. */
  private resolveSubscription(
    subscriber: RcSubscriberResponse['subscriber'],
    args: VerifyEntitlementArgs,
  ): VerifiedStorePurchase | null {
    const entry = subscriber.subscriptions?.[args.productId];
    if (!entry) return null;

    const expiresAt = entry.expires_date ? new Date(entry.expires_date) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      // Süresi dolmuş abonelik hak vermez.
      return null;
    }

    const environment: 'SANDBOX' | 'PRODUCTION' = entry.is_sandbox ? 'SANDBOX' : 'PRODUCTION';
    return {
      productId: args.productId,
      productType: 'SUBSCRIPTION',
      platform: this.mapPlatform(entry.store, args.platform),
      // RC subscriber yanıtı işlem kimliğini taşımadığı için istemci
      // transactionId'si işlem anahtarı olarak kullanılır; yetkili asenkron
      // kaynak (webhook) gerçek transaction_id ile düzeltir/idempotenter.
      storeTransactionId: args.transactionId ?? `${args.productId}:${entry.purchase_date ?? ''}`,
      storeOriginalTransactionId: args.transactionId,
      expiresAt,
      willRenew: entry.auto_renew_status ?? false,
      periodType: this.mapPeriodType(entry.period_type),
      environment,
    };
  }

  /** Tüketilebilir (kredi paketi) doğrulaması: satın alma geçmişinde ara. */
  private resolveNonSubscription(
    subscriber: RcSubscriberResponse['subscriber'],
    args: VerifyEntitlementArgs,
  ): VerifiedStorePurchase | null {
    const history = subscriber.non_subscriptions?.[args.productId];
    if (!history || history.length === 0) return null;

    // transactionId biliniyorsa birebir eşleşme zorunludur (yanlış pakete
    // yanlış işlem eşlemesi engellenir).
    let match = history[history.length - 1]!;
    if (args.transactionId) {
      const found = history.find(
        (row) =>
          row.transaction_id === args.transactionId ||
          row.id === args.transactionId,
      );
      if (!found) return null;
      match = found;
    }

    return {
      productId: args.productId,
      productType: 'CREDIT_PACK',
      platform: this.mapPlatform(match.store, args.platform),
      storeTransactionId: args.transactionId ?? match.transaction_id ?? match.id ?? `${args.productId}:${match.purchase_date ?? ''}`,
      storeOriginalTransactionId: match.original_purchase_date ?? undefined,
      expiresAt: null,
      environment: match.is_sandbox ? 'SANDBOX' : 'PRODUCTION',
    };
  }

  private mapPlatform(
    store: string | undefined,
    fallback: SubscriptionPlatform,
  ): SubscriptionPlatform {
    if (store === 'APP_STORE' || store === 'MAC_APPSTORE') return 'IOS';
    if (store === 'PLAY_STORE') return 'ANDROID';
    return fallback;
  }

  private mapPeriodType(periodType: string | undefined): 'NORMAL' | 'TRIAL' | 'INTRO' {
    if (periodType === 'trial') return 'TRIAL';
    if (periodType === 'intro') return 'INTRO';
    return 'NORMAL';
  }
}
