/**
 * Katalog/keşif/anı sayfa uçları (controller).
 *   GET /home                       (anonim; token varsa kişiselleştirme hazır)
 *   GET /catalog/titles             (anonim; filtre + sayfalama)
 *   GET /catalog/titles/:slug       (anonim; erişim kararlı bölümler)
 *   GET /catalog/episodes/:id       (anonim)
 *   GET /search                     (anonim)
 */
import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  searchParamsSchema,
  titleListParamsSchema,
  type EpisodeDetailResponse,
  type HomeResponse,
  type SearchResponse,
  type TitleDetailResponse,
  type TitleListResponse,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseQuery } from '../common/zod-validation.pipe';
import { CurrentLang, type Lang, type RequestUser } from '../common/request-context';
import { Public } from '../auth/guards';
import { AuthService } from '../auth/auth.service';
import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly auth: AuthService,
  ) {}

  /** Anonim uçlarda opsiyonel kullanıcı çözümü (kişiselleştirme). */
  private async optionalUser(req: Request): Promise<RequestUser | null> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    return this.auth.resolveOptionalUser(token);
  }

  @Public()
  @Get('home')
  @ApiOperation({ summary: 'Ana sayfa: bannerlar + içerik rayları' })
  async home(@Req() req: Request, @CurrentLang() lang: Lang): Promise<HomeResponse> {
    const user = await this.optionalUser(req);
    return this.catalog.home(lang, user);
  }

  @Public()
  @Get('catalog/titles')
  @ApiOperation({ summary: 'Sayfalı ve filtreli içerik listesi' })
  async listTitles(
    @Req() req: Request,
    @Query() query: unknown,
    @CurrentLang() lang: Lang,
  ): Promise<TitleListResponse> {
    const params = parseQuery(titleListParamsSchema, query);
    return this.catalog.listTitles(params, lang);
  }

  @Public()
  @Get('catalog/titles/:slug')
  @ApiOperation({ summary: 'İçerik detayı (sezonlar + erişim kararlı bölümler)' })
  async titleDetail(
    @Req() req: Request,
    @Param('slug') slug: string,
    @CurrentLang() lang: Lang,
  ): Promise<TitleDetailResponse> {
    const user = await this.optionalUser(req);
    return this.catalog.titleBySlug(slug, lang, user);
  }

  @Public()
  @Get('catalog/episodes/:id')
  @ApiOperation({ summary: 'Bölüm detayı ve erişim kararı' })
  async episodeDetail(
    @Req() req: Request,
    @Param('id') id: string,
    @CurrentLang() lang: Lang,
  ): Promise<EpisodeDetailResponse> {
    const user = await this.optionalUser(req);
    return this.catalog.episodeDetail(id, lang, user);
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Sayfalı içerik arama' })
  async search(
    @Req() req: Request,
    @Query() query: unknown,
    @CurrentLang() lang: Lang,
  ): Promise<SearchResponse> {
    const params = parseQuery(searchParamsSchema, query);
    return this.catalog.search(params, lang);
  }
}
