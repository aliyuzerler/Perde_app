/**
 * BillingService birim testleri (Faz 2b idempotensi + Faz 7 sağlayıcı akışı).
 */
import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import type { CreditsService } from '../credits/credits.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { PrismaService } from '../prisma/prisma.service';
import type {
  BillingProviderPort,
  VerifiedStorePurchase,
} from './provider/billing-provider.port';

const env = {
  NODE_ENV: 'test' as const,
  WEBHOOK_SIGNING_SECRET: 'test-secret-0123456789abcdef',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  PLAYBACK_TTL_SECONDS: 300,
  PLAYBACK_MAX_PARALLEL: 2,
  IDEMPOTENCY_TTL_HOURS: 24,
  DATABASE_URL: 'postgresql://test',
  BILLING_PROVIDER: 'none' as const,
  REVENUECAT_API_BASE_URL: 'https://api.revenuecat.com',
};

/** Sağlayıcı seçimi: 'none' → yapılandırılmamış, aksi halde mock sağlayıcı. */
function makeProvider(overrides: Partial<BillingProviderPort> = {}, configured = true): BillingProviderPort {
  return {
    kind: 'revenuecat',
    configured,
    verifyPurchase: vi.fn(async () => null),
    fetchSubscriberState: vi.fn(async () => null),
    verifyWebhookSource: vi.fn(() => true),
    ...overrides,
  };
}

function makeService(
  prisma: unknown,
  provider: BillingProviderPort = makeProvider(undefined, false),
  envOverride: Record<string, unknown> = {},
): BillingService {
  return new BillingService(
    prisma as PrismaService,
    { purchasePack: vi.fn(), appendLedgerAndRecompute: vi.fn() } as unknown as CreditsService,
    {
      activateFromPurchase: vi.fn(async () => ({
        storeTransactionId: 'tx',
        alreadyProcessed: false,
        status: 'ACTIVE',
        currentPeriodEnd: null,
      })),
      findPlanByProductId: vi.fn(async () => null),
      cancelAtPeriodEnd: vi.fn(async () => 1),
      resumeAutoRenew: vi.fn(async () => 1),
      markExpired: vi.fn(async () => 1),
      markBillingIssue: vi.fn(async () => 'GRACE_PERIOD' as const),
      markPaused: vi.fn(async () => 1),
      markResumed: vi.fn(async () => 1),
    } as unknown as SubscriptionsService,
    { ...env, ...envOverride } as never,
    provider,
  );
}

describe('BillingService.verifySignature (HMAC-SHA256)', () => {
  it('doğru imzayı kabul eder', () => {
    const svc = makeService({});
    const body = JSON.stringify({ source: 'REVENUECAT', eventId: 'e1' });
    const signature = createHmac('sha256', env.WEBHOOK_SIGNING_SECRET).update(body).digest('hex');
    expect(svc.verifySignature(body, `sha256=${signature}`)).toBe(true);
  });

  it('bozuk imzayı reddeder', () => {
    const svc = makeService({});
    expect(svc.verifySignature('{"a":1}', 'sha256=deadbeef')).toBe(false);
  });

  it('imza başlığı yoksa reddeder', () => {
    const svc = makeService({});
    expect(svc.verifySignature('{"a":1}', undefined)).toBe(false);
  });

  it('timingSafeEqual uzunluk farkında patlamadan false döner', () => {
    const svc = makeService({});
    expect(svc.verifySignature('{}', 'sha256=abc')).toBe(false);
  });
});

describe('BillingService.ingestWebhook — idempotensi (Kural 7)', () => {
  const validPayload = {
    userId: 'u_1',
    userEmail: 'viewer@perdego.dev',
    productId: 'PACK_10',
    platform: 'IOS',
    storeTransactionId: 'tx_1',
  };

  it('aynı (source, eventId) ikinci kez gelirse SKIPPED döner', async () => {
    let createCount = 0;
    const prisma = {
      user: { findFirst: vi.fn(async () => ({ id: 'u_1' })), findUnique: vi.fn(async () => ({ id: 'u_1' })) },
      webhookEvent: {
        create: vi.fn(async () => {
          createCount += 1;
          if (createCount > 1) {
            throw new Prisma.PrismaClientKnownRequestError('unique', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          return { id: 'we_1' };
        }),
        update: vi.fn(async () => ({})),
      },
    };
    const creditsPurchase = vi.fn(async () => ({}));
    const svc = new BillingService(
      prisma as unknown as PrismaService,
      { purchasePack: creditsPurchase } as unknown as CreditsService,
      {} as SubscriptionsService,
      env as never,
      makeProvider(),
    );

    const first = await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'evt_1',
      eventType: 'CREDIT_PACK_PURCHASED',
      payload: validPayload,
      signatureValid: true,
    });
    expect(first.state).toBe('PROCESSED');
    expect(creditsPurchase).toHaveBeenCalledTimes(1);

    const second = await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'evt_1',
      eventType: 'CREDIT_PACK_PURCHASED',
      payload: validPayload,
      signatureValid: true,
    });
    expect(second).toEqual({ accepted: true, duplicate: true, eventId: 'evt_1', state: 'SKIPPED' });
    // İkinci olayda işleme (satın alma) TEKRAR çalışmaz.
    expect(creditsPurchase).toHaveBeenCalledTimes(1);
  });

  it('geçersiz imzalı olay kaydedilir ama işlenmez (SKIPPED)', async () => {
    const prisma = {
      webhookEvent: {
        create: vi.fn(async () => ({ id: 'we_2' })),
        update: vi.fn(async () => ({})),
      },
    };
    const creditsPurchase = vi.fn();
    const svc = new BillingService(
      prisma as unknown as PrismaService,
      { purchasePack: creditsPurchase } as unknown as CreditsService,
      {} as SubscriptionsService,
      env as never,
      makeProvider(),
    );
    const result = await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'evt_2',
      eventType: 'CREDIT_PACK_PURCHASED',
      payload: validPayload,
      signatureValid: false,
    });
    expect(result.state).toBe('SKIPPED');
    expect(creditsPurchase).not.toHaveBeenCalled();
  });

  it('bilinmeyen olay tipi PROCESSED olur (ileri uyum)', async () => {
    const prisma = {
      webhookEvent: {
        create: vi.fn(async () => ({ id: 'we_3' })),
        update: vi.fn(async () => ({})),
      },
    };
    const svc = makeService(prisma);
    const result = await svc.ingestWebhook({
      source: 'GOOGLE',
      eventId: 'evt_3',
      eventType: 'FUTURE_EVENT_TYPE',
      payload: {},
      signatureValid: true,
    });
    expect(result.state).toBe('PROCESSED');
  });

  it('kredi paketi listesi aktif paketleri sırayla döner', async () => {
    const prisma = {
      creditPack: {
        findMany: async () => [
          { code: 'PACK_10', credits: 10, bonusCredits: 0, priceKurus: 2990, isActive: true },
          { code: 'PACK_25', credits: 25, bonusCredits: 5, priceKurus: 5990, isActive: true },
        ],
      },
    };
    const svc = makeService(prisma);
    const result = await svc.listCreditPacks();
    expect(result.packs).toHaveLength(2);
    expect(result.packs[0]?.credits).toBe(10);
  });
});

describe('Faz 7 — validatePurchase sağlayıcı akışı (Güvenlik-1/9)', () => {
  const verified: VerifiedStorePurchase = {
    productId: 'perdego.pack.pack_10',
    productType: 'CREDIT_PACK',
    platform: 'IOS',
    storeTransactionId: 'rc_tx_1',
    storeOriginalTransactionId: 'rc_tx_1',
    expiresAt: null,
    environment: 'SANDBOX',
  };

  it('yapılandırılmamış sağlayıcıda 503 BILLING_NOT_CONFIGURED döner (sahte başarı yok)', async () => {
    const svc = makeService({}, makeProvider(undefined, false));
    await expect(
      svc.validatePurchase('u_1', {
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: 'tx_1',
      }),
    ).rejects.toMatchObject({ status: 503, reason: 'BILLING_NOT_CONFIGURED' });
  });

  it('sağlayıcı doğrulaması geçemeyen satın alma reddedilir', async () => {
    const svc = makeService(
      {},
      makeProvider({ verifyPurchase: vi.fn(async () => null) }),
    );
    await expect(
      svc.validatePurchase('u_1', {
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: 'tx_hakkı_yok',
      }),
    ).rejects.toMatchObject({ reason: 'PURCHASE_VERIFICATION_FAILED' });
  });

  it('appUserId farklıysa 403 döner (başkasının satın alınması doğrulanamaz)', async () => {
    const svc = makeService({}, makeProvider());
    await expect(
      svc.validatePurchase('u_1', {
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: 'tx_1',
        appUserId: 'baskasi',
      }),
    ).rejects.toMatchObject({ status: 403, reason: 'APP_USER_MISMATCH' });
  });

  it('doğrulanmış kredi paketi cüzdana işlenir (ledger kaydıyla)', async () => {
    const purchasePack = vi.fn(async () => ({
      storeTransactionId: 'rc_tx_1',
      alreadyProcessed: false,
      wallet: { purchased: 10, granted: 0 },
    }));
    const prisma = {
      creditPack: { findFirst: vi.fn(async () => null) },
      creditWallet: { findUnique: vi.fn(async () => null) },
      subscription: {
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: vi.fn(async () => ({})),
        create: vi.fn(async () => ({})),
      },
      plan: { findFirst: vi.fn(async () => null) },
    };
    const svc = makeService(
      prisma,
      makeProvider({ verifyPurchase: vi.fn(async () => verified) }),
    );
    (svc as unknown as { credits: { purchasePack: unknown } }).credits = { purchasePack };
    const result = await svc.validatePurchase('u_1', {
      platform: 'IOS',
      productType: 'CREDIT_PACK',
      productId: 'perdego.pack.pack_10',
      storeTransactionId: 'rc_tx_1',
      appUserId: 'u_1',
    });
    expect(result.alreadyProcessed).toBe(false);
    expect(result.wallet).toEqual({ purchased: 10, granted: 0 });
    // İstemci productId'si DEĞİL sağlayıcının doğruladığı ürün kullanıldı.
    expect(purchasePack).toHaveBeenCalledWith(
      expect.objectContaining({ packCode: 'perdego.pack.pack_10', storeTransactionId: 'rc_tx_1' }),
    );
  });

  it('üretimde sandbox satın alması reddedilir', async () => {
    const svc = makeService(
      {},
      makeProvider({ verifyPurchase: vi.fn(async () => verified) }),
      { NODE_ENV: 'production' },
    );
    await expect(
      svc.validatePurchase('u_1', {
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: 'rc_tx_1',
      }),
    ).rejects.toMatchObject({ reason: 'SANDBOX_PURCHASE_REJECTED' });
  });

  it('sağlayıcıya erişilemezse 503 fail-closed döner', async () => {
    const svc = makeService(
      {},
      makeProvider({
        verifyPurchase: vi.fn(async () => {
          throw new Error('REVENUECAT_UNREACHABLE');
        }),
      }),
    );
    await expect(
      svc.validatePurchase('u_1', {
        platform: 'IOS',
        productType: 'CREDIT_PACK',
        productId: 'perdego.pack.pack_10',
        storeTransactionId: 'rc_tx_1',
      }),
    ).rejects.toMatchObject({ status: 503, reason: 'BILLING_PROVIDER_UNREACHABLE' });
  });
});

describe('Faz 7 — RevenueCat webhook olay işleme', () => {
  function webhookPrisma() {
    return {
      webhookEvent: {
        create: vi.fn(async () => ({ id: 'we_rc' })),
        update: vi.fn(async () => ({})),
      },
      user: { findUnique: vi.fn(async () => ({ id: 'u_1' })) },
      plan: { findFirst: vi.fn(async () => null) },
      creditPack: { findFirst: vi.fn(async () => null) },
    };
  }

  it('INITIAL_PURCHASE abonelik ürününe çözümlenir ve abonelik yazılır', async () => {
    const prisma = webhookPrisma();
    (prisma.plan.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 'SUB_MONTHLY',
      isActive: true,
    });
    const activate = vi.fn(async () => ({ storeTransactionId: 'tx', alreadyProcessed: false, status: 'ACTIVE', currentPeriodEnd: null }));
    const svc = new BillingService(
      prisma as unknown as PrismaService,
      {} as CreditsService,
      { activateFromPurchase: activate, findPlanByProductId: prisma.plan.findFirst } as unknown as SubscriptionsService,
      env as never,
      makeProvider(),
    );
    const result = await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'rc_evt_1',
      eventType: 'INITIAL_PURCHASE',
      payload: {
        type: 'INITIAL_PURCHASE',
        id: 'rc_evt_1',
        app_user_id: 'u_1',
        product_id: 'perdego.sub.monthly',
        transaction_id: '2000000123',
        original_transaction_id: '2000000123',
        expiration_at_ms: Date.now() + 30 * 86400_000,
        store: 'APP_STORE',
      },
      signatureValid: true,
    });
    expect(result.state).toBe('PROCESSED');
    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u_1',
        planCode: 'SUB_MONTHLY',
        periodType: 'NORMAL',
        periodEndOverride: expect.any(Date),
      }),
    );
  });

  it('CANCELLATION autoRenew kapatır; EXPIRATION aboneliği kapatır', async () => {
    const prisma = webhookPrisma();
    const cancelAtPeriodEnd = vi.fn(async () => 1);
    const markExpired = vi.fn(async () => 1);
    const svc = new BillingService(
      prisma as unknown as PrismaService,
      {} as CreditsService,
      { cancelAtPeriodEnd, markExpired } as unknown as SubscriptionsService,
      env as never,
      makeProvider(),
    );
    await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'rc_evt_2',
      eventType: 'CANCELLATION',
      payload: {
        type: 'CANCELLATION',
        id: 'rc_evt_2',
        original_app_user_id: 'u_1',
        original_transaction_id: 'orig_1',
      },
      signatureValid: true,
    });
    expect(cancelAtPeriodEnd).toHaveBeenCalledWith('orig_1');

    await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'rc_evt_3',
      eventType: 'EXPIRATION',
      payload: {
        type: 'EXPIRATION',
        id: 'rc_evt_3',
        original_app_user_id: 'u_1',
        original_transaction_id: 'orig_1',
      },
      signatureValid: true,
    });
    expect(markExpired).toHaveBeenCalledWith('orig_1');
  });

  it('BILLING_ISSUE grace alanıyla GRACE_PERIOD yazar', async () => {
    const prisma = webhookPrisma();
    const markBillingIssue = vi.fn(async () => 'GRACE_PERIOD' as const);
    const svc = new BillingService(
      prisma as unknown as PrismaService,
      {} as CreditsService,
      { markBillingIssue } as unknown as SubscriptionsService,
      env as never,
      makeProvider(),
    );
    await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'rc_evt_4',
      eventType: 'BILLING_ISSUE',
      payload: {
        type: 'BILLING_ISSUE',
        id: 'rc_evt_4',
        original_app_user_id: 'u_1',
        original_transaction_id: 'orig_1',
        grace_period_expiration_at_ms: Date.now() + 86400_000,
      },
      signatureValid: true,
    });
    expect(markBillingIssue).toHaveBeenCalledWith('orig_1', { inGracePeriod: true });
  });

  it('kredi paketi INITIAL_PURCHASE idempotent purchasePack akışına girer', async () => {
    const prisma = webhookPrisma();
    (prisma.creditPack.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: 'PACK_10',
      isActive: true,
    });
    const purchasePack = vi.fn(async () => ({}));
    const svc = new BillingService(
      prisma as unknown as PrismaService,
      { purchasePack } as unknown as CreditsService,
      { findPlanByProductId: vi.fn(async () => null) } as unknown as SubscriptionsService,
      env as never,
      makeProvider(),
    );
    const result = await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'rc_evt_5',
      eventType: 'INITIAL_PURCHASE',
      payload: {
        type: 'INITIAL_PURCHASE',
        id: 'rc_evt_5',
        app_user_id: 'u_1',
        product_id: 'perdego.pack.pack_10',
        transaction_id: 'GPA.333',
        original_transaction_id: 'GPA.333',
        store: 'PLAY_STORE',
      },
      signatureValid: true,
    });
    expect(result.state).toBe('PROCESSED');
    expect(purchasePack).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u_1', packCode: 'PACK_10', storeTransactionId: 'GPA.333' }),
    );
  });

  it('bilinmeyen ürün FAILED olur (sessiz kayıp yok)', async () => {
    const prisma = webhookPrisma();
    const svc = makeService(prisma);
    const result = await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'rc_evt_6',
      eventType: 'INITIAL_PURCHASE',
      payload: {
        type: 'INITIAL_PURCHASE',
        id: 'rc_evt_6',
        app_user_id: 'u_1',
        product_id: 'bilinmeyen.urun',
        transaction_id: 'tx_9',
        store: 'APP_STORE',
      },
      signatureValid: true,
    });
    expect(result.state).toBe('FAILED');
  });

  it('TEST olayı işlem yapmadan PROCESSED olur', async () => {
    const prisma = webhookPrisma();
    const svc = makeService(prisma);
    const result = await svc.ingestWebhook({
      source: 'REVENUECAT',
      eventId: 'rc_evt_7',
      eventType: 'TEST',
      payload: { type: 'TEST', id: 'rc_evt_7', original_app_user_id: 'u_1' },
      signatureValid: true,
    });
    expect(result.state).toBe('PROCESSED');
  });

  it('RC webhook zarfı: sağlayıcı kapalıyken 503 döner (fail-closed)', async () => {
    const svc = makeService({}, makeProvider(undefined, false));
    await expect(
      svc.ingestRevenueCatWebhook({ rawBody: '{"event":{}}', headers: { authorization: 'Bearer x' } }),
    ).rejects.toMatchObject({ status: 503, reason: 'BILLING_NOT_CONFIGURED' });
  });

  it('RC webhook zarfı: Bearer doğrulaması sağlayıcıya delege edilir', async () => {
    const verifyWebhookSource = vi.fn(() => false);
    const prisma = webhookPrisma();
    const svc = new BillingService(
      prisma as unknown as PrismaService,
      {} as CreditsService,
      {} as SubscriptionsService,
      { ...env, BILLING_PROVIDER: 'revenuecat' } as never,
      makeProvider({ verifyWebhookSource }),
    );
    const result = await svc.ingestRevenueCatWebhook({
      rawBody: JSON.stringify({ event: { type: 'TEST', id: 'rc_evt_8', original_app_user_id: 'u_1' } }),
      headers: { authorization: 'Bearer yanlis' },
    });
    expect(verifyWebhookSource).toHaveBeenCalled();
    expect(result.state).toBe('SKIPPED'); // imza geçersiz → işlenmez
  });

  it('getBillingConfig yapılandırılmamışsa configured=false döner', async () => {
    const prisma = {
      plan: { findMany: vi.fn(async () => []) },
      creditPack: { findMany: vi.fn(async () => []) },
    };
    const svc = makeService(prisma, makeProvider(undefined, false));
    const config = await svc.getBillingConfig();
    expect(config.provider).toBe('none');
    expect(config.configured).toBe(false);
    expect(config.subscriptionProducts).toEqual([]);
  });

  it('syncEntitlements simülasyon sağlayıcıda abonelik durumu kapatır (boş mağaza durumu)', async () => {
    const prisma = {
      subscription: {
        findFirst: vi.fn(async () => null),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      plan: { findFirst: vi.fn(async () => null) },
      storeTransaction: { findUnique: vi.fn(async () => null) },
      creditPack: { findFirst: vi.fn(async () => null) },
      creditWallet: { findUnique: vi.fn(async () => ({ purchasedBalance: 0, grantedBalance: 0 })) },
    };
    // Boş ama mevcut sağlayıcı durumu (fetch başarılı, abonelik yok).
    const provider = makeProvider({
      fetchSubscriberState: vi.fn(async () => ({
        environment: 'SANDBOX' as const,
        subscriptions: [],
        nonSubscriptions: [],
      })),
    });
    const svc = makeService(prisma, provider);
    const result = await svc.syncEntitlements('u_1', 'IOS');
    expect(result.subscription.status).toBe('NONE');
    // Sağlayıcı boş durum döndürdü → açık DB abonelikleri EXPIRED yapılır.
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u_1' }) }),
    );
    expect(result.wallet).toEqual({ purchased: 0, granted: 0, total: 0 });
  });
});
