/**
 * RevenueCatProvider birim testleri — REST ters sorgu doğrulaması,
 * webhook Bearer kaynağı doğrulaması ve senkron durum çıkarımı.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevenueCatProvider } from './revenuecat.provider';
import type { Env } from '../../config/env.schema';

const baseEnv = {
  NODE_ENV: 'test',
  BILLING_PROVIDER: 'revenuecat',
  REVENUECAT_SECRET_API_KEY: 'sk_rc_secret_key_000000000001',
  REVENUECAT_WEBHOOK_AUTH_SECRET: 'rc_webhook_secret_00000000001',
  REVENUECAT_PUBLIC_SDK_KEY: 'appl_pubkey_0001',
  REVENUECAT_API_BASE_URL: 'https://api.revenuecat.test',
} as unknown as Env;

function makeProvider(envOverride: Partial<Env> = {}): RevenueCatProvider {
  return new RevenueCatProvider({ ...baseEnv, ...envOverride } as Env);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function subscriberPayload(overrides: Record<string, unknown> = {}) {
  return {
    subscriber: {
      first_seen: '2026-01-01T00:00:00Z',
      subscriptions: {
        'perdego.sub.monthly': {
          expires_date: new Date(Date.now() + 10 * 86400_000).toISOString(),
          purchase_date: '2026-10-01T00:00:00Z',
          auto_renew_status: true,
          period_type: 'normal',
          is_sandbox: true,
          store: 'APP_STORE',
        },
      },
      non_subscriptions: {
        'perdego.pack.pack_10': [
          {
            id: 'purchase-1',
            purchase_date: '2026-10-20T00:00:00Z',
            is_sandbox: true,
            store: 'PLAY_STORE',
            transaction_id: 'GPA.999',
          },
        ],
      },
      ...overrides,
    },
  };
}

describe('RevenueCatProvider — webhook kaynağı doğrulaması (Güvenlik-4)', () => {
  it('doğru Bearer sırrını kabul eder', () => {
    const provider = makeProvider();
    expect(provider.verifyWebhookSource({ authorization: 'Bearer rc_webhook_secret_00000000001' })).toBe(true);
  });

  it('yanlış sırrı reddeder', () => {
    const provider = makeProvider();
    expect(provider.verifyWebhookSource({ authorization: 'Bearer yalnis' })).toBe(false);
  });

  it('Bearer öneki yoksa reddeder', () => {
    const provider = makeProvider();
    expect(provider.verifyWebhookSource({ authorization: 'rc_webhook_secret_00000000001' })).toBe(false);
  });

  it('sır tanımsızsa üretimde reddeder, test ortamında kabul eder', () => {
    const provider = makeProvider({ REVENUECAT_WEBHOOK_AUTH_SECRET: undefined });
    expect(
      provider.verifyWebhookSource({ authorization: 'Bearer herhangi' }, ),
    ).toBe(true); // NODE_ENV=test
    const prod = makeProvider({ REVENUECAT_WEBHOOK_AUTH_SECRET: undefined, NODE_ENV: 'production' });
    expect(prod.verifyWebhookSource({ authorization: 'Bearer herhangi' })).toBe(false);
    expect(prod.verifyWebhookSource({})).toBe(false);
  });
});

describe('RevenueCatProvider — verifyPurchase (Güvenlik-1)', () => {
  it('abonelik ürününü subscriber yanıtıyla doğrular', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(subscriberPayload()), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = makeProvider();
    const verified = await provider.verifyPurchase({
      appUserId: 'u_1',
      platform: 'IOS',
      productType: 'SUBSCRIPTION',
      productId: 'perdego.sub.monthly',
      transactionId: '2000000123',
    });
    expect(verified).not.toBeNull();
    expect(verified?.productType).toBe('SUBSCRIPTION');
    expect(verified?.platform).toBe('IOS');
    expect(verified?.willRenew).toBe(true);
    // Ters sorgu gizli anahtarla ve doğru uçta yapılır.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.revenuecat.test/v1/subscribers/u_1');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk_rc_secret_key_000000000001',
    );
  });

  it('kredi paketi (non-subscription) işlem kimliğiyle doğrulanır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(subscriberPayload()), { status: 200 })),
    );
    const provider = makeProvider();
    const verified = await provider.verifyPurchase({
      appUserId: 'u_1',
      platform: 'ANDROID',
      productType: 'CREDIT_PACK',
      productId: 'perdego.pack.pack_10',
      transactionId: 'GPA.999',
    });
    expect(verified?.productType).toBe('CREDIT_PACK');
    expect(verified?.storeTransactionId).toBe('GPA.999');
  });

  it('işlem kimliği eşleşmeyen kredi paketi reddedilir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(subscriberPayload()), { status: 200 })),
    );
    const provider = makeProvider();
    const verified = await provider.verifyPurchase({
      appUserId: 'u_1',
      platform: 'ANDROID',
      productType: 'CREDIT_PACK',
      productId: 'perdego.pack.pack_10',
      transactionId: 'GPA.DIFFERENT',
    });
    expect(verified).toBeNull();
  });

  it('süresi dolmuş abonelik doğrulamaz', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify(
            subscriberPayload({
              subscriptions: {
                'perdego.sub.monthly': {
                  expires_date: new Date(Date.now() - 86400_000).toISOString(),
                  auto_renew_status: false,
                  is_sandbox: true,
                },
              },
            }),
          ),
          { status: 200 },
        ),
      ),
    );
    const provider = makeProvider();
    const verified = await provider.verifyPurchase({
      appUserId: 'u_1',
      platform: 'IOS',
      productType: 'SUBSCRIPTION',
      productId: 'perdego.sub.monthly',
    });
    expect(verified).toBeNull();
  });

  it('bilinmeyen app_user_id (404) null döner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"not found"}', { status: 404 })));
    const provider = makeProvider();
    const verified = await provider.verifyPurchase({
      appUserId: 'yok',
      platform: 'IOS',
      productType: 'SUBSCRIPTION',
      productId: 'perdego.sub.monthly',
    });
    expect(verified).toBeNull();
  });

  it('sağlayıcı HTTP 500 verince fail-closed hata döner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const provider = makeProvider();
    await expect(
      provider.verifyPurchase({
        appUserId: 'u_1',
        platform: 'IOS',
        productType: 'SUBSCRIPTION',
        productId: 'perdego.sub.monthly',
      }),
    ).rejects.toThrow('REVENUECAT_HTTP_500');
  });

  it('yapılandırılmamış sağlayıcıda doğrulama istisnası atar', async () => {
    const provider = makeProvider({ REVENUECAT_SECRET_API_KEY: undefined });
    await expect(
      provider.verifyPurchase({
        appUserId: 'u_1',
        platform: 'IOS',
        productType: 'SUBSCRIPTION',
        productId: 'perdego.sub.monthly',
      }),
    ).rejects.toThrow('yapılandırılmamış');
  });
});

describe('RevenueCatProvider — fetchSubscriberState (senkron/geri yükleme)', () => {
  it('abonelik + non-subscription durumunu çıkarır', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(subscriberPayload()), { status: 200 })),
    );
    const provider = makeProvider();
    const state = await provider.fetchSubscriberState('u_1');
    expect(state).not.toBeNull();
    expect(state?.subscriptions).toHaveLength(1);
    expect(state?.subscriptions[0]?.productId).toBe('perdego.sub.monthly');
    expect(state?.subscriptions[0]?.willRenew).toBe(true);
    expect(state?.nonSubscriptions[0]?.transactionId).toBe('GPA.999');
  });

  it('bilinmeyen kullanıcı için null döner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const provider = makeProvider();
    expect(await provider.fetchSubscriberState('yok')).toBeNull();
  });
});
