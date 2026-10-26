/**
 * Billing uçları (API_CONTRACT §5, §8):
 *   GET  /billing/products        → aktif planlar + kredi paketleri (anonim)
 *   GET  /billing/config          → sağlayıcı durumu + mağaza ürün kimlikleri (anonim)
 *   GET  /billing/subscription    → mevcut abonelik durumu (access)
 *   POST /billing/purchases/validate → sağlayıcı doğrulamalı satın alma (access, Idempotency-Key)
 *   POST /billing/entitlements/sync  → mağaza durumu eşitleme / geri yükleme (access)
 *   GET  /billing/purchases       → mağaza işlem geçmişi (access)
 *   POST /billing/webhooks        → genel olay zarfı (anonim, HMAC imzalı)
 *   POST /billing/webhooks/revenuecat → RevenueCat olayları (anonim, Bearer sırrı)
 */
import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import {
  pageRequestSchema,
  purchaseValidateResponseSchema,
  purchaseValidateSchema,
  webhookIngestSchema,
  entitlementSyncRequestSchema,
  type BillingConfigResponse,
  type EntitlementSyncRequest,
  type EntitlementSyncResponse,
  type PurchaseValidate,
  type PurchaseValidateResponse,
  type StoreTransactionListResponse,
  type WebhookIngest,
  type WebhookIngestResponse,
  type PlansResponse,
  type CreditPacksResponse,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, parseQuery } from '../common/zod-validation.pipe';
import {
  CurrentUser,
  type RequestUser,
} from '../common/request-context';
import { Public } from '../auth/guards';
import { BillingService } from './billing.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { DomainError } from '../common/errors';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly subscriptions: SubscriptionsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Aktif planlar + kredi paketleri' })
  async products(): Promise<PlansResponse & CreditPacksResponse> {
    const [plans, packs] = await Promise.all([
      this.subscriptions.listPlans(),
      this.billing.listCreditPacks(),
    ]);
    return { ...plans, ...packs };
  }

  @Public()
  @Get('config')
  @ApiOperation({ summary: 'Ödeme sağlayıcı durumu + mağaza ürün kimlikleri' })
  async config(): Promise<BillingConfigResponse> {
    return this.billing.getBillingConfig();
  }

  @Get('subscription')
  @ApiOperation({ summary: 'Mevcut abonelik durumu' })
  async subscription(@CurrentUser() user: RequestUser) {
    const current = await this.subscriptions.getCurrent(user.id);
    const entitlement = await this.subscriptions.hasEntitlement(user.id);
    if (!current) {
      return { status: 'NONE', plan: null, autoRenew: false, currentPeriodEnd: null, entitlement };
    }
    return {
      status: current.status,
      plan: { id: current.plan.code, name: current.plan.titleTr, billingPeriod: current.plan.billingPeriod },
      autoRenew: current.autoRenew,
      currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null,
      entitlement,
    };
  }

  @Post('purchases/validate')
  @ApiOperation({ summary: 'Mağaza satın almasını sağlayıcıyla doğrula (idempotent)' })
  async validatePurchase(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Body(new ZodValidationPipe(purchaseValidateSchema)) dto: PurchaseValidate,
  ): Promise<PurchaseValidateResponse> {
    // BR-06: para hareketli POST'ta Idempotency-Key zorunlu.
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.idempotencyKeyRequired', {
        fields: [{ path: 'Idempotency-Key', message: 'Header zorunludur (min 8 karakter)' }],
      });
    }
    return this.idempotency.run({
      scope: 'billing.validate',
      key: key.slice(0, 128),
      userId: user.id,
      endpoint: 'POST /billing/purchases/validate',
      requestHash: createHash('sha256').update(JSON.stringify(dto)).digest('hex'),
      fn: () => this.billing.validatePurchase(user.id, dto),
    });
  }

  @Post('entitlements/sync')
  @ApiOperation({ summary: 'Mağaza abonelik/kredi durumunu sunucuyla eşitle (geri yükleme)' })
  async syncEntitlements(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(entitlementSyncRequestSchema)) dto: EntitlementSyncRequest,
  ): Promise<EntitlementSyncResponse> {
    return this.billing.syncEntitlements(user.id, dto.platform);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'Mağaza işlem geçmişi' })
  async purchases(
    @CurrentUser() user: RequestUser,
    @Query() query: unknown,
  ): Promise<StoreTransactionListResponse> {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    return this.billing.listTransactions(user.id, page, pageSize);
  }

  @Public()
  @Post('webhooks')
  @HttpCode(202)
  @ApiOperation({ summary: 'Ödeme sağlayıcısı webhook alımı (idempotent, 202)' })
  async webhooks(
    @Req() req: Request,
    @Body(new ZodValidationPipe(webhookIngestSchema)) dto: WebhookIngest,
  ): Promise<WebhookIngestResponse> {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? JSON.stringify(dto);
    const signatureValid = this.billing.verifySignature(
      rawBody,
      req.headers['x-perdego-signature'] as string | undefined,
    );
    const result = await this.billing.ingestWebhook({ ...dto, signatureValid });
    return result;
  }

  @Public()
  @Post('webhooks/revenuecat')
  @HttpCode(202)
  @ApiOperation({ summary: 'RevenueCat webhook alımı (Bearer sırrı, idempotent, 202)' })
  async revenueCatWebhooks(@Req() req: Request): Promise<WebhookIngestResponse> {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
    // RC Authorization başlığı bootstrap'ta guard'dan önce rcAuthorization'a
    // taşınır (JWT guard çakışması — bootstrap.ts açıklamasına bakın).
    const rcAuth = (req as Request & { rcAuthorization?: string }).rcAuthorization;
    return this.billing.ingestRevenueCatWebhook({
      rawBody,
      headers: { authorization: rcAuth },
    });
  }
}

/** purchaseValidateResponseSchema — şema referansı (swagger için kayıt). */
export const _swaggerRefs = [purchaseValidateResponseSchema];
