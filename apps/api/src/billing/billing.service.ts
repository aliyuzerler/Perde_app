/**
 * Billing servisi (Faz 7): gerçek sağlayıcı doğrulaması, RevenueCat webhook
 * yaşam döngüsü, idempotent işlem yönetimi ve ürün yapılandırması.
 *
 * Güvenlik kuralları (görev gereksinimleri):
 *  - Güvenlik-1: mobil istemcinin bildirdiği satın alma sonucuna tek başına
 *    güvenilmez; RC sağlayıcısında satın alma REST API ters sorgusuyla
 *    doğrulanır (verifyPurchase), simülasyon yalnızca geliştirmede çalışır.
 *  - Güvenlik-2: mağaza doğrulaması + sunucu tarafı webhook akışı birlikte
 *    kuruludur; webhook'lar Bearer sırrı doğrulanarak kabul edilir.
 *  - Güvenlik-3: her satın alma benzersiz işlem kimliğiyle idempotent işlenir
 *    (store_transactions UNIQUE(platform, storeTransactionId) + ledger
 *    idempotencyKey + webhook_events UNIQUE(source, eventId)).
 *  - Güvenlik-4: webhook imzası/kaynağı doğrulanır, yeniden gönderilen
 *    event'ler SKIPPED olarak kayda geçer (çift işleme yok).
 *  - Güvenlik-5: kredi bakiyesi doğrudan artırılmaz; doğrulanmış satın alma
 *    kaydı (store_transactions) + credit_ledger PURCHASE kaydı oluşur.
 *  - Güvenlik-7: iade/chargeback düzeltmesi — kredi paketinde kullanılmayan
 *    bakiye kadar REFUND ledger, abonelikte EXPIRED + dönem bitişi.
 *  - Güvenlik-9: üretimde sahte satın alma başarılı yanıtı ÜRETİLMEZ —
 *    sağlayıcı yapılandırılmamışsa uçlar 503 BILLING_NOT_CONFIGURED döner.
 *
 * Webhook akışı (API_CONTRACT §8):
 *   ham olay → webhook_events UNIQUE(source, event_id) INSERT
 *   → çiftse SKIPPED (idempotent, hata değil)
 *   → RC olay tipine göre işlenir (abonelik/kredi/iade) → PROCESSED/FAILED.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { buildPageMeta } from '../common/pagination';
import { DomainError } from '../common/errors';
import { CreditsService } from '../credits/credits.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import {
  BILLING_PROVIDER,
  type BillingProviderPort,
  type ProviderSubscriberState,
  type VerifiedStorePurchase,
} from './provider/billing-provider.port';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly subscriptions: SubscriptionsService,
    @Inject(ENV) private readonly env: Env,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProviderPort,
  ) {}

  /** Ödeme sağlayıcısı devrede mi? (uç yanıtlarında dürüst durum.) */
  get isBillingConfigured(): boolean {
    return this.provider.kind === 'revenuecat' && this.provider.configured;
  }

  // ==========================================================================
  // Webhook alımı — RevenueCat zarfı ve genel zarf
  // ==========================================================================

  /**
   * RevenueCat webhook alımı (POST /billing/webhooks/revenuecat).
   * Kaynak doğrulaması sağlayıcı adapter'ında (Bearer sır) yapılır (Güvenlik-4).
   */
  async ingestRevenueCatWebhook(args: {
    rawBody: string;
    headers: { authorization?: string };
  }): Promise<{ accepted: boolean; duplicate: boolean; eventId: string; state: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'SKIPPED' }> {
    if (this.env.BILLING_PROVIDER !== 'revenuecat') {
      // Sağlayıcı yapılandırılmamışken RC webhook'u kabul edilmez (fail-closed).
      throw new DomainError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        messageKey: 'errors.billingNotConfigured',
        reason: 'BILLING_NOT_CONFIGURED',
      });
    }
    const signatureValid = this.provider.verifyWebhookSource(args.headers);
    let envelope: { event?: { type?: unknown; id?: unknown } } = {};
    try {
      envelope = JSON.parse(args.rawBody) as typeof envelope;
    } catch {
      envelope = {};
    }
    const event = envelope.event;
    const eventType = typeof event?.type === 'string' ? event.type : 'UNKNOWN';
    const eventId = typeof event?.id === 'string' ? event.id : `unparsed-${Date.now()}`;

    return this.ingestWebhook({
      source: 'REVENUECAT',
      eventId,
      eventType,
      payload: event,
      signatureValid,
    });
  }

  /**
   * Genel webhook zarfı (sağlayıcı bağımsız; legacy uyumluluk + iade aktarımı).
   * Yanıt HER ZAMAN 202 uyumlu zarftır; çift olay duplicate=true + state=SKIPPED
   * ile bildirilir (Kural 7).
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

  /** Olay tipi dağıtımı: RC zarfı öncelikli, sonra legacy sözleşme. */
  private async processEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    // RC v1 olay zarfı (Faz 7): payload = RC event nesnesi.
    if (REVENUECAT_EVENTS.has(eventType)) {
      await this.processRevenueCatEvent(eventType, payload);
      return;
    }

    // Legacy simüle sağlayıcı sözleşmesi (geliştirme/test uyumluluğu).
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

  // ==========================================================================
  // RevenueCat olay işleme (Faz 7)
  // ==========================================================================

  /**
   * RC event nesnesini işler. app_user_id (ya da original_app_user_id)
   * PerdeGo kullanıcı kimliğidir (SDK logIn ile eşlenir). Kullanıcı
   * bulunamazsa olay FAILED olur (operasyon görür) — sessiz kayıp yok.
   */
  private async processRevenueCatEvent(eventType: string, event: Record<string, unknown>): Promise<void> {
    if (eventType === 'TEST') {
      // RC panel "send test event" — işlem yok.
      return;
    }

    // TRANSFER (Kusur F7-05): sahiplik aktarımı transferred_to + orijinal
    // işlem kimliğiyle yapılır; RC zarfı bu olayda app_user_id taşımayabilir.
    // app_user_id şartı TRANSFER için uygulanmaz (yoksa geçerli aktarım
    // FAILED olurdu).
    if (eventType === 'TRANSFER') {
      await this.applyTransfer(event);
      return;
    }

    const appUserId =
      typeof event.app_user_id === 'string' && event.app_user_id.length > 0
        ? event.app_user_id
        : typeof event.original_app_user_id === 'string'
          ? event.original_app_user_id
          : undefined;
    if (!appUserId) {
      throw new Error('RC olayında app_user_id yok');
    }

    const platform =
      event.store === 'PLAY_STORE' ? ('ANDROID' as const) : ('IOS' as const);
    const productId = typeof event.product_id === 'string' ? event.product_id : undefined;
    const transactionId = typeof event.transaction_id === 'string' ? event.transaction_id : undefined;
    const originalTransactionId =
      typeof event.original_transaction_id === 'string' && event.original_transaction_id.length > 0
        ? event.original_transaction_id
        : transactionId;
    const expiresAt = typeof event.expiration_at_ms === 'number' ? new Date(event.expiration_at_ms) : undefined;
    const periodType =
      event.period_type === 'TRIAL' || event.period_type === 'INTRO'
        ? (event.period_type as 'TRIAL' | 'INTRO')
        : 'NORMAL';

    switch (eventType) {
      // --- Hak kazandıran olaylar --------------------------------------------
      case 'INITIAL_PURCHASE':
      case 'NON_RENEWING_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'SUBSCRIPTION_EXTENDED': {
        if (!productId) {
          throw new Error(`${eventType} olayında product_id yok`);
        }
        await this.applyStoreGrant({
          appUserId,
          platform,
          productId,
          storeTransactionId: transactionId ?? `${eventType}:${event.id}`,
          storeOriginalTransactionId: originalTransactionId,
          expiresAt,
          periodType,
        });
        return;
      }

      // --- Abonelik yaşam döngüsü --------------------------------------------
      case 'CANCELLATION':
        if (originalTransactionId) await this.subscriptions.cancelAtPeriodEnd(originalTransactionId);
        return;
      case 'UNCANCELLATION':
        if (originalTransactionId) await this.subscriptions.resumeAutoRenew(originalTransactionId);
        return;
      case 'EXPIRATION':
        if (originalTransactionId) await this.subscriptions.markExpired(originalTransactionId);
        return;
      case 'BILLING_ISSUE':
        if (originalTransactionId) {
          await this.subscriptions.markBillingIssue(originalTransactionId, {
            inGracePeriod: typeof event.grace_period_expiration_at_ms === 'number',
          });
        }
        return;
      case 'SUBSCRIPTION_PAUSED':
        if (originalTransactionId) await this.subscriptions.markPaused(originalTransactionId);
        return;

      // --- İade / düzeltme (Güvenlik-7) ---------------------------------------
      case 'REFUND':
        // Kredi paketinde: kullanılmayan bakiye kadar REFUND ledger;
        // abonelikte: EXPIRED + dönem bitişi. Idempotent (refundedAt işareti).
        if (transactionId) await this.applyRefund(transactionId, platform);
        return;
      case 'REFUND_REVERSED':
        // İade geri alındı: abonelik hakkı dönem bitişine kadar yeniden açılır.
        // Kredi paketinde clawback tersine çevrilmez (ledger REFUND kalır);
        // operasyon gerektiğinde GRANT ile manuel düzeltme yapar (denetimli).
        if (originalTransactionId) {
          await this.subscriptions.markResumed(originalTransactionId, expiresAt);
        }
        return;

      // --- Hesap aktarımı (Geri Yükleme / cihaz değişimi) ---------------------
      // TRANSFER yukarıda app_user_id şartından önce ele alınır (F7-05).

      default:
        // Bilinmeyen RC olay tipi: kayda geçti, hataya düşmez (ileri uyum).
        return;
    }
  }

  /**
   * Hak kazandıran RC olayını iç üretime aktarır:
   * ürün Plan'a çözümlenirse abonelik, CreditPack'e çözümlenirse kredi paketi
   * işlenir (ikisi de UNIQUE işlem kimliğiyle idempotent — Güvenlik-3/5).
   * Bilinmeyen ürün: FAILED (operasyon görür — sessiz kayıp yok).
   */
  private async applyStoreGrant(args: {
    appUserId: string;
    platform: 'IOS' | 'ANDROID';
    productId: string;
    storeTransactionId: string;
    storeOriginalTransactionId?: string;
    expiresAt?: Date;
    periodType: 'NORMAL' | 'TRIAL' | 'INTRO';
  }): Promise<void> {
    const user = await this.resolveUserById(args.appUserId);

    const plan = await this.subscriptions.findPlanByProductId(args.productId);
    if (plan) {
      await this.subscriptions.activateFromPurchase({
        userId: user.id,
        platform: args.platform,
        planCode: plan.code,
        productId: args.productId,
        storeTransactionId: args.storeTransactionId,
        storeOriginalTransactionId: args.storeOriginalTransactionId,
        periodEndOverride: args.expiresAt,
        periodType: args.periodType,
      });
      return;
    }

    const pack = await this.findCreditPackByProductId(args.productId);
    if (pack) {
      await this.credits.purchasePack({
        userId: user.id,
        packCode: pack.code,
        platform: args.platform,
        storeTransactionId: args.storeTransactionId,
        storeOriginalTransactionId: args.storeOriginalTransactionId,
      });
      return;
    }

    throw new Error(`RC ürünü DB'de çözümlenemedi: ${args.productId}`);
  }

  /**
   * TRANSFER: RC, satın alma ailesini yeni app_user_id'ye taşır (cihaz
   * değişimi / restore). İşlemler ve açık abonelik yeni sahibine yazılır.
   * Not (raporda belgeli sınırlama): kredi ledger/cüzdan kaynak kullanıcıda
   * kalır; açılmış bölümler ve abonelik hakkı yeni sahibine geçer.
   */
  private async applyTransfer(event: Record<string, unknown>): Promise<void> {
    const toUserIds = Array.isArray(event.transferred_to) ? event.transferred_to : [];
    const toAppUserId = typeof toUserIds[0] === 'string' ? toUserIds[0] : undefined;
    const fromUserIds = Array.isArray(event.transferred_from) ? event.transferred_from : [];
    const fromAppUserId = typeof fromUserIds[0] === 'string' ? fromUserIds[0] : undefined;
    const originalTransactionId =
      typeof event.original_transaction_id === 'string' && event.original_transaction_id.length > 0
        ? event.original_transaction_id
        : typeof event.transaction_id === 'string'
          ? event.transaction_id
          : undefined;
    if (!toAppUserId || !originalTransactionId) return;
    const toUser = await this.resolveUserById(toAppUserId);
    void fromAppUserId;

    await this.prisma.$transaction(async (tx) => {
      await tx.storeTransaction.updateMany({
        where: {
          OR: [{ storeOriginalTransactionId: originalTransactionId }, { storeTransactionId: originalTransactionId }],
        },
        data: { userId: toUser.id },
      });
      await tx.subscription.updateMany({
        where: { storeOriginalTransactionId: originalTransactionId },
        data: { userId: toUser.id },
      });
      await tx.episodeUnlock.updateMany({
        where: { storeTransaction: { storeOriginalTransactionId: originalTransactionId } },
        data: { userId: toUser.id },
      });
    });
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
          // Kusur F7-03: hediye (granted) payı için de kalan bakiye üst sınırı
          // zorunludur — harcanan hediye kredi geri istenirse ledger negatife
          // düşer ve iade webhook'u FAILED olurdu. Kural: toplam clawback
          // kalan toplam bakiyeyi aşamaz; satın alınan pay önce, eksik kalan
          // kısım kalan hediye bakiyeden tamamlanır.
          const wallet = await tx.creditWallet.findUnique({ where: { userId: storeTx.userId } });
          const purchasedAvailable = Math.max(wallet?.purchasedBalance ?? 0, 0);
          const grantedAvailable = Math.max(wallet?.grantedBalance ?? 0, 0);
          const pack = await tx.creditPack.findUnique({ where: { code: storeTx.productId } });
          const purchasedPart = pack?.credits ?? 0;
          const grantPart = pack?.bonusCredits ?? 0;
          const remainingTotal = purchasedAvailable + grantedAvailable;
          const wantedTotal = purchasedPart + grantPart;
          const refundTotal = Math.min(wantedTotal, remainingTotal);
          const refundPurchased = Math.min(purchasedPart, purchasedAvailable);
          const refundGranted = Math.min(Math.max(refundTotal - refundPurchased, 0), grantedAvailable);

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

  // ==========================================================================
  // Satın alma doğrulaması (istemci istekli — Güvenlik-1)
  // ==========================================================================

  /**
   * İstemciden gelen satın alma doğrulama isteği. Sağlayıcı devrede değilse
   * 503 döner (sahte başarı yok — Güvenlik-9); RC sağlayıcısında istemci
   * beyanı sağlayıcı ters sorgusuyla doğrulanır; simülasyon yalnızca
   * geliştirmede kabul edilir.
   */
  async validatePurchase(userId: string, dto: {
    platform: 'IOS' | 'ANDROID';
    productType: 'SUBSCRIPTION' | 'CREDIT_PACK';
    productId: string;
    storeTransactionId: string;
    storeOriginalTransactionId?: string;
    appUserId?: string;
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
    if (!this.provider.configured) {
      throw new DomainError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        messageKey: 'errors.billingNotConfigured',
        reason: 'BILLING_NOT_CONFIGURED',
      });
    }
    // appUserId verilmişse istek sahibiyle aynı olmalı (başkasının satın
    // almasını validate edemez — Güvenlik-10 benzeri kimlik kuralı).
    if (dto.appUserId && dto.appUserId !== userId) {
      throw DomainError.forbidden('APP_USER_MISMATCH', 'errors.appUserMismatch');
    }

    let verified: VerifiedStorePurchase | null;
    try {
      verified = await this.provider.verifyPurchase({
        appUserId: userId,
        platform: dto.platform,
        productType: dto.productType,
        productId: dto.productId,
        transactionId: dto.storeTransactionId,
      });
    } catch (error) {
      // Sağlayıcıya erişilemedi: doğrulama BAŞARISIZ (fail-closed).
      this.logger.error(`Sağlayıcı doğrulaması hata verdi: ${error instanceof Error ? error.message : error}`);
      throw new DomainError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        messageKey: 'errors.billingProviderUnreachable',
        reason: 'BILLING_PROVIDER_UNREACHABLE',
      });
    }
    if (!verified) {
      throw DomainError.badRequest('PURCHASE_VERIFICATION_FAILED', 'errors.purchaseVerificationFailed');
    }
    // Üretimde sandbox satın alma işlenmez.
    if (verified.environment === 'SANDBOX' && this.env.NODE_ENV === 'production') {
      throw DomainError.badRequest('SANDBOX_PURCHASE_REJECTED', 'errors.sandboxPurchaseRejected');
    }

    if (dto.productType === 'CREDIT_PACK') {
      // Mağaza ürün kimliği iç paket koduna çözümlenir (RC product_id → code).
      const pack = await this.findCreditPackByProductId(verified.productId);
      const result = await this.credits.purchasePack({
        userId,
        packCode: pack?.code ?? verified.productId,
        platform: verified.platform,
        storeTransactionId: verified.storeTransactionId,
        storeOriginalTransactionId: verified.storeOriginalTransactionId,
        priceKurus: dto.priceKurus,
        currency: dto.currency,
        purchaseToken: dto.purchaseToken,
      });
      return { ...result, productType: 'CREDIT_PACK' };
    }

    // Abonelik: mağaza ürünü plana çözümlenir; çözümlenemezse istemci
    // ürünü yanlış bildiriyor demektir (doğrulama yüzünden PLAN_NOT_FOUND).
    const plan = await this.subscriptions.findPlanByProductId(verified.productId);
    const result = await this.subscriptions.activateFromPurchase({
      userId,
      platform: verified.platform,
      planCode: plan?.code ?? dto.productId,
      productId: verified.productId,
      storeTransactionId: verified.storeTransactionId,
      storeOriginalTransactionId: verified.storeOriginalTransactionId,
      priceKurus: dto.priceKurus,
      currency: dto.currency,
      purchaseToken: dto.purchaseToken,
      periodEndOverride: verified.expiresAt ?? undefined,
      periodType: verified.periodType,
    });
    return { ...result, productType: 'SUBSCRIPTION' };
  }

  // ==========================================================================
  // Ürün yapılandırması ve entitlement senkronu
  // ==========================================================================

  /** GET /billing/config — sağlayıcı durumu + mağaza ürün kimlikleri. */
  async getBillingConfig() {
    const [plans, packs] = await Promise.all([
      this.prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.creditPack.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    const configured = this.isBillingConfigured;
    return {
      provider: this.env.BILLING_PROVIDER,
      configured,
      revenuecat:
        this.env.BILLING_PROVIDER === 'revenuecat'
          ? { publicSdkKey: this.env.REVENUECAT_PUBLIC_SDK_KEY ?? null }
          : undefined,
      // Mağazada yapılandırılmış ürün kimliği olmayan plan/paketler RC akışına
      // giremez — yapılandırma tamamlanana kadar listede gönderilmez.
      subscriptionProducts: plans
        .filter((plan) => plan.platformProductIdIos && plan.platformProductIdAndroid)
        .map((plan) => ({
          planId: plan.code,
          billingPeriod: plan.billingPeriod,
          trialDays: plan.trialDays,
          productIds: {
            ios: plan.platformProductIdIos!,
            android: plan.platformProductIdAndroid!,
          },
        })),
      creditPackProducts: packs
        .filter((pack) => pack.platformProductIdIos && pack.platformProductIdAndroid)
        .map((pack) => ({
          packId: pack.code,
          productIds: {
            ios: pack.platformProductIdIos!,
            android: pack.platformProductIdAndroid!,
          },
        })),
    };
  }

  /**
   * POST /billing/entitlements/sync — mağaza/RC durumunu sunucuyla eşitler:
   *  - abonelik: sağlayıcıdaki aktif dönem DB'ye yazılır (durum, dönem bitişi,
   *    otomatik yenileme); sağlayıcıda abonelik yoksa açık DB kayıtları
   *    EXPIRED yapılır (durum eşitleme);
   *  - kredi paketleri: DB'de kaydı olmayan non-subscription satın almalar
   *    idempotent purchasePack ile cüzdana işlenir (Geri Yükleme).
   * Simülasyon sağlayıcıda senkron boş duruma sahiptir (etkisiz) — sahte
   * durum ÜRETİLMEZ.
   */
  async syncEntitlements(userId: string, platform: 'IOS' | 'ANDROID') {
    // Kusur F7-06: sağlayıcıya erişilemezse senkron da doğrulama gibi
    // FAIL-CLOSED olmalı — 500 yerine anlaşılır 503 döner (validate ile
    // aynı sözleşme), sahte "senkronlandı" yanıtı üretilmez.
    let state: ProviderSubscriberState | null;
    try {
      state = await this.provider.fetchSubscriberState(userId);
    } catch (error) {
      this.logger.error(`Entitlement senkronu sağlayıcıya erişemedi: ${error instanceof Error ? error.message : error}`);
      throw new DomainError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        messageKey: 'errors.billingProviderUnreachable',
        reason: 'BILLING_PROVIDER_UNREACHABLE',
      });
    }
    const syncedAt = new Date().toISOString();

    // Abonelik senkronu: sağlayıcıdaki en uygun aktif dönem seçilir.
    const now = Date.now();
    const activeSubs = (state?.subscriptions ?? [])
      .filter((sub) => sub.expiresAt && sub.expiresAt.getTime() > now)
      .filter((sub) => !(this.env.NODE_ENV === 'production' && sub.sandbox))
      .sort((a, b) => (b.expiresAt?.getTime() ?? 0) - (a.expiresAt?.getTime() ?? 0));
    const best = activeSubs[0];

    let status: 'NONE' | 'TRIALING' | 'ACTIVE' | 'GRACE_PERIOD' = 'NONE';
    let planId: string | null = null;
    let autoRenew = false;
    let currentPeriodEnd: string | null = null;

    if (best) {
      const plan = await this.subscriptions.findPlanByProductId(best.productId);
      if (plan) {
        planId = plan.code;
        status = best.inGrace ? 'GRACE_PERIOD' : best.periodType === 'TRIAL' || best.periodType === 'INTRO' ? 'TRIALING' : 'ACTIVE';
        autoRenew = best.willRenew;
        currentPeriodEnd = best.expiresAt!.toISOString();
        // DB'de açık kayıt varsa güncelle; yoksa senkron satırı oluştur
        // (restore durumunda webhook henüz gelmemiş olabilir).
        const open = await this.prisma.subscription.findFirst({
          where: {
            userId,
            status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'ON_HOLD'] },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (open) {
          await this.prisma.subscription.update({
            where: { id: open.id },
            data: {
              status,
              autoRenew,
              currentPeriodEnd: best.expiresAt!,
              planId: plan.id,
              platform,
            },
          });
        } else {
          await this.prisma.subscription.create({
            data: {
              userId,
              planId: plan.id,
              platform,
              status,
              autoRenew,
              currentPeriodStart: new Date(),
              currentPeriodEnd: best.expiresAt!,
              storeOriginalTransactionId: best.productId,
              productId: best.productId,
            },
          });
        }
      }
    } else if (state) {
      // Sağlayıcı abonelik bildirmiyor: DB'deki açık kayıtları kapat (eşitleme).
      await this.prisma.subscription.updateMany({
        where: { userId, status: { in: ['TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'ON_HOLD'] } },
        data: { status: 'EXPIRED', autoRenew: false, expiresAt: new Date() },
      });
    }

    // Kredi paketi geri yükleme: DB'de kaydı olmayan non-subscription satın
    // almaları idempotent işle (Güvenlik-3: UNIQUE işlem kimliği korur).
    const seen = new Set<string>();
    for (const purchase of state?.nonSubscriptions ?? []) {
      if (this.env.NODE_ENV === 'production' && purchase.sandbox) continue;
      if (!purchase.transactionId || seen.has(purchase.transactionId)) continue;
      seen.add(purchase.transactionId);
      const known = await this.prisma.storeTransaction.findUnique({
        where: {
          platform_storeTransactionId: {
            platform,
            storeTransactionId: purchase.transactionId,
          },
        },
      });
      if (known) continue;
      const pack = await this.findCreditPackByProductId(purchase.productId);
      if (!pack) continue;
      await this.credits.purchasePack({
        userId,
        packCode: pack.code,
        platform,
        storeTransactionId: purchase.transactionId,
        storeOriginalTransactionId: purchase.transactionId,
      });
    }
    const walletRow = await this.prisma.creditWallet.findUnique({ where: { userId } });
    const wallet = {
      purchased: walletRow?.purchasedBalance ?? 0,
      granted: walletRow?.grantedBalance ?? 0,
      total: (walletRow?.purchasedBalance ?? 0) + (walletRow?.grantedBalance ?? 0),
    };

    return {
      syncedAt,
      subscription: {
        status,
        planId,
        autoRenew,
        currentPeriodEnd,
        willRenew: autoRenew,
        periodType: best?.periodType ?? null,
      },
      wallet,
    };
  }

  // ==========================================================================
  // Okuma uçları ve yardımcılar
  // ==========================================================================

  private async resolveUser(userId: string, email: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: userId }, { email: email.toLowerCase() }] },
      select: { id: true },
    });
    if (!user) throw new Error(`Webhook kullanıcısı bulunamadı: ${userId}/${email}`);
    return user;
  }

  private async resolveUserById(appUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: appUserId },
      select: { id: true },
    });
    if (!user) throw new Error(`RC app_user_id kullanıcıya eşlenemedi: ${appUserId}`);
    return user;
  }

  private async findCreditPackByProductId(productId: string) {
    return this.prisma.creditPack.findFirst({
      where: {
        isActive: true,
        OR: [{ platformProductIdIos: productId }, { platformProductIdAndroid: productId }],
      },
    });
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

  /** Genel zarf webhook imzası (X-PerdeGo-Signature: HMAC-SHA256). */
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

/** Sunucunun işlediği RC olay tipi kümesi. */
const REVENUECAT_EVENTS = new Set<string>([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'NON_RENEWING_PURCHASE',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED',
  'REFUND',
  'REFUND_REVERSED',
  'TRANSFER',
  'TEST',
]);
