/**
 * Kategori modülü (keşfet): liste + kategori içerikleri.
 *   GET /catalog/categories          → kategori listesi (anonim)
 *   GET /catalog/categories/:slug/titles → kategori içeriği (anonim, sayfalı)
 */
import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  pageRequestSchema,
  type CategoryDetailResponse,
  type CategoryListResponse,
  type TitleListResponse,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseQuery } from '../common/zod-validation.pipe';
import { CurrentLang, type Lang } from '../common/request-context';
import { Public } from '../auth/guards';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@Controller('catalog/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Aktif kategori listesi (içerik sayısıyla)' })
  async list(@CurrentLang() lang: Lang): Promise<CategoryListResponse> {
    return this.categories.list(lang);
  }

  @Public()
  @Get(':slug/titles')
  @ApiOperation({ summary: 'Kategorinin yayındaki içerikleri (sayfalı)' })
  async content(
    @Param('slug') slug: string,
    @Query() query: unknown,
    @CurrentLang() lang: Lang,
  ): Promise<CategoryDetailResponse & { meta?: TitleListResponse['meta'] }> {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    return this.categories.categoryContent(slug, lang, page, pageSize);
  }
}
