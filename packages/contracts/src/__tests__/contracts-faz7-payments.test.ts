/**
 * Faz 7 sözleşme testleri: ödeme sağlayıcı yapılandırma, mağaza ürün
 * kimlikleri, entitlement senkronu ve RevenueCat webhook zarfı.
 */
import { describe, expect, it } from 'vitest';
import {
  billingConfigResponseSchema,
  entitlementSyncRequestSchema,
  entitlementSyncResponseSchema,
  purchaseValidateSchema,
  revenueCatWebhookSchema,
  REVENUECAT_EVENT_TYPES,
} from '../payments';

describe('purchaseValidateSchema (Faz 7 appUserId)', () => {
  it('appUserId alanını kabul eder', () => {
    const parsed = purchaseValidateSchema.parse({
      platform: 'IOS',
      productType: 'SUBSCRIPTION',
      productId: 'perdego.sub.monthly',
      storeTransactionId: '2000000123456789',
      appUserId: 'user_123',
    });
    expect(parsed.appUserId).toBe('user_123');
  });

  it('appUserId opsiyoneldir (simülasyon sağlayıcı yolunı)', () => {
    const parsed = purchaseValidateSchema.parse({
      platform: 'ANDROID',
      productType: 'CREDIT_PACK',
      productId: 'perdego.pack.pack_10',
      storeTransactionId: 'GPA.1111-2222',
    });
    expect(parsed.appUserId).toBeUndefined();
  });
});

describe('billingConfigResponseSchema', () => {
  it('yapılandırılmış RevenueCat yapılandırmasını doğrular', () => {
    const config = billingConfigResponseSchema.parse({
      provider: 'revenuecat',
      configured: true,
      revenuecat: { publicSdkKey: 'appl_publickey123' },
      subscriptionProducts: [
        {
          planId: 'SUB_MONTHLY',
          billingPeriod: 'MONTHLY',
          trialDays: 7,
          productIds: { ios: 'perdego.sub.monthly', android: 'perdego.sub.monthly' },
        },
      ],
      creditPackProducts: [
        { packId: 'PACK_10', productIds: { ios: 'perdego.pack.pack_10', android: 'perdego.pack.pack_10' } },
      ],
    });
    expect(config.subscriptionProducts).toHaveLength(1);
    expect(config.creditPackProducts[0]?.productIds.ios).toBe('perdego.pack.pack_10');
  });

  it('yapılandırılmamış durum (provider=none) doğrulanır', () => {
    const config = billingConfigResponseSchema.parse({
      provider: 'none',
      configured: false,
    });
    expect(config.configured).toBe(false);
    expect(config.subscriptionProducts).toEqual([]);
    expect(config.creditPackProducts).toEqual([]);
  });

  it('gizli anahtar şemaya dahil değildir (publicSdkKey yeterli)', () => {
    // Şema yalnızca publicSdkKey bilir: secret alanı tanımayıp reddetmez ama
    // sözleşmede yeri yoktur — yanlışlıkla secret sızmasın diye alan seti dar.
    const keys = Object.keys(billingConfigResponseSchema.shape);
    expect(keys).not.toContain('secretApiKey');
  });
});

describe('entitlementSync sözleşmeleri', () => {
  it('senkron isteği platform zorunlu tutar', () => {
    expect(() => entitlementSyncRequestSchema.parse({})).toThrow();
    expect(entitlementSyncRequestSchema.parse({ platform: 'IOS' }).platform).toBe('IOS');
  });

  it('senkron yanıtı abonelik durumu + cüzdan taşır', () => {
    const response = entitlementSyncResponseSchema.parse({
      syncedAt: '2026-01-01T00:00:00.000Z',
      subscription: {
        status: 'ACTIVE',
        planId: 'SUB_MONTHLY',
        autoRenew: true,
        currentPeriodEnd: '2026-02-01T00:00:00.000Z',
        willRenew: true,
        periodType: 'NORMAL',
      },
      wallet: { purchased: 10, granted: 5, total: 15 },
    });
    expect(response.subscription.status).toBe('ACTIVE');
    expect(response.wallet?.total).toBe(15);
  });

  it('GRACE_PERIOD ve ON_HOLD durumları sözleşmede mevcuttur', () => {
    const response = entitlementSyncResponseSchema.parse({
      syncedAt: '2026-01-01T00:00:00.000Z',
      subscription: {
        status: 'GRACE_PERIOD',
        planId: null,
        autoRenew: true,
        currentPeriodEnd: null,
        willRenew: false,
      },
    });
    expect(response.subscription.status).toBe('GRACE_PERIOD');
  });
});

describe('revenueCatWebhookSchema', () => {
  const baseEvent = {
    type: 'INITIAL_PURCHASE',
    id: 'event-uuid-1',
    original_app_user_id: 'user_123',
  };

  it('temel INITIAL_PURCHASE olayını doğrular', () => {
    const webhook = revenueCatWebhookSchema.parse({
      api_version: '1.0',
      event: {
        ...baseEvent,
        app_user_id: 'user_123',
        product_id: 'perdego.sub.monthly',
        transaction_id: '2000000123456789',
        original_transaction_id: '2000000123456789',
        expiration_at_ms: 1735689600000,
        environment: 'SANDBOX',
        store: 'APP_STORE',
      },
    });
    expect(webhook.event.type).toBe('INITIAL_PURCHASE');
    expect(webhook.event.environment).toBe('SANDBOX');
  });

  it('TRANSFER olayının aktör listelerini taşır', () => {
    const webhook = revenueCatWebhookSchema.parse({
      event: {
        ...baseEvent,
        type: 'TRANSFER',
        transferred_from: ['anon-1', 'anon-2'],
        transferred_to: ['user_123'],
      },
    });
    expect(webhook.event.transferred_to).toEqual(['user_123']);
  });

  it('event.id olmadan reddeder (idempotensi anahtarı zorunlu)', () => {
    expect(() =>
      revenueCatWebhookSchema.parse({
        event: { type: 'RENEWAL', original_app_user_id: 'user_1' },
      }),
    ).toThrow();
  });

  it('environment bilinmeyen değer kabul etmez', () => {
    expect(() =>
      revenueCatWebhookSchema.parse({
        event: { ...baseEvent, environment: 'STAGING' },
      }),
    ).toThrow();
  });

  it('işlenen olay tipleri kümesi eksiksizdir', () => {
    for (const type of [
      'INITIAL_PURCHASE',
      'RENEWAL',
      'PRODUCT_CHANGE',
      'CANCELLATION',
      'UNCANCELLATION',
      'EXPIRATION',
      'BILLING_ISSUE',
      'TRANSFER',
      'TEST',
    ]) {
      expect(REVENUECAT_EVENT_TYPES).toContain(type);
    }
  });
});
