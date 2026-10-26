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

  /** Denetim günlüğü listesi (sayfalı; FAZ 8: action/actorId filtreleri). */
  async listAuditLogs(
    page: number,
    pageSize: number,
    filters?: { entityType?: string; entityId?: string; action?: string; actorUserId?: string },
  ) {
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
        // FAZ 8: item kimliği de döner — panelden listeden çıkarma gerekir.
        items: row.items.map((item) => ({
          ...toContentSummary(item.content, lang, this.env.PUBLIC_BASE_URL),
          itemId: item.id,
        })),
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

  // ---------------------------------------------------------------------------
  // FAZ 8 — Yönetim paneli: dashboard, yapım/sezon/bölüm düzenleme,
  // gelir modeli, kullanıcı yönetimi. Tüm eylemler audit_logs'a yazılır.
  // ---------------------------------------------------------------------------

  // ------------------------- Dashboard ---------------------------------------

  /** Panel özeti: kullanıcılar, abonelikler, katalog, satın alma/kredi
   * özetleri, günlük seriler ve son denetim kayıtları. */
  async getDashboard(params: { from: Date; to: Date }) {
    const { from, to } = params;
    const inRange = { gte: from, lte: to };

    const [
      usersTotal,
      usersActive,
      usersSuspended,
      usersNewInRange,
      subsActive,
      subsTrialing,
      subsCanceled,
      subsExpired,
      subsGrace,
      titlesPublished,
      titlesDraft,
      titlesProcessing,
      titlesArchived,
      episodesTotal,
      episodesPublished,
      txTotalCount,
      txTotalAgg,
      txInRangeCount,
      txInRangeAgg,
      refundAgg,
      txSubCount,
      txPackCount,
      ledgerInRange,
      balanceAgg,
      recentAudit,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { createdAt: inRange } }),
      this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({ where: { status: 'TRIALING' } }),
      this.prisma.subscription.count({ where: { status: 'CANCELED' } }),
      this.prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      this.prisma.subscription.count({ where: { status: 'GRACE_PERIOD' } }),
      this.prisma.content.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.content.count({ where: { status: 'DRAFT' } }),
      this.prisma.content.count({ where: { status: 'PROCESSING' } }),
      this.prisma.content.count({ where: { status: 'ARCHIVED' } }),
      this.prisma.episode.count(),
      this.prisma.episode.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.storeTransaction.count({ where: { purchaseState: 'PURCHASED' } }),
      this.prisma.storeTransaction.aggregate({
        where: { purchaseState: 'PURCHASED' },
        _sum: { priceKurus: true },
      }),
      this.prisma.storeTransaction.count({ where: { purchaseState: 'PURCHASED', createdAt: inRange } }),
      this.prisma.storeTransaction.aggregate({
        where: { purchaseState: 'PURCHASED', createdAt: inRange },
        _sum: { priceKurus: true },
      }),
      this.prisma.storeTransaction.aggregate({
        where: { refundedAt: { not: null } },
        _count: { _all: true },
        _sum: { priceKurus: true },
      }),
      this.prisma.storeTransaction.count({ where: { purchaseState: 'PURCHASED', productType: 'SUBSCRIPTION' } }),
      this.prisma.storeTransaction.count({ where: { purchaseState: 'PURCHASED', productType: 'CREDIT_PACK' } }),
      this.prisma.creditLedger.groupBy({
        by: ['type'],
        where: { createdAt: inRange },
        _sum: { delta: true, purchasedDelta: true, grantedDelta: true },
      }),
      this.prisma.creditWallet.aggregate({
        _sum: { purchasedBalance: true, grantedBalance: true },
      }),
      this.audit.list(1, 8),
    ]);

    const ledgerSum = (type: string) =>
      ledgerInRange.find((g) => g.type === type)?._sum.delta ?? 0;

    // Günlük seriler (maks. 62 gün): kayıt, gelir, açma.
    const dayCount = Math.min(
      62,
      Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000)),
    );
    const seriesRaw = await this.prisma.$queryRaw<
      Array<{ day: string; signups: bigint; revenue: bigint; unlocks: bigint }>
    >`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${from}::timestamptz),
          date_trunc('day', ${to}::timestamptz),
          interval '1 day'
        ) AS day
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS day,
        (SELECT COUNT(*) FROM users u
          WHERE u."createdAt" >= days.day AND u."createdAt" < days.day + interval '1 day') AS signups,
        (SELECT COALESCE(SUM(t."priceKurus"), 0) FROM store_transactions t
          WHERE t."purchaseState" = 'PURCHASED'
            AND t."createdAt" >= days.day AND t."createdAt" < days.day + interval '1 day') AS revenue,
        (SELECT COUNT(*) FROM episode_unlocks e
          WHERE e."createdAt" >= days.day AND e."createdAt" < days.day + interval '1 day') AS unlocks
      FROM days
      ORDER BY days.day ASC
      LIMIT ${dayCount}
    `;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      users: {
        total: usersTotal,
        active: usersActive,
        suspended: usersSuspended,
        newInRange: usersNewInRange,
      },
      subscriptions: {
        active: subsActive,
        trialing: subsTrialing,
        canceled: subsCanceled,
        expired: subsExpired,
        gracePeriod: subsGrace,
      },
      catalog: {
        publishedTitles: titlesPublished,
        draftTitles: titlesDraft,
        processingTitles: titlesProcessing,
        archivedTitles: titlesArchived,
        totalEpisodes: episodesTotal,
        publishedEpisodes: episodesPublished,
      },
      purchases: {
        inRangeCount: txInRangeCount,
        inRangeRevenueKurus: txInRangeAgg._sum.priceKurus ?? 0,
        totalCount: txTotalCount,
        totalRevenueKurus: txTotalAgg._sum.priceKurus ?? 0,
        refundCount: refundAgg._count._all,
        refundedAmountKurus: refundAgg._sum.priceKurus ?? 0,
        subscriptionCount: txSubCount,
        creditPackCount: txPackCount,
      },
      credits: {
        grantedInRange: Math.max(0, ledgerSum('GRANT')),
        purchasedInRange: Math.max(0, ledgerSum('PURCHASE')),
        spentInRange: Math.max(0, -ledgerSum('UNLOCK_SPEND')),
        refundAdjustInRange: Math.max(0, -ledgerSum('REFUND')),
        balancePurchased: balanceAgg._sum.purchasedBalance ?? 0,
        balanceGranted: balanceAgg._sum.grantedBalance ?? 0,
      },
      series: seriesRaw.map((row) => ({
        day: String(row.day),
        signups: Number(row.signups),
        revenueKurus: Number(row.revenue),
        unlocks: Number(row.unlocks),
      })),
      recentAudit: recentAudit.rows.map((row) => ({
        id: row.id,
        actorUserId: row.actorUserId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  // ------------------------- Yapım düzenleme ---------------------------------

  /** Yapım düzenleme (afiş, başlık, açıklama, kategori, erişim modeli). */
  async updateTitle(
    contentId: string,
    dto: {
      titleTr?: string;
      titleEn?: string;
      originalTitle?: string | null;
      synopsisTr?: string;
      synopsisEn?: string;
      taglineTr?: string | null;
      taglineEn?: string | null;
      releaseYear?: number;
      ageRating?: string | null;
      durationSeconds?: number | null;
      posterUrl?: string | null;
      heroImageUrl?: string | null;
      verticalPreviewUrl?: string | null;
      accessType?: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
      seriesFormat?: 'STANDARD' | 'MINI' | null;
      categorySlugs?: string[];
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.content.findUnique({
      where: { id: contentId },
      include: { categories: { include: { category: { select: { slug: true } } } } },
    });
    if (!before) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentId });
    }

    if (before.kind === 'SERIES') {
      const nextFormat = dto.seriesFormat ?? before.seriesFormat;
      if (!nextFormat) {
        throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
          fields: [{ path: 'seriesFormat', message: 'SERIES için seriesFormat zorunludur' }],
        });
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.content.update({
        where: { id: contentId },
        data: {
          titleTr: dto.titleTr,
          titleEn: dto.titleEn,
          originalTitle: dto.originalTitle,
          synopsisTr: dto.synopsisTr,
          synopsisEn: dto.synopsisEn,
          taglineTr: dto.taglineTr,
          taglineEn: dto.taglineEn,
          releaseYear: dto.releaseYear,
          ageRating: dto.ageRating,
          durationSeconds: dto.durationSeconds,
          posterUrl: dto.posterUrl,
          heroImageUrl: dto.heroImageUrl,
          verticalPreviewUrl: dto.verticalPreviewUrl,
          accessType: dto.accessType,
          seriesFormat: dto.seriesFormat,
        },
      });
      if (dto.categorySlugs) {
        await tx.contentCategory.deleteMany({ where: { contentId } });
        const categories = await tx.category.findMany({
          where: { slug: { in: dto.categorySlugs } },
          select: { id: true },
        });
        if (categories.length > 0) {
          await tx.contentCategory.createMany({
            data: categories.map((c) => ({ contentId, categoryId: c.id })),
            skipDuplicates: true,
          });
        }
      }
      return row;
    });

    await this.audit.log({
      actorUserId,
      action: 'CONTENT_UPDATE',
      entityType: 'content',
      entityId: contentId,
      before: { titleTr: before.titleTr, accessType: before.accessType, posterUrl: before.posterUrl },
      after: {
        titleTr: updated.titleTr,
        accessType: updated.accessType,
        posterUrl: updated.posterUrl,
        categories: dto.categorySlugs,
      },
    });
    return { ok: true as const, id: updated.id };
  }

  /** Yapım yönetim detayı: kategoriler + sezonlar + bölümler + medya durumu. */
  async getTitleDetail(contentId: string) {
    const row = await this.prisma.content.findUnique({
      where: { id: contentId },
      include: {
        categories: { include: { category: { select: { id: true, slug: true, nameTr: true, nameEn: true } } } },
        seasons: {
          orderBy: { seasonNumber: 'asc' },
          include: {
            episodes: {
              orderBy: { episodeNumber: 'asc' },
              include: { media: { orderBy: { createdAt: 'desc' } } },
            },
          },
        },
        episodes: { select: { id: true } },
      },
    });
    if (!row) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentId });
    }

    // Sezonsuz bölümler (FILM/SHORT_FILM) için yalnız sezona bağlı bölümler
    // seasons.episodes ile gelir; FILM tek sezon modeli kullanmaz.
    return {
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      seriesFormat: row.seriesFormat,
      titleTr: row.titleTr,
      titleEn: row.titleEn,
      originalTitle: row.originalTitle,
      synopsisTr: row.synopsisTr,
      synopsisEn: row.synopsisEn,
      taglineTr: row.taglineTr,
      taglineEn: row.taglineEn,
      releaseYear: row.releaseYear,
      ageRating: row.ageRating,
      durationSeconds: row.durationSeconds,
      posterUrl: row.posterUrl,
      heroImageUrl: row.heroImageUrl,
      verticalPreviewUrl: row.verticalPreviewUrl,
      accessType: row.accessType,
      status: row.status,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      categories: row.categories.map((c) => ({
        id: c.category.id,
        slug: c.category.slug,
        nameTr: c.category.nameTr,
        nameEn: c.category.nameEn,
      })),
      seasons: row.seasons.map((season) => ({
        id: season.id,
        seasonNumber: season.seasonNumber,
        titleTr: season.titleTr,
        titleEn: season.titleEn,
        synopsisTr: season.synopsisTr,
        synopsisEn: season.synopsisEn,
        episodes: season.episodes.map((e) => this.toAdminEpisode(e)),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Prisma bölüm + medya satırını yönetim özetine çevirir (sır yok). */
  private toAdminEpisode(e: {
    id: string;
    seasonNumber: number;
    episodeNumber: number;
    titleTr: string;
    titleEn: string;
    synopsisTr: string | null;
    synopsisEn: string | null;
    durationSeconds: number;
    accessType: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
    creditCost: number | null;
    status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
    publishedAt: Date | null;
    freeUntilAt: Date | null;
    verticalPreviewUrl: string | null;
    updatedAt: Date;
    media: Array<{
      id: string;
      provider: string;
      state: string;
      originalName: string | null;
      sizeBytes: number | null;
      durationSeconds: number | null;
      errorMessage: string | null;
      uploadExpiresAt: Date | null;
      readyAt: Date | null;
      createdAt: Date;
    }>;
  }) {
    return {
      id: e.id,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      titleTr: e.titleTr,
      titleEn: e.titleEn,
      synopsisTr: e.synopsisTr,
      synopsisEn: e.synopsisEn,
      durationSeconds: e.durationSeconds,
      accessType: e.accessType,
      creditCost: e.creditCost,
      status: e.status,
      publishedAt: e.publishedAt ? e.publishedAt.toISOString() : null,
      freeUntilAt: e.freeUntilAt ? e.freeUntilAt.toISOString() : null,
      verticalPreviewUrl: e.verticalPreviewUrl,
      updatedAt: e.updatedAt.toISOString(),
      media: e.media.map((m) => ({
        id: m.id,
        provider: m.provider,
        state: m.state,
        originalName: m.originalName,
        sizeBytes: m.sizeBytes,
        durationSeconds: m.durationSeconds,
        errorMessage: m.errorMessage,
        uploadExpiresAt: m.uploadExpiresAt ? m.uploadExpiresAt.toISOString() : null,
        readyAt: m.readyAt ? m.readyAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  // ------------------------- Sezon ve bölüm ----------------------------------

  async createSeason(
    contentId: string,
    dto: { seasonNumber: number; titleTr?: string; titleEn?: string; synopsisTr?: string; synopsisEn?: string },
    actorUserId: string,
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, kind: true },
    });
    if (!content) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentId });
    }
    const exists = await this.prisma.season.findUnique({
      where: { contentId_seasonNumber: { contentId, seasonNumber: dto.seasonNumber } },
      select: { id: true },
    });
    if (exists) {
      throw DomainError.conflict('SEASON_CONFLICT', 'errors.slugConflict', {
        contentId,
        seasonNumber: dto.seasonNumber,
      });
    }
    const row = await this.prisma.season.create({
      data: {
        contentId,
        seasonNumber: dto.seasonNumber,
        titleTr: dto.titleTr,
        titleEn: dto.titleEn,
        synopsisTr: dto.synopsisTr,
        synopsisEn: dto.synopsisEn,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'SEASON_CREATE',
      entityType: 'season',
      entityId: row.id,
      after: { contentId, seasonNumber: row.seasonNumber },
    });
    return { ok: true as const, id: row.id };
  }

  async updateSeason(
    seasonId: string,
    dto: { titleTr?: string; titleEn?: string; synopsisTr?: string; synopsisEn?: string },
    actorUserId: string,
  ) {
    const before = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { id: true, titleTr: true },
    });
    if (!before) {
      throw DomainError.notFound('SEASON_NOT_FOUND', 'errors.notFound', { seasonId });
    }
    await this.prisma.season.update({ where: { id: seasonId }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'SEASON_UPDATE',
      entityType: 'season',
      entityId: seasonId,
      before: { titleTr: before.titleTr },
      after: dto,
    });
    return { ok: true as const, id: seasonId };
  }

  async createEpisode(
    contentId: string,
    dto: {
      seasonNumber: number;
      episodeNumber: number;
      titleTr: string;
      titleEn: string;
      synopsisTr?: string;
      synopsisEn?: string;
      durationSeconds: number;
      accessType: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
      creditCost?: number;
      verticalPreviewUrl?: string | null;
      freeUntilAt?: string | null;
    },
    actorUserId: string,
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, kind: true },
    });
    if (!content) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentId });
    }
    // CREDIT kuralı sözleşmede de var; sunucu tarafında ikinci savunma.
    if (dto.accessType === 'CREDIT' && (dto.creditCost ?? 0) <= 0) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'creditCost', message: 'CREDIT erişiminde creditCost zorunludur' }],
      });
    }
    const season = await this.prisma.season.findUnique({
      where: { contentId_seasonNumber: { contentId, seasonNumber: dto.seasonNumber } },
      select: { id: true },
    });
    if (!season) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'seasonNumber', message: 'Sezon bulunamadı — önce sezon oluşturun' }],
      });
    }
    try {
      const row = await this.prisma.episode.create({
        data: {
          contentId,
          seasonNumber: dto.seasonNumber,
          episodeNumber: dto.episodeNumber,
          titleTr: dto.titleTr,
          titleEn: dto.titleEn,
          synopsisTr: dto.synopsisTr,
          synopsisEn: dto.synopsisEn,
          durationSeconds: dto.durationSeconds,
          accessType: dto.accessType,
          creditCost: dto.accessType === 'CREDIT' ? dto.creditCost ?? null : null,
          verticalPreviewUrl: dto.verticalPreviewUrl ?? null,
          freeUntilAt: dto.freeUntilAt ? new Date(dto.freeUntilAt) : null,
          status: 'DRAFT',
        },
      });
      await this.audit.log({
        actorUserId,
        action: 'EPISODE_CREATE',
        entityType: 'episode',
        entityId: row.id,
        after: {
          contentId,
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
          accessType: row.accessType,
          creditCost: row.creditCost,
        },
      });
      return { ok: true as const, id: row.id };
    } catch (err) {
      if (
        typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002'
      ) {
        throw DomainError.conflict('EPISODE_CONFLICT', 'errors.slugConflict', {
          seasonNumber: dto.seasonNumber,
          episodeNumber: dto.episodeNumber,
        });
      }
      throw err;
    }
  }

  async updateEpisode(
    episodeId: string,
    dto: {
      seasonNumber?: number;
      episodeNumber?: number;
      titleTr?: string;
      titleEn?: string;
      synopsisTr?: string | null;
      synopsisEn?: string | null;
      durationSeconds?: number;
      accessType?: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
      creditCost?: number | null;
      verticalPreviewUrl?: string | null;
      freeUntilAt?: string | null;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, contentId: true, seasonNumber: true, episodeNumber: true, titleTr: true, accessType: true, creditCost: true },
    });
    if (!before) {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.notFound', { episodeId });
    }
    const accessType = dto.accessType ?? before.accessType;
    let creditCost = dto.creditCost === undefined ? before.creditCost : dto.creditCost;
    if (accessType === 'CREDIT' && (creditCost ?? 0) <= 0) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'creditCost', message: 'CREDIT erişiminde creditCost zorunludur' }],
      });
    }
    if (accessType !== 'CREDIT') creditCost = null;

    if (dto.seasonNumber !== undefined && dto.seasonNumber !== before.seasonNumber) {
      const season = await this.prisma.season.findUnique({
        where: { contentId_seasonNumber: { contentId: before.contentId, seasonNumber: dto.seasonNumber } },
        select: { id: true },
      });
      if (!season) {
        throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
          fields: [{ path: 'seasonNumber', message: 'Hedef sezon bulunamadı' }],
        });
      }
    }

    try {
      await this.prisma.episode.update({
        where: { id: episodeId },
        data: {
          seasonNumber: dto.seasonNumber,
          episodeNumber: dto.episodeNumber,
          titleTr: dto.titleTr,
          titleEn: dto.titleEn,
          synopsisTr: dto.synopsisTr,
          synopsisEn: dto.synopsisEn,
          durationSeconds: dto.durationSeconds,
          accessType,
          creditCost,
          verticalPreviewUrl: dto.verticalPreviewUrl,
          freeUntilAt:
            dto.freeUntilAt === undefined ? undefined : dto.freeUntilAt ? new Date(dto.freeUntilAt) : null,
        },
      });
    } catch (err) {
      if (
        typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002'
      ) {
        throw DomainError.conflict('EPISODE_CONFLICT', 'errors.slugConflict', {
          seasonNumber: dto.seasonNumber ?? before.seasonNumber,
          episodeNumber: dto.episodeNumber ?? before.episodeNumber,
        });
      }
      throw err;
    }

    await this.audit.log({
      actorUserId,
      action: 'EPISODE_UPDATE',
      entityType: 'episode',
      entityId: episodeId,
      before: {
        titleTr: before.titleTr,
        accessType: before.accessType,
        creditCost: before.creditCost,
      },
      after: { titleTr: dto.titleTr, accessType, creditCost },
    });
    return { ok: true as const, id: episodeId };
  }

  /** Bölüm durum geçiş matrisi (Faz 8): taslak/planlı/yayında/arşivde. */
  private static readonly EPISODE_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
    DRAFT: ['PUBLISHED', 'ARCHIVED'],
    SCHEDULED: ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
    PUBLISHED: ['ARCHIVED', 'DRAFT'],
    ARCHIVED: ['PUBLISHED', 'DRAFT'],
  };

  async changeEpisodeStatus(episodeId: string, next: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED', actorUserId: string) {
    const before = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, status: true, publishedAt: true, titleTr: true },
    });
    if (!before) {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.notFound', { episodeId });
    }
    const allowed = AdminService.EPISODE_STATUS_TRANSITIONS[before.status] ?? [];
    if (!allowed.includes(next)) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'status', message: `Geçersiz bölüm durumu geçişi: ${before.status} → ${next}` }],
      });
    }
    const updated = await this.prisma.episode.update({
      where: { id: episodeId },
      data: {
        status: next,
        publishedAt: next === 'PUBLISHED' && !before.publishedAt ? new Date() : before.publishedAt,
      },
    });
    await this.audit.log({
      actorUserId,
      action: 'EPISODE_STATUS_CHANGE',
      entityType: 'episode',
      entityId: episodeId,
      before: { status: before.status },
      after: { status: next },
    });
    return {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
    };
  }

  /** Bölüm silimi: yalnızca izleme/açma kaydı olmayan bölümler silinir
   * (finansal + izleme verisi RESTRICT ile korunur). Yayında bölüm 409. */
  async deleteEpisode(episodeId: string, actorUserId: string) {
    const row = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: {
        id: true,
        titleTr: true,
        status: true,
        _count: { select: { unlocks: true, watchHistory: true, playbackSessions: true } },
      },
    });
    if (!row) {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.notFound', { episodeId });
    }
    if (row.status === 'PUBLISHED') {
      throw DomainError.conflict('EPISODE_PUBLISHED', 'errors.validationFailed', {
        message: 'Yayındaki bölüm silinemez — önce yayından kaldırın',
      });
    }
    if (row._count.unlocks > 0 || row._count.watchHistory > 0 || row._count.playbackSessions > 0) {
      throw DomainError.conflict('EPISODE_HAS_ACTIVITY', 'errors.validationFailed', {
        message: 'İzleme/açma kaydı olan bölüm silinemez (finansal kayıt korunur)',
        unlocks: row._count.unlocks,
        watchHistory: row._count.watchHistory,
      });
    }
    await this.prisma.episode.delete({ where: { id: episodeId } });
    await this.audit.log({
      actorUserId,
      action: 'EPISODE_DELETE',
      entityType: 'episode',
      entityId: episodeId,
      before: { titleTr: row.titleTr, status: row.status },
    });
    return { ok: true as const, id: episodeId };
  }

  // ------------------------- Gelir modeli ------------------------------------

  async listPlans() {
    const rows = await this.prisma.plan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { subscriptions: { where: { status: { in: ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'] } } } } } },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        titleTr: row.titleTr,
        titleEn: row.titleEn,
        platformProductIdIos: row.platformProductIdIos,
        platformProductIdAndroid: row.platformProductIdAndroid,
        billingPeriod: row.billingPeriod,
        priceKurus: row.priceKurus,
        currency: row.currency,
        trialDays: row.trialDays,
        gracePeriodDays: row.gracePeriodDays,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        activeSubscriberCount: row._count.subscriptions,
      })),
    };
  }

  async updatePlan(
    planId: string,
    dto: {
      titleTr?: string;
      titleEn?: string;
      platformProductIdIos?: string | null;
      platformProductIdAndroid?: string | null;
      priceKurus?: number;
      currency?: string;
      trialDays?: number;
      gracePeriodDays?: number;
      isActive?: boolean;
      sortOrder?: number;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, code: true, priceKurus: true, isActive: true, platformProductIdIos: true, platformProductIdAndroid: true },
    });
    if (!before) {
      throw DomainError.notFound('PLAN_NOT_FOUND', 'errors.notFound', { planId });
    }
    const updated = await this.prisma.plan.update({ where: { id: planId }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'PLAN_UPDATE',
      entityType: 'plan',
      entityId: planId,
      before: {
        code: before.code,
        priceKurus: before.priceKurus,
        isActive: before.isActive,
        ios: before.platformProductIdIos,
        android: before.platformProductIdAndroid,
      },
      after: {
        code: updated.code,
        priceKurus: updated.priceKurus,
        isActive: updated.isActive,
        ios: updated.platformProductIdIos,
        android: updated.platformProductIdAndroid,
      },
    });
    return { ok: true as const, id: planId };
  }

  async listCreditPacks() {
    const rows = await this.prisma.creditPack.findMany({
      orderBy: [{ sortOrder: 'asc' }, { credits: 'asc' }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        code: row.code,
        credits: row.credits,
        bonusCredits: row.bonusCredits,
        platformProductIdIos: row.platformProductIdIos,
        platformProductIdAndroid: row.platformProductIdAndroid,
        priceKurus: row.priceKurus,
        currency: row.currency,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      })),
    };
  }

  async updateCreditPack(
    packId: string,
    dto: {
      platformProductIdIos?: string | null;
      platformProductIdAndroid?: string | null;
      priceKurus?: number;
      currency?: string;
      isActive?: boolean;
      sortOrder?: number;
      bonusCredits?: number;
    },
    actorUserId: string,
  ) {
    const before = await this.prisma.creditPack.findUnique({
      where: { id: packId },
      select: { id: true, code: true, priceKurus: true, isActive: true },
    });
    if (!before) {
      throw DomainError.notFound('CREDIT_PACK_NOT_FOUND', 'errors.notFound', { packId });
    }
    await this.prisma.creditPack.update({ where: { id: packId }, data: dto });
    await this.audit.log({
      actorUserId,
      action: 'CREDIT_PACK_UPDATE',
      entityType: 'credit_pack',
      entityId: packId,
      before: { code: before.code, priceKurus: before.priceKurus, isActive: before.isActive },
      after: { code: before.code, priceKurus: dto.priceKurus, isActive: dto.isActive },
    });
    return { ok: true as const, id: packId };
  }

  /** Mağaza satın alma kayıtları (iade/durum takibiyle). */
  async listStoreTransactions(params: {
    page: number;
    pageSize: number;
    userId?: string;
    state?: 'PENDING' | 'PURCHASED' | 'REFUNDED' | 'REVOKED';
    productType?: 'SUBSCRIPTION' | 'CREDIT_PACK';
  }) {
    const where = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.state ? { purchaseState: params.state } : {}),
      ...(params.productType ? { productType: params.productType } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.storeTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true } } },
        ...prismaSkipTake(params.page, params.pageSize),
      }),
      this.prisma.storeTransaction.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user?.email ?? null,
        platform: row.platform,
        productType: row.productType,
        productId: row.productId,
        storeTransactionId: row.storeTransactionId,
        quantity: row.quantity,
        priceKurus: row.priceKurus,
        currency: row.currency,
        purchaseState: row.purchaseState,
        validatedAt: row.validatedAt ? row.validatedAt.toISOString() : null,
        refundedAt: row.refundedAt ? row.refundedAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPageMeta(params.page, params.pageSize, total),
    };
  }

  /** Kredi ledger hareketleri (yönetim görünümü — append-only dökümü). */
  async listLedger(params: {
    page: number;
    pageSize: number;
    userId?: string;
    type?: 'PURCHASE' | 'GRANT' | 'UNLOCK_SPEND' | 'REFUND' | 'ADJUSTMENT' | 'EXPIRY';
  }) {
    const where = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.type ? { type: params.type } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, displayName: true } } },
        ...prismaSkipTake(params.page, params.pageSize),
      }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user?.email ?? null,
        displayName: row.user?.displayName ?? null,
        type: row.type,
        delta: row.delta,
        purchasedDelta: row.purchasedDelta,
        grantedDelta: row.grantedDelta,
        balanceAfterPurchased: row.balanceAfterPurchased,
        balanceAfterGranted: row.balanceAfterGranted,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: buildPageMeta(params.page, params.pageSize, total),
    };
  }

  // ------------------------- Kullanıcı yönetimi ------------------------------

  /** Kullanıcı yönetim detayı: profil + cüzdan + abonelik + son hareketler. */
  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        creditWallet: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: { select: { code: true, titleTr: true, titleEn: true } } },
        },
      },
    });
    if (!user) {
      throw DomainError.notFound('USER_NOT_FOUND', 'errors.notFound', { userId });
    }

    const [recentLedger, unlockCount, favoriteCount, purchaseAgg] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      this.prisma.episodeUnlock.count({ where: { userId } }),
      this.prisma.favorite.count({ where: { userId } }),
      this.prisma.storeTransaction.aggregate({
        where: { userId, purchaseState: 'PURCHASED' },
        _count: { _all: true },
        _sum: { priceKurus: true },
      }),
    ]);

    const subscription = user.subscriptions[0];
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      locale: user.locale,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
      wallet: user.creditWallet
        ? {
            purchased: user.creditWallet.purchasedBalance,
            granted: user.creditWallet.grantedBalance,
            total: user.creditWallet.purchasedBalance + user.creditWallet.grantedBalance,
          }
        : null,
      subscription: subscription
        ? {
            id: subscription.id,
            planCode: subscription.plan.code,
            planTitle: subscription.plan.titleTr,
            platform: subscription.platform,
            status: subscription.status,
            autoRenew: subscription.autoRenew,
            currentPeriodEnd: subscription.currentPeriodEnd
              ? subscription.currentPeriodEnd.toISOString()
              : null,
            expiresAt: subscription.expiresAt ? subscription.expiresAt.toISOString() : null,
            canceledAt: subscription.canceledAt ? subscription.canceledAt.toISOString() : null,
          }
        : null,
      recentLedger: recentLedger.map((row) => ({
        id: row.id,
        userId: row.userId,
        userEmail: user.email,
        displayName: user.displayName,
        type: row.type,
        delta: row.delta,
        purchasedDelta: row.purchasedDelta,
        grantedDelta: row.grantedDelta,
        balanceAfterPurchased: row.balanceAfterPurchased,
        balanceAfterGranted: row.balanceAfterGranted,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      stats: {
        unlockCount,
        favoriteCount,
        purchaseCount: purchaseAgg._count._all,
        totalSpentKurus: purchaseAgg._sum.priceKurus ?? 0,
      },
    };
  }

  /** Kullanıcı durum değişikliği (askıya al / geri al) — ADMIN, audit. */
  async changeUserStatus(
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED',
    actorUserId: string,
    ipHash?: string,
  ) {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: true },
    });
    if (!before) {
      throw DomainError.notFound('USER_NOT_FOUND', 'errors.notFound', { userId });
    }
    if (before.status === 'DELETED') {
      throw DomainError.conflict('USER_DELETED', 'errors.validationFailed', {
        message: 'Silinmiş hesabın durumu değiştirilemez',
      });
    }
    if (before.id === actorUserId) {
      throw DomainError.conflict('SELF_ACTION_FORBIDDEN', 'errors.validationFailed', {
        message: 'Yönetici kendi hesabını askıya alamaz',
      });
    }
    await this.prisma.user.update({ where: { id: userId }, data: { status } });
    await this.audit.log({
      actorUserId,
      action: 'USER_STATUS_CHANGE',
      entityType: 'user',
      entityId: userId,
      before: { status: before.status },
      after: { status },
      ipHash,
    });
    return { ok: true as const, id: userId };
  }

  /** Rol değişikliği (USER/EDITOR/ADMIN) — ADMIN, audit. */
  async changeUserRole(
    userId: string,
    role: 'USER' | 'EDITOR' | 'ADMIN',
    actorUserId: string,
    ipHash?: string,
  ) {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!before) {
      throw DomainError.notFound('USER_NOT_FOUND', 'errors.notFound', { userId });
    }
    if (before.status === 'DELETED') {
      throw DomainError.conflict('USER_DELETED', 'errors.validationFailed', {
        message: 'Silinmiş hesabın rolü değiştirilemez',
      });
    }
    if (before.id === actorUserId) {
      throw DomainError.conflict('SELF_ACTION_FORBIDDEN', 'errors.validationFailed', {
        message: 'Yönetici kendi rolünü değiştiremez',
      });
    }
    await this.prisma.user.update({ where: { id: userId }, data: { role } });
    await this.audit.log({
      actorUserId,
      action: 'USER_ROLE_CHANGE',
      entityType: 'user',
      entityId: userId,
      before: { role: before.role },
      after: { role },
      ipHash,
    });
    return { ok: true as const, id: userId };
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
