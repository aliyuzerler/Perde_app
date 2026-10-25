/**
 * Favoriler (watchlist) servisi.
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { toContentSummary } from '../catalog/content-mapper';
import { publishedContentFilter } from '../catalog/catalog.service';
import type { Lang } from '../common/request-context';

@Injectable()
export class WatchlistService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(userId: string, lang: Lang) {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        content: {
          include: { categories: { include: { category: { select: { slug: true, sortOrder: true } } } } },
        },
      },
    });
    return {
      items: rows
        .filter((row) => row.content.status === 'PUBLISHED')
        .map((row) => toContentSummary(row.content, lang, this.env.PUBLIC_BASE_URL)),
    };
  }

  async add(userId: string, contentIdOrSlug: string, _lang: Lang) {
    const content = await this.prisma.content.findFirst({
      where: {
        OR: [{ id: contentIdOrSlug }, { slug: contentIdOrSlug }],
        // Not: filtre fonksiyonudur ve publishedAt koşulu AND içindedir —
        // yukarıdaki OR[id/slug] koşulunu ezmez (Kural 6).
        ...publishedContentFilter(),
      },
      include: { categories: { include: { category: { select: { slug: true, sortOrder: true } } } } },
    });
    if (!content) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentIdOrSlug });
    }

    const existing = await this.prisma.favorite.findUnique({
      where: { userId_contentId: { userId, contentId: content.id } },
    });
    if (existing) {
      return { contentId: content.id, favorited: true, alreadyFavorited: true };
    }
    await this.prisma.favorite.create({ data: { userId, contentId: content.id } });
    return { contentId: content.id, favorited: true, alreadyFavorited: false };
  }

  async remove(userId: string, contentIdOrSlug: string, _lang: Lang) {
    const content = await this.prisma.content.findFirst({
      where: { OR: [{ id: contentIdOrSlug }, { slug: contentIdOrSlug }] },
      select: { id: true },
    });
    if (!content) {
      throw DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound', { contentIdOrSlug });
    }
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_contentId: { userId, contentId: content.id } },
    });
    if (!existing) {
      return { contentId: content.id, favorited: false, alreadyFavorited: false };
    }
    await this.prisma.favorite.delete({ where: { userId_contentId: { userId, contentId: content.id } } });
    return { contentId: content.id, favorited: false, alreadyFavorited: false };
  }
}
