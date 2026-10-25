/**
 * Admin servisi: denetim günlüğü, kredi düzeltmesi (F-54), içerik taslağı
 * oluşturma ve yayın. Tüm eylemler audit_logs'a yazılır; kredi düzeltmesi
 * ledger ADJUSTMENT/GRANT kaydıyla cüzdanı yeniden türetir (Kural 1).
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import { buildPageMeta, prismaSkipTake } from '../common/pagination';
import { AuditService } from '../audit/audit.service';
import { CreditsService } from '../credits/credits.service';
import type { ContentStatus } from '@perdego/contracts';
import { toContentSummary } from '../catalog/content-mapper';
import type { Lang } from '../common/request-context';
import { ENV } from '../config/env.module';
import { Inject } from '@nestjs/common';
import type { Env } from '../config/env.schema';

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
    @Inject(ENV) private readonly env: Env,
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

  // ---------------------------------------------------------------------------
  // Katalog yönetimi (Faz 2c): içerik yaşam döngüsü + ana sayfa düzeni
  // ---------------------------------------------------------------------------

  /**
   * İçerik yaşam döngüsü geçiş matrisi:
   *   DRAFT      → PROCESSING | PUBLISHED | ARCHIVED
   *   PROCESSING → DRAFT | PUBLISHED | ARCHIVED
   *   PUBLISHED  → DRAFT | ARCHIVED
   *   ARCHIVED   → DRAFT | PUBLISHED
   * Kural: kullanıcı uçları yalnızca PUBLISHED görür; DRAFT/PROCESSING/
   * ARCHIVED yalnızca bu yönetim görünümündedir (Kural 6).
   */
  private static readonly STATUS_TRANSITIONS: Record<ContentStatus, readonly ContentStatus[]> = {
    DRAFT: ['PROCESSING', 'PUBLISHED', 'ARCHIVED'],
    PROCESSING: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
    PUBLISHED: ['DRAFT', 'ARCHIVED'],
    ARCHIVED: ['DRAFT', 'PUBLISHED'],
  };

  /** Yönetim içerik listesi — TÜM durumlar (kullanıcı görünümünden fark budur). */
  async listTitles(
    params: { page: number; pageSize: number; status?: ContentStatus; kind?: string; search?: string },
    lang: Lang,
  ) {
    const where: Prisma.ContentWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.kind) where.kind = params.kind as Prisma.ContentWhereInput['kind'];
    if (params.search) {
      where.OR = [
        { titleTr: { contains: params.search, mode: 'insensitive' } },
        { titleEn: { contains: params.search, mode: 'insensitive' } },
        { slug: { contains: params.search.toLowerCase() } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: { categories: { include: { category: { select: { slug: true, sortOrder: true } } } } },
        ...prismaSkipTake(params.page, params.pageSize),
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...toContentSummary(row, lang, this.env.PUBLIC_BASE_URL),
        status: row.status,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      })),
      meta: buildPageMeta(params.page, params.pageSize, total),
    };
  }

  /** Durum değişikliği — geçiş matrisi denetimli, audit loglu. */
  async changeStatus(contentId: string, next: ContentStatus, actorUserId: string) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, slug: true, status: true, publishedAt: true },
    });
    if (!content) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentId });
    }

    const allowed = AdminService.STATUS_TRANSITIONS[content.status];
    if (!allowed.includes(next)) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [
          {
            path: 'status',
            message: `Geçersiz durum geçişi: ${content.status} → ${next}`,
          },
        ],
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.content.update({
        where: { id: contentId },
        data: {
          status: next,
          // Yayına ilk geçişte (veya arşivden dönüşte) yayın zamanı mühürlenir.
          publishedAt:
            next === 'PUBLISHED' && (content.status !== 'PUBLISHED' || !content.publishedAt)
              ? new Date()
              : content.publishedAt,
        },
      });
      // Yayına alma bütünseldir: taslak bölümler de yayınlanır (publishContent paritesi).
      if (next === 'PUBLISHED') {
        await tx.episode.updateMany({
          where: { contentId, status: 'DRAFT' },
          data: { status: 'PUBLISHED', publishedAt: row.publishedAt ?? new Date() },
        });
      }
      return row;
    });

    await this.audit.log({
      actorUserId,
      action: 'CONTENT_STATUS_CHANGE',
      entityType: 'content',
      entityId: contentId,
      before: { status: content.status },
      after: { status: updated.status, publishedAt: updated.publishedAt?.toISOString() ?? null },
    });

    return {
      id: updated.id,
      slug: updated.slug,
      status: updated.status,
      publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
    };
  }

  // ---------------- Banner yönetimi -------------------------------------------

  async listBanners() {
    const rows = await this.prisma.banner.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        titleTr: row.titleTr ?? '',
        titleEn: row.titleEn ?? '',
        subtitleTr: row.subtitleTr,
        subtitleEn: row.subtitleEn,
        imageUrl: row.imageUrl,
        targetContentId: row.targetContentId,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        startsAt: row.startsAt ? row.startsAt.toISOString() : null,
        endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      })),
    };
  }

  async createBanner(
    dto: {
      slug: string;
      titleTr: string;
      titleEn: string;
      subtitleTr?: string;
      subtitleEn?: string;
      imageUrl: string;
      targetContentId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    },
    actorUserId: string,
  ) {
    const exists = await this.prisma.banner.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (exists) {
      throw DomainError.conflict('SLUG_CONFLICT', 'errors.slugConflict', { slug: dto.slug });
    }
    if (dto.targetContentId) {
      await this.assertContentExists(dto.targetContentId);
    }
    const row = await this.prisma.banner.create({
      data: {
        slug: dto.slug,
        titleTr: dto.titleTr,
        titleEn: dto.titleEn,
        subtitleTr: dto.subtitleTr,
        subtitleEn: dto.subtitleEn,
        imageUrl: dto.imageUrl,
        targetContentId: dto.targetContentId ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'BANNER_CREATE',
      entityType: 'banner',
      entityId: row.id,
      after: { slug: row.slug, isActive: row.isActive },
    });
    return { ok: true as const, id: row.id };
  }

  async updateBanner(
    bannerId: string,
    dto: {
      titleTr?: string;
      titleEn?: string;
      subtitleTr?: string;
      subtitleEn?: string;
      imageUrl?: string;
      targetContentId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
      startsAt?: string | null;
      endsAt?: string | null;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.banner.findUnique({
      where: { id: bannerId },
      select: { id: true, isActive: true, sortOrder: true },
    });
    if (!before) {
      throw DomainError.notFound('BANNER_NOT_FOUND', 'errors.notFound', { bannerId });
    }
    if (dto.targetContentId) {
      await this.assertContentExists(dto.targetContentId);
    }
    await this.prisma.banner.update({
      where: { id: bannerId },
      data: {
        titleTr: dto.titleTr,
        titleEn: dto.titleEn,
        subtitleTr: dto.subtitleTr,
        subtitleEn: dto.subtitleEn,
        imageUrl: dto.imageUrl,
        targetContentId: dto.targetContentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
        startsAt: dto.startsAt === undefined ? undefined : dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt === undefined ? undefined : dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'BANNER_UPDATE',
      entityType: 'banner',
      entityId: bannerId,
      before: { isActive: before.isActive, sortOrder: before.sortOrder },
      after: { isActive: dto.isActive ?? before.isActive, sortOrder: dto.sortOrder ?? before.sortOrder },
    });
    return { ok: true as const, id: bannerId };
  }

  async deleteBanner(bannerId: string, actorUserId: string) {
    const before = await this.prisma.banner.findUnique({
      where: { id: bannerId },
      select: { id: true, slug: true },
    });
    if (!before) {
      throw DomainError.notFound('BANNER_NOT_FOUND', 'errors.notFound', { bannerId });
    }
    await this.prisma.banner.delete({ where: { id: bannerId } });
    await this.audit.log({
      actorUserId,
      action: 'BANNER_DELETE',
      entityType: 'banner',
      entityId: bannerId,
      before: { slug: before.slug },
    });
    return { ok: true as const, id: bannerId };
  }

  // ---------------- Ana sayfa bölüm yönetimi ----------------------------------

  private static readonly SECTION_INCLUDE = {
    items: {
      orderBy: { sortOrder: 'asc' as const },
      include: {
        content: {
          include: { categories: { include: { category: { select: { slug: true, sortOrder: true } } } } },
        },
      },
    },
    category: { select: { slug: true } },
  };

  async listHomeSections(lang: Lang) {
    const rows = await this.prisma.homeSection.findMany({
      orderBy: { sortOrder: 'asc' },
      include: AdminService.SECTION_INCLUDE,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        key: row.key,
        sectionType: row.sectionType,
        titleTr: row.titleTr ?? '',
        titleEn: row.titleEn ?? '',
        categoryId: row.categoryId,
        categorySlug: row.category?.slug ?? null,
        contentLimit: row.contentLimit,
        sortOrder: row.sortOrder,
        isActive: row.isActive,
        items: row.items.map((item) => toContentSummary(item.content, lang, this.env.PUBLIC_BASE_URL)),
      })),
    };
  }

  async createHomeSection(
    dto: {
      key: string;
      sectionType: 'HERO' | 'RAIL' | 'CATEGORY_GRID';
      titleTr: string;
      titleEn: string;
      categoryId?: string | null;
      contentLimit?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
    actorUserId: string,
  ) {
    const exists = await this.prisma.homeSection.findUnique({ where: { key: dto.key }, select: { id: true } });
    if (exists) {
      throw DomainError.conflict('SECTION_KEY_CONFLICT', 'errors.slugConflict', { key: dto.key });
    }
    if (dto.sectionType === 'CATEGORY_GRID' && !dto.categoryId) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'categoryId', message: 'CATEGORY_GRID bölümü kategori zorunludur' }],
      });
    }
    const row = await this.prisma.homeSection.create({
      data: {
        key: dto.key,
        sectionType: dto.sectionType,
        titleTr: dto.titleTr,
        titleEn: dto.titleEn,
        categoryId: dto.categoryId ?? null,
        contentLimit: dto.contentLimit ?? 10,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'HOME_SECTION_CREATE',
      entityType: 'home_section',
      entityId: row.id,
      after: { key: row.key, sectionType: row.sectionType },
    });
    return { ok: true as const, id: row.id };
  }

  async updateHomeSection(
    sectionId: string,
    dto: {
      sectionType?: 'HERO' | 'RAIL' | 'CATEGORY_GRID';
      titleTr?: string;
      titleEn?: string;
      categoryId?: string | null;
      contentLimit?: number;
      sortOrder?: number;
      isActive?: boolean;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.homeSection.findUnique({
      where: { id: sectionId },
      select: { id: true, isActive: true, sortOrder: true, sectionType: true },
    });
    if (!before) {
      throw DomainError.notFound('SECTION_NOT_FOUND', 'errors.notFound', { sectionId });
    }
    const sectionType = dto.sectionType ?? before.sectionType;
    if (sectionType === 'CATEGORY_GRID' && dto.categoryId === null) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'categoryId', message: 'CATEGORY_GRID bölümü kategori zorunludur' }],
      });
    }
    await this.prisma.homeSection.update({
      where: { id: sectionId },
      data: {
        sectionType: dto.sectionType,
        titleTr: dto.titleTr,
        titleEn: dto.titleEn,
        categoryId: dto.categoryId,
        contentLimit: dto.contentLimit,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'HOME_SECTION_UPDATE',
      entityType: 'home_section',
      entityId: sectionId,
      before: { isActive: before.isActive, sortOrder: before.sortOrder },
      after: { isActive: dto.isActive ?? before.isActive, sortOrder: dto.sortOrder ?? before.sortOrder },
    });
    return { ok: true as const, id: sectionId };
  }

  async deleteHomeSection(sectionId: string, actorUserId: string) {
    const before = await this.prisma.homeSection.findUnique({
      where: { id: sectionId },
      select: { id: true, key: true },
    });
    if (!before) {
      throw DomainError.notFound('SECTION_NOT_FOUND', 'errors.notFound', { sectionId });
    }
    // items cascade ile silinir (HomeSectionItem onDelete: Cascade).
    await this.prisma.homeSection.delete({ where: { id: sectionId } });
    await this.audit.log({
      actorUserId,
      action: 'HOME_SECTION_DELETE',
      entityType: 'home_section',
      entityId: sectionId,
      before: { key: before.key },
    });
    return { ok: true as const, id: sectionId };
  }

  /** Küratörlü ray'a içerik ekle (idempotent değil — çift ekleme 409 döner). */
  async addHomeSectionItem(sectionId: string, contentId: string, actorUserId: string) {
    const section = await this.prisma.homeSection.findUnique({
      where: { id: sectionId },
      select: { id: true, sectionType: true },
    });
    if (!section) {
      throw DomainError.notFound('SECTION_NOT_FOUND', 'errors.notFound', { sectionId });
    }
    if (section.sectionType === 'CATEGORY_GRID') {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'sectionType', message: 'CATEGORY_GRID bölümlerine manuel item eklenmez' }],
      });
    }
    await this.assertContentExists(contentId);

    const exists = await this.prisma.homeSectionItem.findUnique({
      where: { sectionId_contentId: { sectionId, contentId } },
      select: { id: true },
    });
    if (exists) {
      throw DomainError.conflict('SECTION_ITEM_EXISTS', 'errors.slugConflict', { sectionId, contentId });
    }

    const maxOrder = await this.prisma.homeSectionItem.aggregate({
      where: { sectionId },
      _max: { sortOrder: true },
    });
    const item = await this.prisma.homeSectionItem.create({
      data: { sectionId, contentId, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
    await this.audit.log({
      actorUserId,
      action: 'HOME_SECTION_ITEM_ADD',
      entityType: 'home_section_item',
      entityId: item.id,
      after: { sectionId, contentId, sortOrder: item.sortOrder },
    });
    return { ok: true as const, id: item.id };
  }

  async removeHomeSectionItem(sectionId: string, itemId: string, actorUserId: string) {
    const item = await this.prisma.homeSectionItem.findUnique({
      where: { id: itemId },
      select: { id: true, sectionId: true, contentId: true },
    });
    if (!item || item.sectionId !== sectionId) {
      throw DomainError.notFound('SECTION_ITEM_NOT_FOUND', 'errors.notFound', { sectionId, itemId });
    }
    await this.prisma.homeSectionItem.delete({ where: { id: itemId } });
    await this.audit.log({
      actorUserId,
      action: 'HOME_SECTION_ITEM_REMOVE',
      entityType: 'home_section_item',
      entityId: itemId,
      before: { sectionId: item.sectionId, contentId: item.contentId },
    });
    return { ok: true as const, id: itemId };
  }

  /** İçerik varlık denetimi (banner/section item bağlaması öncesi). */
  private async assertContentExists(contentId: string): Promise<void> {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true },
    });
    if (!content) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentId });
    }
  }
}
