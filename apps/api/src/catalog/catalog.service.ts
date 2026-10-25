/**
 * Katalog ve keşif servisi (Faz 2b çekirdek uçları):
 *   GET /home              → banner'lar + bölüm rayları
 *   GET /catalog/titles    → sayfalı/filtreli içerik listesi
 *   GET /catalog/titles/:slug → detay (sezonlar + erişimli bölümler)
 *   GET /search            → sayfalı arama
 *
 * Kural 6: HERKESİ uçlar yalnızca status=PUBLISHED ve publishedAt ≤ now
 * kayıtları görür; DRAFT/SCHEDULED/ARCHIVED yalnızca admin uçlarında yaşar.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  Banner,
  CatalogEpisode,
  CatalogSeason,
  ContentSummary,
  EpisodeDetailResponse,
  HomeResponse,
  TitleDetailResponse,
  TitleListResponse,
} from '@perdego/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { buildPageMeta, prismaSkipTake } from '../common/pagination';
import type { Lang, RequestUser } from '../common/request-context';
import { pickLang } from '../common/request-context';
import { AccessService } from '../episodes/access.service';
import {
  groupSeasons,
  toCatalogEpisode,
  toContentSummary,
  toTitleDetail,
} from './content-mapper';

/** Yalnızca yayında içerik/bölüm filtresi (Kural 6).
 *
 * FONKSİYON olmasının iki nedeni:
 *  1. `new Date()` her sorguda taze değerlendirilir — sunucu ayakta iken
 *     yayınlanan içerik listelerde anında görünür (bayat karşılaştırma yok).
 *  2. publishedAt koşulu AND içine sarılıdır — çağıran where'in kendi
 *     `OR`'unu ezmez (bkz. watchlist.add: OR[id/slug] + bu filtre).
 *     Düz olup OR taşıyan sabit bir nesne spread edildiğinde çağıranın OR'u
 *     sessizce kaybolur — bu hata entegrasyon testinde yakalandı.
 */
export const publishedContentFilter = (): Prisma.ContentWhereInput => ({
  status: 'PUBLISHED',
  AND: [{ OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] }],
});

export const publishedEpisodeFilter = (): Prisma.EpisodeWhereInput => ({
  status: 'PUBLISHED',
  AND: [{ OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }] }],
});

const contentSummaryInclude = {
  categories: { include: { category: { select: { slug: true, sortOrder: true } } } },
} satisfies Prisma.ContentInclude;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get baseUrl(): string {
    return this.env.PUBLIC_BASE_URL;
  }

  // ---------------- Ana sayfa -------------------------------------------------

  async home(lang: Lang, _user: RequestUser | null): Promise<HomeResponse> {
    const [banners, sections] = await Promise.all([
      this.prisma.banner.findMany({
        where: {
          isActive: true,
          OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        include: { targetContent: { include: contentSummaryInclude } },
        take: 5,
      }),
      this.prisma.homeSection.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: { content: { include: contentSummaryInclude } },
          },
          category: { select: { slug: true, nameTr: true, nameEn: true } },
        },
        take: 12,
      }),
    ]);

    const bannerViews: Banner[] = banners.map((b) => ({
      id: b.id,
      title: pickLang(lang, b.titleTr ?? b.titleEn ?? 'PerdeGo', b.titleEn ?? b.titleTr ?? 'PerdeGo'),
      subtitle: pickLang(lang, b.subtitleTr ?? b.subtitleEn, b.subtitleEn ?? b.subtitleTr) ?? undefined,
      imageUrl: b.imageUrl.startsWith('http')
        ? b.imageUrl
        : `${this.baseUrl}${b.imageUrl}`,
      targetContentSlug: b.targetContent?.slug ?? null,
      deepLink: b.deepLink,
    }));

    // RAIL: küratörlü items; CATEGORY_GRID: kategorinin yayındaki içerikleri.
    const sectionsWithItems = await Promise.all(
      sections.map(async (section) => {
        let items: ContentSummary[];
        if (section.sectionType === 'CATEGORY_GRID') {
          if (!section.category) return null;
          const rows = await this.prisma.content.findMany({
            where: { ...publishedContentFilter(), categories: { some: { category: { slug: section.category.slug } } } },
            orderBy: [{ publishedAt: 'desc' }],
            include: contentSummaryInclude,
            take: section.contentLimit,
          });
          items = rows.map((row) => toContentSummary(row, lang, this.baseUrl));
        } else {
          items = section.items
            .filter((item) => item.content.status === 'PUBLISHED')
            .map((item) => toContentSummary(item.content, lang, this.baseUrl));
        }
        if (items.length === 0) return null;
        const layout: 'HERO' | 'RAIL' | 'GRID' =
          section.sectionType === 'HERO' ? 'HERO' : section.sectionType === 'CATEGORY_GRID' ? 'GRID' : 'RAIL';
        return {
          id: section.id,
          title:
            pickLang(lang, section.titleTr ?? section.titleEn ?? '', section.titleEn ?? section.titleTr ?? '') ||
            section.key,
          layout,
          items,
        };
      }),
    );

    return {
      banners: bannerViews,
      sections: sectionsWithItems.filter((s): s is NonNullable<typeof s> => s !== null),
    };
  }

  // ---------------- İçerik listesi -------------------------------------------

  async listTitles(
    params: { page: number; pageSize: number; kind?: string; accessType?: string; category?: string; sort?: string },
    lang: Lang,
  ): Promise<TitleListResponse> {
    const where: Prisma.ContentWhereInput = { ...publishedContentFilter() };
    if (params.kind) where.kind = params.kind as Prisma.ContentWhereInput['kind'];
    if (params.accessType) where.accessType = params.accessType as Prisma.ContentWhereInput['accessType'];
    if (params.category) {
      where.categories = { some: { category: { slug: params.category, isActive: true } } };
    }

    const orderBy: Prisma.ContentOrderByWithRelationInput =
      params.sort === 'oldest'
        ? { publishedAt: 'asc' }
        : params.sort === 'title'
          ? { titleTr: 'asc' }
          : { publishedAt: 'desc' };

    const [rows, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        orderBy,
        include: contentSummaryInclude,
        ...prismaSkipTake(params.page, params.pageSize),
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      items: rows.map((row) => toContentSummary(row, lang, this.baseUrl)),
      meta: buildPageMeta(params.page, params.pageSize, total),
    };
  }

  // ---------------- İçerik detayı --------------------------------------------

  async titleBySlug(slug: string, lang: Lang, user: RequestUser | null): Promise<TitleDetailResponse> {
    const row = await this.prisma.content.findUnique({
      where: { slug },
      include: {
        ...contentSummaryInclude,
        castMembers: {
          orderBy: { sortOrder: 'asc' },
          include: { castMember: true },
        },
        seasons: { orderBy: { seasonNumber: 'asc' } },
      },
    });

    if (!row || row.status !== 'PUBLISHED' || (row.publishedAt && row.publishedAt > new Date())) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { slug });
    }

    const episodes = await this.prisma.episode.findMany({
      where: { contentId: row.id, ...publishedEpisodeFilter() },
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
      include: { content: { select: { ageRating: true } } },
    });

    const fullUser = user ? await this.prisma.user.findUnique({ where: { id: user.id } }) : null;
    const accessSeasons = await this.buildAccessSeasons(row.id, episodes, lang, fullUser);
    return toTitleDetail(row, lang, this.baseUrl, row.seasons, accessSeasons);
  }

  // ---------------- Bölüm detayı ---------------------------------------------

  async episodeDetail(episodeId: string, lang: Lang, user: RequestUser | null): Promise<EpisodeDetailResponse> {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: { content: { include: contentSummaryInclude } },
    });

    if (
      !episode ||
      episode.status !== 'PUBLISHED' ||
      episode.content.status !== 'PUBLISHED' ||
      (episode.content.publishedAt && episode.content.publishedAt > new Date())
    ) {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
    }

    const fullUser = user ? await this.prisma.user.findUnique({ where: { id: user.id } }) : null;
    const access = await this.access.decide(episode, fullUser);
    return {
      ...toCatalogEpisode(episode, lang, this.baseUrl, access),
      content: toContentSummary(episode.content, lang, this.baseUrl),
    };
  }

  // ---------------- Arama ----------------------------------------------------

  async search(params: { query: string; page: number; pageSize: number }, lang: Lang): Promise<{
    items: ContentSummary[];
    meta: ReturnType<typeof buildPageMeta>;
  }> {
    const q = params.query.trim();
    if (q.length === 0) {
      throw DomainError.badRequest('VALIDATION_FAILED', 'errors.validationFailed', {
        fields: [{ path: 'query', message: 'Arama terimi zorunludur' }],
      });
    }
    const where: Prisma.ContentWhereInput = {
      ...publishedContentFilter(),
      OR: [
        { titleTr: { contains: q, mode: 'insensitive' } },
        { titleEn: { contains: q, mode: 'insensitive' } },
        { originalTitle: { contains: q, mode: 'insensitive' } },
        { synopsisTr: { contains: q, mode: 'insensitive' } },
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        include: contentSummaryInclude,
        ...prismaSkipTake(params.page, params.pageSize),
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      items: rows.map((row) => toContentSummary(row, lang, this.baseUrl)),
      meta: buildPageMeta(params.page, params.pageSize, total),
    };
  }

  // ---------------- iç yardımcılar -------------------------------------------

  /** Sezonları erişim kararlı bölüm satırlarıyla gruplar. */
  private async buildAccessSeasons(
    contentId: string,
    episodes: Array<CatalogEpisode extends never ? never : Parameters<typeof toCatalogEpisode>[0]>,
    lang: Lang,
    user: Parameters<AccessService['decide']>[1],
  ): Promise<CatalogSeason[]> {
    const seasons = await this.prisma.season.findMany({
      where: { contentId },
      orderBy: { seasonNumber: 'asc' },
    });
    const bySeason = new Map<number, CatalogEpisode[]>();
    for (const episode of episodes) {
      const access = await this.access.decide(episode, user);
      const view = toCatalogEpisode(episode, lang, this.baseUrl, access);
      const list = bySeason.get(episode.seasonNumber) ?? [];
      list.push(view);
      bySeason.set(episode.seasonNumber, list);
    }
    return groupSeasons(seasons, bySeason, lang);
  }
}
