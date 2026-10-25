/**
 * Kredi uçları:
 *   GET  /credits/wallet      → cüzdan (mobil sözleşmesi; abonelik durumuyla)
 *   GET  /credits/balance     → bakiye (API_CONTRACT §6)
 *   GET  /credits/transactions→ ledger geçmişi (salt okunur)
 *   POST /credits/unlock/:episodeId → krediyle bölüm açma (tek transaction)
 *   GET  /credits/packages    → aktif kredi paketleri (anonim)
 */
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  pageRequestSchema,
  unlockRequestSchema,
  type UnlockRequest,
  type UnlockResponse,
  type WalletResponse,
  type WalletTransactionsResponse,
  type CreditPacksResponse,
  type CreditBalanceResponse,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, parseQuery } from '../common/zod-validation.pipe';
import {
  CurrentLang,
  CurrentUser,
  type Lang,
  type RequestUser,
} from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from './credits.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { BillingService } from '../billing/billing.service';

@ApiTags('credits')
@Controller('credits')
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('wallet')
  @ApiOperation({ summary: 'Cüzdan bakiyesi + abonelik durumu (mobil sözleşmesi)' })
  async wallet(@CurrentUser() user: RequestUser): Promise<WalletResponse> {
    const [wallet, subscriptionStatus] = await Promise.all([
      this.credits.getWallet(user.id),
      this.subscriptions.walletStatus(user.id),
    ]);
    const current = await this.subscriptions.getCurrent(user.id);
    return {
      wallet: {
        userId: user.id,
        creditBalance: wallet.total,
        purchasedCredits: wallet.purchased,
        grantedCredits: wallet.granted,
        subscriptionStatus,
        subscriptionRenewsAt: current?.currentPeriodEnd?.toISOString() ?? null,
      },
    };
  }

  @Get('balance')
  @ApiOperation({ summary: 'Bakiye (purchased + granted + total)' })
  async balance(@CurrentUser() user: RequestUser): Promise<CreditBalanceResponse> {
    const wallet = await this.credits.getWallet(user.id);
    const nextGrant = await this.prisma.creditLedger.findFirst({
      where: {
        userId: user.id,
        type: 'GRANT',
        expiresAt: { not: null, gt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      select: { expiresAt: true },
    });
    return {
      purchased: wallet.purchased,
      granted: wallet.granted,
      total: wallet.total,
      nextExpiry: nextGrant?.expiresAt?.toISOString() ?? null,
    };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Cüzdan hareketleri (ledger, salt okunur)' })
  async transactions(
    @CurrentUser() user: RequestUser,
    @Query() query: unknown,
    @CurrentLang() lang: Lang,
  ): Promise<WalletTransactionsResponse> {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    const result = await this.credits.listTransactions(user.id, page, pageSize, lang);
    return {
      items: result.items.map((row) => ({
        id: row.id,
        // Ledger tipi → sözleşme kind karşılığı.
        kind:
          row.type === 'PURCHASE'
            ? ('CREDIT_PURCHASE' as const)
            : row.type === 'UNLOCK_SPEND'
              ? ('EPISODE_UNLOCK' as const)
              : (row.type as 'GRANT' | 'REFUND' | 'ADJUSTMENT' | 'EXPIRY'),
        amount: row.delta,
        balanceAfter: row.balanceAfter,
        createdAt: row.createdAt,
        label: row.label,
      })),
    };
  }

  @Post('unlock/:episodeId')
  @ApiOperation({ summary: 'Krediyle bölüm açma (atomik; idempotent)' })
  async unlock(
    @CurrentUser() user: RequestUser,
    @Req() _req: Request,
    @Param('episodeId') episodeId: string,
    @Body(new ZodValidationPipe(unlockRequestSchema)) _dto: UnlockRequest,
  ): Promise<UnlockResponse> {
    const result = await this.credits.unlockEpisode(user.id, episodeId);
    return {
      unlocked: result.unlocked,
      alreadyUnlocked: result.alreadyUnlocked,
      balance: result.wallet,
      ledgerId: result.ledgerId,
    };
  }

  @Get('packages')
  @ApiOperation({ summary: 'Aktif kredi paketleri' })
  async packages(): Promise<CreditPacksResponse> {
    return this.billing.listCreditPacks();
  }
}
