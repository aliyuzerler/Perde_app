/**
 * Admin servisi: denetim günlüğü, kredi düzeltmesi (F-54), içerik taslağı
 * oluşturma ve yayın. Tüm eylemler audit_logs'a yazılır; kredi düzeltmesi
 * ledger ADJUSTMENT/GRANT kaydıyla cüzdanı yeniden türetir (Kural 1).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import { buildPageMeta } from '../common/pagination';
import { AuditService } from '../audit/audit.service';
import { CreditsService } from '../credits/credits.service';

export interface CreditAdjustInput {
  targetUserId: string;
  purchasedDelta: number;
  grantedDelta: number;
  note: string;
  actorUserId: string;
  ipHash?: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly audit: AuditService,
  ) {}

  /** Kredi düzeltmesi: tek transaction — ledger + cüzdan + audit (BR-04). */
  async adjustCredits(input: CreditAdjustInput) {
    if (input.purchasedDelta === 0 && input.grantedDelta === 0) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'delta', message: 'En az biri nonzero olmalıdır' }],
      });
    }

    const target = await this.prisma.user.findUnique({ where: { id: input.targetUserId } });
    if (!target) {
      throw DomainError.notFound('RECORD_NOT_FOUND', 'errors.notFound', { userId: input.targetUserId });
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.creditWallet.findUnique({ where: { userId: input.targetUserId } });

      const type = input.purchasedDelta > 0 || input.grantedDelta > 0 ? 'GRANT' : 'ADJUSTMENT';
      const ledgerId = await this.credits.appendLedgerAndRecompute(tx, {
        userId: input.targetUserId,
        type,
        purchasedDelta: input.purchasedDelta,
        grantedDelta: input.grantedDelta,
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId: input.actorUserId,
        note: input.note,
      });

      const after = await tx.creditWallet.findUniqueOrThrow({ where: { userId: input.targetUserId } });
      await this.audit.log(
        {
          actorUserId: input.actorUserId,
          action: 'CREDIT_ADJUSTMENT',
          entityType: 'user',
          entityId: input.targetUserId,
          before: before
            ? { purchased: before.purchasedBalance, granted: before.grantedBalance }
            : { purchased: 0, granted: 0 },
          after: { purchased: after.purchasedBalance, granted: after.grantedBalance, ledgerId },
          ipHash: input.ipHash,
        },
        tx as Prisma.TransactionClient,
      );

      return {
        userId: input.targetUserId,
        ledgerId,
        wallet: { purchased: after.purchasedBalance, granted: after.grantedBalance },
      };
    });
  }

  /** İçerik taslağı oluşturur (Kural 6: taslak herkese açık uçlarda görünmez). */
  async createContent(
    dto: {
      slug: string;
      kind: 'FILM' | 'SERIES' | 'SHORT_FILM';
      seriesFormat?: 'STANDARD' | 'MINI';
      titleTr: string;
      titleEn: string;
      synopsisTr: string;
      synopsisEn: string;
      releaseYear: number;
      ageRating?: string;
      accessType?: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
      categorySlugs?: string[];
    },
    actorUserId: string,
  ) {
    const exists = await this.prisma.content.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (exists) {
      throw DomainError.conflict('SLUG_CONFLICT', 'errors.slugConflict', { slug: dto.slug });
    }
    if (dto.kind === 'SERIES' && !dto.seriesFormat) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'seriesFormat', message: 'SERIES için seriesFormat zorunludur' }],
      });
    }

    const content = await this.prisma.content.create({
      data: {
        slug: dto.slug,
        kind: dto.kind,
        seriesFormat: dto.seriesFormat,
        titleTr: dto.titleTr,
        titleEn: dto.titleEn,
        synopsisTr: dto.synopsisTr,
        synopsisEn: dto.synopsisEn,
        releaseYear: dto.releaseYear,
        ageRating: dto.ageRating,
        accessType: dto.accessType ?? 'FREE',
        status: 'DRAFT',
        createdById: actorUserId,
        ...(dto.categorySlugs?.length
          ? {
              categories: {
                create: dto.categorySlugs.map((slug) => ({ category: { connect: { slug } } })),
              },
            }
          : {}),
      },
    });

    await this.audit.log({
      actorUserId,
      action: 'CONTENT_CREATE',
      entityType: 'content',
      entityId: content.id,
      after: { slug: content.slug, status: content.status },
    });
    return content;
  }

  /** Yayına alma: status=PUBLISHED + publishedAt. */
  async publishContent(contentId: string, actorUserId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      include: { episodes: { select: { id: true, status: true } } },
    });
    if (!content) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentId });
    }

    const publishedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.content.update({
        where: { id: contentId },
        data: { status: 'PUBLISHED', publishedAt },
      });
      // Taslak bölümler de yayına alınır (içerik yayını bütünseldir).
      await tx.episode.updateMany({
        where: { contentId, status: { in: ['DRAFT'] } },
        data: { status: 'PUBLISHED', publishedAt },
      });
      return row;
    });

    await this.audit.log({
      actorUserId,
      action: 'CONTENT_PUBLISH',
      entityType: 'content',
      entityId: contentId,
      before: { status: content.status },
      after: { status: updated.status, episodeCount: content.episodes.length },
    });
    return updated;
  }

  /** Denetim günlüğü listesi (sayfalı). */
  async listAuditLogs(page: number, pageSize: number, filters?: { entityType?: string; entityId?: string }) {
    const { rows, total } = await this.audit.list(page, pageSize, filters);
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.beforeJson ?? null,
        after: row.afterJson ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPageMeta(page, pageSize, total),
    };
  }

  /** Kullanıcı listesi (admin arama görünümü; PII minimum). */
  async listUsers(page: number, pageSize: number, search?: string) {
    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          status: true,
          locale: true,
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows, meta: buildPageMeta(page, pageSize, total) };
  }
}
