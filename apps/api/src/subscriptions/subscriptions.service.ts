/**
 * Abonelik servisi (Kural 5: abonelik durumu BAĞIMSIZ tabloda/serviste;
 * bölüm erişimi AccessService, oynatma hakkı MediaService'te).
 *
 * Durum makinesi (ERD): TRIALING → ACTIVE → GRACE_PERIOD/ON_HOLD →
 * CANCELED/EXPIRED. Faz 2b kapsamı: durum okuma, ürün listeleme ve mağaza
 * doğrulamasından gelen aktivasyon/uzatma (gerçek RevenueCat doğrulaması
 * Faz 5'te aynı servise bağlanır).
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';

const ENTITLED = ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] as const;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Kullanıcının en güncel abonelik kaydı (yoksa null). */
  async getCurrent(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      include: { plan: true },
    });
  }

  /**
   * Oynatma hakkı veren aktif abonelik var mı? (BR-02)
   * currentPeriodEnd > now VE status ∈ {TRIALING, ACTIVE, GRACE_PERIOD}.
   */
  async hasEntitlement(userId: string): Promise<boolean> {
    const count = await this.prisma.subscription.count({
      where: {
        userId,
        status: { in: [...ENTITLED] },
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gt: new Date() } },
        ],
      },
    });
    return count > 0;
  }

  /** Cüzdan sözleşmesindeki dar enum'a eşler (NONE|TRIALING|ACTIVE|EXPIRED). */
  async walletStatus(userId: string): Promise<'NONE' | 'TRIALING' | 'ACTIVE' | 'EXPIRED'> {
    const current = await this.getCurrent(userId);
    if (!current) return 'NONE';
    if (current.status === 'TRIALING' && this.periodValid(current)) return 'TRIALING';
    if (ENTITLED.includes(current.status as (typeof ENTITLED)[number]) && this.periodValid(current)) {
      return 'ACTIVE';
    }
    return 'EXPIRED';
  }

  /** Aktif planlar (paywall) — contracts subscriptionPlanSchema biçiminde. */
  async listPlans() {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      plans: plans.map((plan) => ({
        id: plan.code,
        name: plan.titleTr,
        billingPeriod: plan.billingPeriod,
        priceKurus: plan.priceKurus,
        monthlyEquivalentKurus:
          plan.billingPeriod === 'YEARLY' ? Math.round(plan.priceKurus / 12) : undefined,
        currency: plan.currency === 'TRY' ? ('TRY' as const) : ('TRY' as const),
        trialDays: plan.trialDays,
        isBestValue: plan.billingPeriod === 'YEARLY',
        benefits: [],
      })),
    };
  }

  /**
   * Mağaza doğrulamasından geçen abonelik satın almasını kaydeder/uzatır.
   * - store_transactions UNIQUE(platform, storeTransactionId) → aynı işlem
   *   ikinci kez işlenmez (Kural 2); tekrar → alreadyProcessed=true.
   * - Aynı storeOriginalTransactionId'li açık abonelik varsa dönem uzatılır.
   */
  async activateFromPurchase(args: {
    userId: string;
    platform: 'IOS' | 'ANDROID';
    planCode: string;
    storeTransactionId: string;
    storeOriginalTransactionId?: string;
    productId?: string;
    priceKurus?: number;
    currency?: string;
    purchaseToken?: string;
    /** RC expiration_at_ms — mağaza dönem bitişi (yetkili kaynak). */
    periodEndOverride?: Date;
    /** RC period_type — deneme/kampanya dönemleri TRIAL yazar. */
    periodType?: 'NORMAL' | 'TRIAL' | 'INTRO';
    tx?: Prisma.TransactionClient;
  }): Promise<{ storeTransactionId: string; alreadyProcessed: boolean; status: string; currentPeriodEnd: string | null }> {
    const run = async (tx: Prisma.TransactionClient) => {
      const plan = await tx.plan.findUnique({ where: { code: args.planCode } });
      if (!plan || !plan.isActive) {
        throw DomainError.notFound('PLAN_NOT_FOUND', 'errors.planNotFound', { planCode: args.planCode });
      }

      const dup = await tx.storeTransaction.findUnique({
        where: {
          platform_storeTransactionId: {
            platform: args.platform,
            storeTransactionId: args.storeTransactionId,
          },
        },
      });
      if (dup) {
        const existingSub = await tx.subscription.findFirst({
          where: { userId: args.userId, storeOriginalTransactionId: args.storeOriginalTransactionId ?? dup.storeOriginalTransactionId ?? dup.storeTransactionId },
          orderBy: { createdAt: 'desc' },
        });
        return {
          storeTransactionId: dup.storeTransactionId,
          alreadyProcessed: true,
          status: existingSub?.status ?? 'EXPIRED',
          currentPeriodEnd: existingSub?.currentPeriodEnd?.toISOString() ?? null,
        };
      }

      await tx.storeTransaction.create({
        data: {
          userId: args.userId,
          platform: args.platform,
          productType: 'SUBSCRIPTION',
          productId: args.productId ?? plan.code,
          storeTransactionId: args.storeTransactionId,
          storeOriginalTransactionId: args.storeOriginalTransactionId ?? args.storeTransactionId,
          purchaseToken: args.purchaseToken,
          priceKurus: args.priceKurus ?? plan.priceKurus,
          currency: args.currency ?? plan.currency,
          purchaseState: 'PURCHASED',
          validatedAt: new Date(),
        },
      });

      const familyKey = args.storeOriginalTransactionId ?? args.storeTransactionId;
      const openSub = await tx.subscription.findFirst({
        where: { userId: args.userId, storeOriginalTransactionId: familyKey },
        orderBy: { createdAt: 'desc' },
      });

      const now = new Date();
      const storePeriodEnd =
        args.periodEndOverride ??
        new Date(
          plan.billingPeriod === 'YEARLY' ? now.getTime() + 365 * 86400_000 : now.getTime() + 30 * 86400_000,
        );
      const isTrialPeriod = args.periodType === 'TRIAL' || args.periodType === 'INTRO';

      let status: 'TRIALING' | 'ACTIVE';
      let effectiveEnd = storePeriodEnd;
      if (openSub && openSub.currentPeriodEnd && openSub.currentPeriodEnd > now) {
        // Uzatma: mevcut dönem bitişinden sonra bir dönem ekle.
        // RC expiry yetkili olduğundan (webhook'ta gelir) mağaza dönem bitişi kullanılır.
        effectiveEnd = args.periodEndOverride ?? new Date(
          openSub.currentPeriodEnd.getTime() +
            (plan.billingPeriod === 'YEARLY' ? 365 : 30) * 86400_000,
        );
        status = openSub.status === 'TRIALING' && isTrialPeriod ? 'TRIALING' : 'ACTIVE';
        await tx.subscription.update({
          where: { id: openSub.id },
          data: {
            status,
            currentPeriodEnd: effectiveEnd,
            autoRenew: true,
            planId: plan.id,
          },
        });
      } else if ((plan.trialDays > 0 || isTrialPeriod) && !openSub) {
        status = 'TRIALING';
        // RC deneme dönemi bitişi yetkilidir; yoksa plan.trialDays kullanılır.
        effectiveEnd =
          args.periodType === 'TRIAL' || args.periodType === 'INTRO'
            ? storePeriodEnd
            : new Date(now.getTime() + plan.trialDays * 86400_000);
        await tx.subscription.create({
          data: {
            userId: args.userId,
            planId: plan.id,
            platform: args.platform,
            status,
            autoRenew: true,
            currentPeriodStart: now,
            currentPeriodEnd: effectiveEnd,
            storeOriginalTransactionId: familyKey,
            productId: args.productId ?? plan.code,
          },
        });
      } else {
        status = 'ACTIVE';
        await tx.subscription.create({
          data: {
            userId: args.userId,
            planId: plan.id,
            platform: args.platform,
            status,
            autoRenew: true,
            currentPeriodStart: now,
            currentPeriodEnd: effectiveEnd,
            storeOriginalTransactionId: familyKey,
            productId: args.productId ?? plan.code,
          },
        });
      }

      return {
        storeTransactionId: args.storeTransactionId,
        alreadyProcessed: false,
        status,
        currentPeriodEnd: effectiveEnd.toISOString(),
      };
    };

    return args.tx ? run(args.tx) : this.prisma.$transaction(run);
  }

  private periodValid(sub: { status: string; currentPeriodEnd: Date | null }): boolean {
    if (sub.status === 'GRACE_PERIOD') return true;
    return sub.currentPeriodEnd ? sub.currentPeriodEnd.getTime() > Date.now() : false;
  }

  // ---------------------------------------------------------------------------
  // Faz 7: mağaza odaklı yaşam döngüsü işlemleri (RevenueCat webhook'ları +
  // entitlement senkronu). Tüm işlemler storeOriginalTransactionId ailesine
  // etki eder; bulunamayan aile için sessiz no-op yapılır (webhook'lar yetkili
  // ama geç olabilir — INITIAL_PURCHASE sırası garanti değildir).
  // ---------------------------------------------------------------------------

  /** CANCELLATION: dönem sonunda iptal — autoRenew kapanır, hak dönem bitene kadar sürer. */
  async cancelAtPeriodEnd(originalTransactionId: string, canceledAt: Date = new Date()): Promise<number> {
    const result = await this.prisma.subscription.updateMany({
      where: {
        storeOriginalTransactionId: originalTransactionId,
        status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] },
      },
      data: { autoRenew: false, canceledAt },
    });
    return result.count;
  }

  /** UNCANCELLATION: iptal geri alındı — otomatik yenileme yeniden açılır. */
  async resumeAutoRenew(originalTransactionId: string): Promise<number> {
    const result = await this.prisma.subscription.updateMany({
      where: {
        storeOriginalTransactionId: originalTransactionId,
        status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] },
      },
      data: { autoRenew: true, canceledAt: null },
    });
    return result.count;
  }

  /** EXPIRATION: abonelik süresi doldu / iptal edildi — hak kapanır. */
  async markExpired(originalTransactionId: string): Promise<number> {
    const result = await this.prisma.subscription.updateMany({
      where: { storeOriginalTransactionId: originalTransactionId },
      data: { status: 'EXPIRED', autoRenew: false, expiresAt: new Date() },
    });
    return result.count;
  }

  /**
   * BILLING_ISSUE: ödeme sorunu. RC grace period içindeyse GRACE_PERIOD
   * (hak sürer), aksi halde ON_HOLD (erişim durur). plan.gracePeriodDays
   * ile "yumuşak iniş" süresi DB durumuna yansıtılır.
   */
  async markBillingIssue(
    originalTransactionId: string,
    opts: { inGracePeriod: boolean; expiresAt?: Date | null },
  ): Promise<'GRACE_PERIOD' | 'ON_HOLD' | 'IGNORED'> {
    const now = new Date();
    const subs = await this.prisma.subscription.findMany({
      where: {
        storeOriginalTransactionId: originalTransactionId,
        status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'ON_HOLD'] },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
    if (subs.length === 0) return 'IGNORED';
    const target = subs[0]!;
    if (!opts.inGracePeriod) {
      await this.prisma.subscription.updateMany({
        where: { id: { in: subs.map((s) => s.id) } },
        data: { status: 'ON_HOLD', autoRenew: true },
      });
      return 'ON_HOLD';
    }
    // Grace dönemi: plan yapılandırmasına göre üst sınır uygulanır.
    const graceEnd = new Date(now.getTime() + (target.plan?.gracePeriodDays ?? 16) * 86400_000);
    await this.prisma.subscription.updateMany({
      where: { id: { in: subs.map((s) => s.id) } },
      data: { status: 'GRACE_PERIOD', autoRenew: true, expiresAt: graceEnd },
    });
    void opts.expiresAt;
    return 'GRACE_PERIOD';
  }

  /** SUBSCRIPTION_PAUSED (Android): ON_HOLD — duraklatma süresince erişim yok. */
  async markPaused(originalTransactionId: string): Promise<number> {
    const result = await this.prisma.subscription.updateMany({
      where: {
        storeOriginalTransactionId: originalTransactionId,
        status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] },
      },
      data: { status: 'ON_HOLD' },
    });
    return result.count;
  }

  /** SUBSCRIPTION_RESUMED / duraklatma bitişi: erişimi geri açar. */
  async markResumed(originalTransactionId: string, periodEnd?: Date): Promise<number> {
    const result = await this.prisma.subscription.updateMany({
      where: {
        storeOriginalTransactionId: originalTransactionId,
        status: { in: ['ON_HOLD', 'GRACE_PERIOD'] },
      },
      data: {
        status: 'ACTIVE',
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
      },
    });
    return result.count;
  }

  /**
   * Mağaza durumundan ürün çözümlemesi (RC product_id → plan).
   * Bulunamazsa null döner; çağıran taraf bilinmeyen ürünü kayda geçer ama
   * hak yazmadan bırakır.
   */
  async findPlanByProductId(productId: string) {
    return this.prisma.plan.findFirst({
      where: {
        isActive: true,
        OR: [{ platformProductIdIos: productId }, { platformProductIdAndroid: productId }],
      },
    });
  }
}
