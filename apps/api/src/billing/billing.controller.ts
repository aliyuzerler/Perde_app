/**
 * Billing uçları (API_CONTRACT §5, §8):
 *   GET  /billing/products        → aktif planlar + kredi paketleri (anonim)
 *   GET  /billing/subscription    → mevcut abonelik durumu (access)
 *   POST /billing/purchases/validate → mağaza doğrulama (access, Idempotency-Key)
 *   GET  /billing/purchases       → mağaza işlem geçmişi (access)
 *   POST /billing/webhooks        → sağlayıcı olayları (anonim, imzalı)
 */
import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import {
  pageRequestSchema,
  purchaseValidateResponseSchema,
  purchaseValidateSchema,
  webhookIngestSchema,
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
  @ApiOperation({ summary: 'Mağaza satın almasını sunucuda doğrula (idempotent)' })
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
}

/** purchaseValidateResponseSchema — şema referansı (swagger için kayıt). */
export const _swaggerRefs = [purchaseValidateResponseSchema];
