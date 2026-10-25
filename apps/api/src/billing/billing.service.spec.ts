import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { BillingService } from './billing.service';
import type { CreditsService } from '../credits/credits.service';
import type { SubscriptionsService } from '../subscriptions/subscriptions.service';
import type { PrismaService } from '../prisma/prisma.service';

const env = {
  NODE_ENV: 'test' as const,
  WEBHOOK_SIGNING_SECRET: 'test-secret-0123456789abcdef',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  PLAYBACK_TTL_SECONDS: 300,
  PLAYBACK_MAX_PARALLEL: 2,
  IDEMPOTENCY_TTL_HOURS: 24,
  DATABASE_URL: 'postgresql://test',
};

function makeService(prisma: unknown): BillingService {
  return new BillingService(
    prisma as PrismaService,
    {} as CreditsService,
    {} as SubscriptionsService,
    env as never,
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
      user: { findFirst: vi.fn(async () => ({ id: 'u_1' })) },
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
