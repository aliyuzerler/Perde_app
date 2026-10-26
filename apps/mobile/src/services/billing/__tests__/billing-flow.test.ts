/**
 * Faz 7 mobil testleri: RC SDK adaptörü ve satın alma akışı.
 *
 * Kritik akış testleri (Güvenlik-1): mağaza sonucu asla tek başına kabul
 * edilmez — validate başarısızsa akış hak vermez ve hata döner.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { PurchasesPort, StorePackage } from '../../billing/purchases-port';
import { createBillingFlow } from '../../billing/billing-flow';
import { extractTransactionId } from '../../billing/purchases-service';

// react-native-purchases yerel modül jest'te yoktur; purchases-service
// loadSdk() null döner → supported=false (web/jest davranışı).

function makePackage(overrides: Partial<StorePackage> = {}): StorePackage {
  return {
    packageIdentifier: '$rc_monthly',
    offeringIdentifier: 'default',
    productId: 'perdego.sub.sub_monthly',
    storePriceText: '₺49,90',
    currencyCode: 'TRY',
    introPriceText: null,
    productType: 'SUBSCRIPTION',
    ...overrides,
  };
}

function makePurchasesPort(overrides: Partial<PurchasesPort> = {}): PurchasesPort {
  return {
    supported: true,
    isConfigured: jest.fn(() => true),
    configure: jest.fn(async () => undefined),
    getOfferings: jest.fn(async () => [
      { identifier: 'default', isCurrent: true, packages: [makePackage()] },
    ]),
    purchasePackage: jest.fn(async () => ({
      productId: 'perdego.sub.sub_monthly',
      transactionId: 'store_tx_1',
    })),
    restorePurchases: jest.fn(async () => []),
    syncSubscriber: jest.fn(async () => undefined),
    ...overrides,
  };
}

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    getBillingConfig: jest.fn(async () => ({
      provider: 'revenuecat',
      configured: true,
      revenuecat: { publicSdkKey: 'appl_pubkey_test' },
      subscriptionProducts: [],
      creditPackProducts: [],
    })),
    validatePurchase: jest.fn(async () => ({
      storeTransactionId: 'store_tx_1',
      alreadyProcessed: false,
      productType: 'SUBSCRIPTION',
      subscription: { status: 'ACTIVE', currentPeriodEnd: '2026-12-01T00:00:00.000Z' },
    })),
    syncEntitlements: jest.fn(async () => ({
      syncedAt: '2026-01-01T00:00:00.000Z',
      subscription: {
        status: 'ACTIVE',
        planId: 'SUB_MONTHLY',
        autoRenew: true,
        currentPeriodEnd: '2026-12-01T00:00:00.000Z',
        willRenew: true,
      },
    })),
    ...overrides,
  } as unknown as Parameters<typeof createBillingFlow>[0]['api'];
}

describe('billing-flow — satın alma + sunucu doğrulaması (Güvenlik-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mağaza satın alması sunucu doğrulamasına gönderilir (Idempotency-Key ile)', async () => {
    const purchases = makePurchasesPort();
    const api = makeApi();
    const flow = createBillingFlow({
      api: api as never,
      purchases,
      newIdempotencyKey: () => 'fixed-idem-key-1',
    });
    const result = await flow.purchaseAndValidate({
      pkg: makePackage(),
      appUserId: 'u_1',
      productType: 'SUBSCRIPTION',
    });
    expect(result.validation.subscription?.status).toBe('ACTIVE');
    expect(api.validatePurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        productType: 'SUBSCRIPTION',
        productId: 'perdego.sub.sub_monthly',
        storeTransactionId: 'store_tx_1',
        appUserId: 'u_1',
        idempotencyKey: 'fixed-idem-key-1',
      }),
    );
  });

  it('yapılandırılmamış ödemede satın alma BAŞLATILMAZ (NOT_CONFIGURED)', async () => {
    const purchases = makePurchasesPort();
    const api = makeApi({
      getBillingConfig: jest.fn(async () => ({
        provider: 'none',
        configured: false,
        subscriptionProducts: [],
        creditPackProducts: [],
      })),
    });
    const flow = createBillingFlow({ api: api as never, purchases });
    await expect(
      flow.purchaseAndValidate({ pkg: makePackage(), appUserId: 'u_1', productType: 'SUBSCRIPTION' }),
    ).rejects.toMatchObject({ reason: 'NOT_CONFIGURED' });
    // Mağaza SDK'sına hiç dokunulmadı.
    expect(purchases.purchasePackage).not.toHaveBeenCalled();
  });

  it('desteklenmeyen cihazda (web/jest) satın alma başlatılmaz (UNSUPPORTED_DEVICE)', async () => {
    const purchases = makePurchasesPort({ supported: false });
    const api = makeApi();
    const flow = createBillingFlow({ api: api as never, purchases });
    await expect(
      flow.purchaseAndValidate({ pkg: makePackage(), appUserId: 'u_1', productType: 'SUBSCRIPTION' }),
    ).rejects.toMatchObject({ reason: 'UNSUPPORTED_DEVICE' });
    expect(purchases.purchasePackage).not.toHaveBeenCalled();
  });

  it('mağaza sonucu var ama sunucu doğrulaması reddedilirse hak VERİLMEZ', async () => {
    const purchases = makePurchasesPort();
    const api = makeApi({
      validatePurchase: jest.fn(async () => {
        throw Object.assign(new Error('PURCHASE_VERIFICATION_FAILED'), { reason: 'PURCHASE_VERIFICATION_FAILED' });
      }),
    });
    const flow = createBillingFlow({ api: api as never, purchases });
    await expect(
      flow.purchaseAndValidate({ pkg: makePackage(), appUserId: 'u_1', productType: 'SUBSCRIPTION' }),
    ).rejects.toMatchObject({ reason: 'VALIDATION_FAILED' });
  });

  it('ürün offerings arasında yoksa dürüst STORE_FAILED hatası verir', async () => {
    const flow = createBillingFlow({ api: makeApi() as never, purchases: makePurchasesPort() });
    await expect(
      flow.purchaseAndValidate({ pkg: null, appUserId: 'u_1', productType: 'CREDIT_PACK' }),
    ).rejects.toMatchObject({ reason: 'STORE_FAILED' });
  });

  it('SDK yapılandırılmamışsa configure çağrılır (public anahtarla)', async () => {
    const purchases = makePurchasesPort({ isConfigured: jest.fn(() => false) });
    const api = makeApi();
    const flow = createBillingFlow({ api: api as never, purchases });
    await flow.purchaseAndValidate({
      pkg: makePackage(),
      appUserId: 'u_1',
      productType: 'SUBSCRIPTION',
    });
    expect(purchases.configure).toHaveBeenCalledWith({
      publicSdkKey: 'appl_pubkey_test',
      appUserId: 'u_1',
    });
  });

  it('restoreAndSync mağaza geri yüklemeyi + sunucu senkronunu zincirler', async () => {
    const purchases = makePurchasesPort({
      restorePurchases: jest.fn(async () => [
        { productId: 'perdego.pack.pack_60', transactionId: 'store_tx_2' },
      ]),
    });
    const api = makeApi();
    const flow = createBillingFlow({ api: api as never, purchases });
    const result = await flow.restoreAndSync({ platform: 'IOS', appUserId: 'u_1' });
    expect(result.restored).toHaveLength(1);
    expect(result.sync.subscription.status).toBe('ACTIVE');
    expect(api.syncEntitlements).toHaveBeenCalledWith({ platform: 'IOS' });
  });

  it('resolveBillingState durum makinesi: unconfigured → unsupported-device → ready', async () => {
    const noneFlow = createBillingFlow({
      api: makeApi({
        getBillingConfig: jest.fn(async () => ({
          provider: 'none',
          configured: false,
          subscriptionProducts: [],
          creditPackProducts: [],
        })),
      }),
      purchases: makePurchasesPort({ supported: false }),
    });
    expect((await noneFlow.resolveBillingState()).state).toBe('unconfigured');

    const webFlow = createBillingFlow({
      api: makeApi(),
      purchases: makePurchasesPort({ supported: false }),
    });
    expect((await webFlow.resolveBillingState()).state).toBe('unsupported-device');

    const readyFlow = createBillingFlow({
      api: makeApi(),
      purchases: makePurchasesPort(),
    });
    expect((await readyFlow.resolveBillingState()).state).toBe('ready');
  });
});

describe('purchases-service — savunmacı yardımcılar', () => {
  it('extractTransactionId alan varyasyonlarını işler', () => {
    expect(extractTransactionId({ transactionIdentifier: 'tx_a' })).toBe('tx_a');
    expect(extractTransactionId({ transactionId: 'tx_b' })).toBe('tx_b');
    expect(
      extractTransactionId({ customerInfo: { newestTransactionId: 'tx_c' } }),
    ).toBe('tx_c');
    expect(extractTransactionId({})).toBeNull();
  });
});
