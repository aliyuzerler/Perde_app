/**
 * Kredi cüzdanı ve bölüm açma servisi (Faz 2b).
 *
 * Kritik iş kuralları (görev gereksinimleri 1, 3, 4):
 *  1. Cüzdan bakiyeleri credit_ledger toplamından hesaplanır; credit_wallets
 *     yalnızca önbellektir ve her yazımda ledger'dan yeniden türetilir.
 *  3. Aynı bölümün tekrar açılması ikinci kez kredi düşmez: DB düzeyinde
 *     UNIQUE(user_id, episode_id) + erken dönüş (alreadyUnlocked).
 *  4. Kredi düşme + bölüm açma hakkı tanımlama + cüzdan güncellemesi TEK
 *     veritabanı transaction'ı içinde ve cüzdan satırı FOR UPDATE ile
 *     kilitlenerek yapılır.
 *
 * Harcama sırası: önce GRANT (expiresAt'lı hediye kredi — kullanılmazsa
 * kaybolur), ardından satın alınan kredi harcanır (kullanıcı lehine).
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { buildPageMeta } from '../common/pagination';
import type { Lang } from '../common/request-context';
import { pickLang } from '../common/request-context';

export interface UnlockResult {
  unlocked: boolean;
  alreadyUnlocked: boolean;
  wallet: { purchased: number; granted: number; total: number };
  ledgerId: string | null;
}

interface WalletRow {
  purchasedBalance: number;
  grantedBalance: number;
}

@Injectable()
export class CreditsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Cüzdan görünümü; satır yoksa sıfır bakiye döner (ledger kaynağıdır). */
  async getWallet(userId: string) {
    const wallet = await this.prisma.creditWallet.findUnique({ where: { userId } });
    return {
      purchased: wallet?.purchasedBalance ?? 0,
      granted: wallet?.grantedBalance ?? 0,
      total: (wallet?.purchasedBalance ?? 0) + (wallet?.grantedBalance ?? 0),
    };
  }

  /**
   * Cüzdan bakiyesini LEDGER toplamından yeniden hesaplar (Kural 1).
   * transaction içinde çağrılmalıdır.
   */
  private async recomputeWalletFromLedger(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<WalletRow> {
    const sums = await tx.creditLedger.aggregate({
      where: { userId },
      _sum: { purchasedDelta: true, grantedDelta: true },
    });
    const purchased = sums._sum.purchasedDelta ?? 0;
    const granted = sums._sum.grantedDelta ?? 0;
    if (purchased < 0 || granted < 0) {
      // Ledger tutarlıysa asla düşmez; CHECK kısıtlarından önce son savunma.
      throw new Error(`Ledger bakiyesi negatife düştü (user=${userId})`);
    }
    await tx.creditWallet.upsert({
      where: { userId },
      update: { purchasedBalance: purchased, grantedBalance: granted },
      create: { userId, purchasedBalance: purchased, grantedBalance: granted },
    });
    return { purchasedBalance: purchased, grantedBalance: granted };
  }

  // ---------------- Kredi paketi satın alma (mağaza doğrulama sonrası) -------

  /**
   * Mağaza doğrulamasından geçen satın almayı cüzdana işler.
   * - store_transactions UNIQUE(platform, storeTransactionId) → aynı dış
   *   işlem kimliği ikinci kez işlenmez (Kural 2); tekrar gelirse
   *   alreadyProcessed=true döner, yeni ledger yazılmaz.
   * - ledger PURCHASE satırı idempotencyKey ile de korunur.
   */
  async purchasePack(args: {
    userId: string;
    packCode: string;
    platform: 'IOS' | 'ANDROID';
    storeTransactionId: string;
    storeOriginalTransactionId?: string;
    priceKurus?: number;
    currency?: string;
    purchaseToken?: string;
  }): Promise<{
    storeTransactionId: string;
    alreadyProcessed: boolean;
    wallet: { purchased: number; granted: number };
  }> {
    const pack = await this.prisma.creditPack.findUnique({ where: { code: args.packCode } });
    if (!pack || !pack.isActive) {
      throw DomainError.notFound('PLAN_NOT_FOUND', 'errors.packNotFound', { packCode: args.packCode });
    }

    return this.prisma.$transaction(async (tx) => {
      // Kural 2: dış işlem kimliği bir kez işlenir.
      const dup = await tx.storeTransaction.findUnique({
        where: {
          platform_storeTransactionId: {
            platform: args.platform,
            storeTransactionId: args.storeTransactionId,
          },
        },
      });
      if (dup) {
        const wallet = await tx.creditWallet.findUnique({ where: { userId: args.userId } });
        return {
          storeTransactionId: dup.storeTransactionId,
          alreadyProcessed: true,
          wallet: {
            purchased: wallet?.purchasedBalance ?? 0,
            granted: wallet?.grantedBalance ?? 0,
          },
        };
      }

      const storeTx = await tx.storeTransaction.create({
        data: {
          userId: args.userId,
          platform: args.platform,
          productType: 'CREDIT_PACK',
          productId: pack.code,
          storeTransactionId: args.storeTransactionId,
          storeOriginalTransactionId: args.storeOriginalTransactionId,
          purchaseToken: args.purchaseToken,
          priceKurus: args.priceKurus ?? pack.priceKurus,
          currency: args.currency ?? pack.currency,
          purchaseState: 'PURCHASED',
          validatedAt: new Date(),
        },
      });

      await this.appendLedgerAndRecompute(tx, {
        userId: args.userId,
        type: 'PURCHASE',
        purchasedDelta: pack.credits,
        grantedDelta: pack.bonusCredits,
        referenceType: 'STORE_TRANSACTION',
        referenceId: storeTx.id,
        idempotencyKey: `purchase:${args.platform}:${args.storeTransactionId}`,
        expiresAt: null,
        note: null,
      });

      const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId: args.userId } });
      return {
        storeTransactionId: storeTx.storeTransactionId,
        alreadyProcessed: false,
        wallet: { purchased: wallet.purchasedBalance, granted: wallet.grantedBalance },
      };
    });
  }

  // ---------------- Bölüm açma (Kredi ile) -----------------------------------

  /**
   * Krediyle bölüm açma — TEK transaction (Kural 4):
   *   cüzdan FOR UPDATE → bakiye kontrolü → ledger UNLOCK_SPEND INSERT →
   *   episode_unlocks INSERT → cüzdanı ledger'dan yeniden hesapla.
   */
  async unlockEpisode(userId: string, episodeId: string): Promise<UnlockResult> {
    return this.prisma.$transaction(async (tx) => {
      const episode = await tx.episode.findUnique({
        where: { id: episodeId },
        include: { content: { select: { status: true } } },
      });
      if (!episode || episode.content.status !== 'PUBLISHED') {
        throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
      }
      if (episode.status !== 'PUBLISHED') {
        throw DomainError.conflict('EPISODE_NOT_READY', 'errors.episodeNotReady');
      }
      if (episode.accessType !== 'CREDIT' || !episode.creditCost) {
        throw DomainError.badRequest('VALIDATION_FAILED', 'errors.notCreditEpisode');
      }

      // Kural 3: zaten açılmış mı? (ayrıca DB unique kısıtı güvence)
      const existing = await tx.episodeUnlock.findUnique({
        where: { userId_episodeId: { userId, episodeId } },
      });
      const walletBefore = await this.lockWallet(tx, userId);
      if (existing) {
        return {
          unlocked: true,
          alreadyUnlocked: true,
          wallet: {
            purchased: walletBefore.purchasedBalance,
            granted: walletBefore.grantedBalance,
            total: walletBefore.purchasedBalance + walletBefore.grantedBalance,
          },
          ledgerId: existing.creditLedgerId,
        };
      }

      const cost = episode.creditCost;
      const total = walletBefore.purchasedBalance + walletBefore.grantedBalance;
      if (total < cost) {
        throw DomainError.paymentRequired('INSUFFICIENT_CREDITS', 'errors.insufficientCredits', {
          balance: total,
          creditCost: cost,
        });
      }

      // Harcama sırası: hediye (granted) önce — süresi biten önce kullanılır.
      const grantSpend = Math.min(walletBefore.grantedBalance, cost);
      const purchasedSpend = cost - grantSpend;

      const unlock = await tx.episodeUnlock.create({
        data: {
          // Prisma XOR kuralı: ilişki (connect) kullanıldığında tüm referanslar
          // checked varyantla bağlanır (scalar + relation karışımı geçersizdir).
          user: { connect: { id: userId } },
          episode: { connect: { id: episodeId } },
          source: 'CREDIT',
          creditLedger: {
            create: {
              user: { connect: { id: userId } },
              type: 'UNLOCK_SPEND',
              delta: -cost,
              purchasedDelta: -purchasedSpend,
              grantedDelta: -grantSpend,
              balanceAfterPurchased: 0,
              balanceAfterGranted: 0,
              referenceType: 'EPISODE_UNLOCK',
              referenceId: episodeId,
              idempotencyKey: `unlock:${userId}:${episodeId}`,
            },
          },
        },
        include: { creditLedger: true },
      });

      // Kural 1: cüzdanı ledger'dan yeniden hesapla (tek doğru kaynak).
      const walletAfter = await this.recomputeWalletFromLedger(tx, userId);

      // Denetim: balance_after_* alanlarını gerçek değerle tamamla.
      await tx.creditLedger.update({
        where: { id: unlock.creditLedgerId! },
        data: {
          balanceAfterPurchased: walletAfter.purchasedBalance,
          balanceAfterGranted: walletAfter.grantedBalance,
        },
      });

      return {
        unlocked: true,
        alreadyUnlocked: false,
        wallet: {
          purchased: walletAfter.purchasedBalance,
          granted: walletAfter.grantedBalance,
          total: walletAfter.purchasedBalance + walletAfter.grantedBalance,
        },
        ledgerId: unlock.creditLedgerId,
      };
    });
  }

  /** Ledger geçmişi (salt okunur görünüm — BR-04: append-only). */
  async listTransactions(userId: string, page: number, pageSize: number, lang: Lang) {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        delta: row.delta,
        purchasedDelta: row.purchasedDelta,
        grantedDelta: row.grantedDelta,
        balanceAfter: row.balanceAfterPurchased + row.balanceAfterGranted,
        note: row.note,
        label: this.ledgerLabel(row.type, lang),
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  private ledgerLabel(type: string, lang: Lang): string {
    const labels: Record<string, [string, string]> = {
      PURCHASE: ['Kredi satın alma', 'Credit purchase'],
      GRANT: ['Hediye kredi', 'Granted credits'],
      UNLOCK_SPEND: ['Bölüm açma', 'Episode unlock'],
      REFUND: ['İade', 'Refund'],
      ADJUSTMENT: ['Düzeltme', 'Adjustment'],
      EXPIRY: ['Kredi sona erme', 'Credit expiry'],
    };
    const pair = labels[type] ?? [type, type];
    return pickLang(lang, pair[0], pair[1]);
  }

  // ---------------- ortak yardımcılar ----------------------------------------

  /** Cüzdan satırını FOR UPDATE ile kilitler; yoksa sıfır bakiyeyle açar. */
  private async lockWallet(tx: Prisma.TransactionClient, userId: string): Promise<WalletRow> {
    await tx.creditWallet.upsert({
      where: { userId },
      update: {},
      create: { userId, purchasedBalance: 0, grantedBalance: 0 },
    });
    const rows = await tx.$queryRaw<Array<{ 'purchasedBalance': number; 'grantedBalance': number }>>`
      SELECT "purchasedBalance", "grantedBalance"
      FROM "credit_wallets"
      WHERE "userId" = ${userId}
      FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new Error(`Cüzdan satırı kilitlenemedi (user=${userId})`);
    return { purchasedBalance: row.purchasedBalance, grantedBalance: row.grantedBalance };
  }

  /** Ledger satırı ekler ve cüzdanı ledger'dan yeniden hesaplar. */
  async appendLedgerAndRecompute(
    tx: Prisma.TransactionClient,
    entry: {
      userId: string;
      type: 'PURCHASE' | 'GRANT' | 'REFUND' | 'ADJUSTMENT';
      purchasedDelta: number;
      grantedDelta: number;
      referenceType: 'STORE_TRANSACTION' | 'ADMIN_ADJUSTMENT' | 'SUBSCRIPTION' | 'WEBHOOK';
      referenceId?: string;
      idempotencyKey?: string;
      expiresAt?: Date | null;
      note?: string | null;
    },
  ): Promise<string> {
    const ledger = await tx.creditLedger.create({
      data: {
        userId: entry.userId,
        type: entry.type,
        delta: entry.purchasedDelta + entry.grantedDelta,
        purchasedDelta: entry.purchasedDelta,
        grantedDelta: entry.grantedDelta,
        balanceAfterPurchased: 0,
        balanceAfterGranted: 0,
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        idempotencyKey: entry.idempotencyKey,
        expiresAt: entry.expiresAt ?? null,
        note: entry.note ?? null,
      },
    });
    const wallet = await this.recomputeWalletFromLedger(tx, entry.userId);
    await tx.creditLedger.update({
      where: { id: ledger.id },
      data: {
        balanceAfterPurchased: wallet.purchasedBalance,
        balanceAfterGranted: wallet.grantedBalance,
      },
    });
    return ledger.id;
  }

  get playbackTtlSeconds(): number {
    return this.env.PLAYBACK_TTL_SECONDS;
  }
}
