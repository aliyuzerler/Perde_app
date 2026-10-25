/**
 * Kategori servisi: keşfet listesi ve kategori sayfası içeriği.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors';
import { buildPageMeta, prismaSkipTake } from '../common/pagination';
import { publishedContentFilter } from '../catalog/catalog.service';import { toContentSummary } from '../catalog/content-mapper';
import type { Lang } from '../common/request-context';
import { pickLang } from '../common/request-context';
import { ENV } from '../config/env.module';
import { Inject } from '@nestjs/common';
import type { Env } from '../config/env.schema';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(lang: Lang) {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { contents: true } } },
    });
    return {
      items: categories.map((category) => ({
        slug: category.slug,
        name: pickLang(lang, category.nameTr, category.nameEn),
        contentCount: category._count.contents,
      })),
    };
  }

  async categoryContent(slug: string, lang: Lang, page: number, pageSize: number) {
    const category = await this.prisma.category.findUnique({ where: { slug } });
    if (!category || !category.isActive) {
      throw DomainError.notFound('CATEGORY_NOT_FOUND', 'errors.categoryNotFound', { slug });
    }

    const where = { ...publishedContentFilter(), categories: { some: { categoryId: category.id } } };
    const [rows, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        include: { categories: { include: { category: { select: { slug: true, sortOrder: true } } } } },
        ...prismaSkipTake(page, pageSize),
      }),
      this.prisma.content.count({ where }),
    ]);

    return {
      category: {
        slug: category.slug,
        name: pickLang(lang, category.nameTr, category.nameEn),
        contentCount: total,
      },
      items: rows.map((row) => toContentSummary(row, lang, this.env.PUBLIC_BASE_URL)),
      meta: buildPageMeta(page, pageSize, total),
    };
  }
}
