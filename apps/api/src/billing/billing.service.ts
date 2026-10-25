/**
 * Billing servisi: mağaza doğrulama (simüle), webhook alımı (Kural 7:
 * idempotent) ve işlem geçmişi.
 *
 * Webhook akışı (API_CONTRACT §8, ERD §4.3):
 *   ham olay → webhook_events UNIQUE(source, event_id) INSERT
 *   → çiftse SKIPPED (idempotent, hata değil)
 *   → olay tipine göre işlenir (kredi/abonelik/iade) → PROCESSED/FAILED.
 * Gerçek sağlayıcı ters sorgusu Faz 5'te worker'a bağlanır; imza doğrulaması
 * (WEBHOOK_SIGNING_SECRET tanımlıysa HMAC-SHA256) zaten aktiftir.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { buildPageMeta } from '../common/pagination';
import { CreditsService } from '../credits/credits.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly subscriptions: SubscriptionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Webhook olayını alır. Yanıt HER ZAMAN 202 uyumlu zarftır; çift olay
   * duplicate=true + state=SKIPPED ile bildirilir (Kural 7).
   */
  async ingestWebhook(args: {
    source: 'APPLE' | 'GOOGLE' | 'REVENUECAT';
    eventId: string;
    eventType: string;
    payload?: unknown;
    signatureValid: boolean;
  }): Promise<{ accepted: boolean; duplicate: boolean; eventId: string; state: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'SKIPPED' }> {
    // Kayıt: çift olay unique ihlaliyle yakalanır (idempotent).
    let event;
    try {
      event = await this.prisma.webhookEvent.create({
        data: {
          source: args.source,
          eventId: args.eventId,
          eventType: args.eventType,
          payload: (args.payload ?? undefined) as Prisma.InputJsonValue | undefined,
          signatureValid: args.signatureValid,
          state: 'RECEIVED',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { accepted: true, duplicate: true, eventId: args.eventId, state: 'SKIPPED' };
      }
      throw error;
    }

    if (!args.signatureValid) {
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { state: 'SKIPPED', errorMessage: 'INVALID_SIGNATURE' },
      });
      return { accepted: true, duplicate: false, eventId: args.eventId, state: 'SKIPPED' };
    }

    try {
      await this.processEvent(args.eventType, (args.payload ?? {}) as Record<string, unknown>);
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: { state: 'PROCESSED', processedAt: new Date() },
      });
      return { accepted: true, duplicate: false, eventId: args.eventId, state: 'PROCESSED' };
    } catch (error) {
      this.logger.warn(
        `Webhook işlenemedi (${args.eventId}/${args.eventType}): ${error instanceof Error ? error.message : error}`,
      );
      await this.prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          state: 'FAILED',
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : String(error),
        },
      });
      return { accepted: true, duplicate: false, eventId: args.eventId, state: 'FAILED' };
    }
  }

  /** Olay tipi dağıtımı — payload alanları simüle sağlayıcı sözleşmesidir. */
  private async processEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const str = (key: string): string => {
      const value = payload[key];
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`payload.${key} beklenen metin değil`);
      }
      return value;
    };

    switch (eventType) {
      case 'CREDIT_PACK_PURCHASED': {
        const user = await this.resolveUser(str('userId'), str('userEmail'));
        await this.credits.purchasePack({
          userId: user.id,
          packCode: str('productId'),
          platform: payload.platform === 'ANDROID' ? 'ANDROID' : 'IOS',
          storeTransactionId: str('storeTransactionId'),
          storeOriginalTransactionId:
            typeof payload.storeOriginalTransactionId === 'string'
              ? payload.storeOriginalTransactionId
              : undefined,
        });
        return;
      }
      case 'SUBSCRIPTION_ACTIVATED':
      case 'SUBSCRIPTION_RENEWED': {
        const user = await this.resolveUser(str('userId'), str('userEmail'));
        await this.subscriptions.activateFromPurchase({
          userId: user.id,
          platform: payload.platform === 'ANDROID' ? 'ANDROID' : 'IOS',
          planCode: str('productId'),
          storeTransactionId: str('storeTransactionId'),
          storeOriginalTransactionId:
            typeof payload.storeOriginalTransactionId === 'string'
              ? payload.storeOriginalTransactionId
              : undefined,
        });
        return;
      }
      case 'PURCHASE_REFUNDED': {
        await this.applyRefund(str('storeTransactionId'), payload.platform === 'ANDROID' ? 'ANDROID' : 'IOS');
        return;
      }
      default:
        // Bilinmeyen olay tipleri kayda geçer, hataya düşmez (ileri uyum).
        return;
    }
  }

  /** İade (BR-12): işlem işaretlenir; kredi ise REFUND ledger, abonelikse EXPIRED. */
  private async applyRefund(storeTransactionId: string, platform: 'IOS' | 'ANDROID'): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const storeTx = await tx.storeTransaction.findUnique({
        where: { platform_storeTransactionId: { platform, storeTransactionId } },
      });
      if (!storeTx) {
        throw new Error(`İade edilecek işlem bulunamadı: ${storeTransactionId}`);
      }
      if (storeTx.refundedAt) return; // zaten iade edilmiş (idempotent)

      await tx.storeTransaction.update({
        where: { id: storeTx.id },
        data: { refundedAt: new Date(), purchaseState: 'REFUNDED' },
      });

      if (storeTx.userId) {
        if (storeTx.productType === 'CREDIT_PACK') {
          // Kullanılmış krediler geri istenemez; kalan bakiye kadar düşülür.
          const wallet = await tx.creditWallet.findUnique({ where: { userId: storeTx.userId } });
          const purchasedAvailable = Math.max(wallet?.purchasedBalance ?? 0, 0);
          const pack = await tx.creditPack.findUnique({ where: { code: storeTx.productId } });
          const purchasedPart = pack?.credits ?? 0;
          const grantPart = pack?.bonusCredits ?? 0;
          const refundPurchased = Math.min(purchasedPart, purchasedAvailable);
          const refundGranted = Math.max(grantPart - Math.max(purchasedPart - refundPurchased, 0), 0);

          if (refundPurchased > 0 || refundGranted > 0) {
            await this.credits.appendLedgerAndRecompute(tx, {
              userId: storeTx.userId,
              type: 'REFUND',
              purchasedDelta: -refundPurchased,
              grantedDelta: -refundGranted,
              referenceType: 'STORE_TRANSACTION',
              referenceId: storeTx.id,
              idempotencyKey: `refund:${platform}:${storeTransactionId}`,
              note: 'Mağaza iadesi',
            });
          }
        } else {
          await tx.subscription.updateMany({
            where: {
              userId: storeTx.userId,
              storeOriginalTransactionId: storeTx.storeOriginalTransactionId ?? storeTx.storeTransactionId,
              status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] },
            },
            data: { status: 'EXPIRED', expiresAt: new Date() },
          });
        }
      }
    });
  }

  private async resolveUser(userId: string, email: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: userId }, { email: email.toLowerCase() }] },
      select: { id: true },
    });
    if (!user) throw new Error(`Webhook kullanıcısı bulunamadı: ${userId}/${email}`);
    return user;
  }

  /** Mağaza doğrulaması (simüle): gerçek sağlayıcı sorgusu Faz 5'te. */
  async validatePurchase(userId: string, dto: {
    platform: 'IOS' | 'ANDROID';
    productType: 'SUBSCRIPTION' | 'CREDIT_PACK';
    productId: string;
    storeTransactionId: string;
    storeOriginalTransactionId?: string;
    priceKurus?: number;
    currency?: string;
    purchaseToken?: string;
  }): Promise<{
    storeTransactionId: string;
    alreadyProcessed: boolean;
    productType: 'SUBSCRIPTION' | 'CREDIT_PACK';
    wallet?: { purchased: number; granted: number };
    subscription?: { status: string; currentPeriodEnd: string | null };
  }> {
    if (dto.productType === 'CREDIT_PACK') {
      const result = await this.credits.purchasePack({
        userId,
        packCode: dto.productId,
        platform: dto.platform,
        storeTransactionId: dto.storeTransactionId,
        storeOriginalTransactionId: dto.storeOriginalTransactionId,
        priceKurus: dto.priceKurus,
        currency: dto.currency,
        purchaseToken: dto.purchaseToken,
      });
      return { ...result, productType: 'CREDIT_PACK' };
    }
    const result = await this.subscriptions.activateFromPurchase({
      userId,
      platform: dto.platform,
      planCode: dto.productId,
      storeTransactionId: dto.storeTransactionId,
      storeOriginalTransactionId: dto.storeOriginalTransactionId,
      priceKurus: dto.priceKurus,
      currency: dto.currency,
      purchaseToken: dto.purchaseToken,
    });
    return { ...result, productType: 'SUBSCRIPTION' };
  }

  /** Kullanıcının mağaza işlem geçmişi. */
  async listTransactions(userId: string, page: number, pageSize: number) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.storeTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.storeTransaction.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        productType: row.productType,
        productId: row.productId,
        storeTransactionId: row.storeTransactionId,
        priceKurus: row.priceKurus,
        currency: row.currency,
        purchaseState: row.purchaseState,
        refundedAt: row.refundedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  /** Webhook imza doğrulaması (gövde ham metni üzerinden). */
  verifySignature(rawBody: string, signatureHeader: string | undefined): boolean {
    if (!this.env.WEBHOOK_SIGNING_SECRET) {
      // Sır tanımlı değilse yalnızca geliştirme/test ortamı kabul eder.
      return this.env.NODE_ENV !== 'production';
    }
    if (!signatureHeader) return false;
    const expected = createHmac('sha256', this.env.WEBHOOK_SIGNING_SECRET).update(rawBody).digest('hex');
    const provided = signatureHeader.replace(/^sha256=/, '');
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  }

  /** Kredi paketleri (kredi mağazası ekranı). */
  async listCreditPacks() {
    const packs = await this.prisma.creditPack.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      packs: packs.map((pack) => ({
        id: pack.code,
        credits: pack.credits,
        bonusCredits: pack.bonusCredits,
        priceKurus: pack.priceKurus,
        currency: 'TRY' as const,
        isBestValue: pack.bonusCredits > 0 && pack.code === 'PACK_25',
      })),
    };
  }
}
