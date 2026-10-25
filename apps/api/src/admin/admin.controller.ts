/**
 * Admin uçları — rol korumalı (EDITOR/ADMIN; kredi düzeltmesi yalnız ADMIN).
 *
 * Kullanıcı/ödemeler:
 *   GET   /admin/audit-logs
 *   GET   /admin/users
 *   POST  /admin/users/:userId/credits/adjust   (ADMIN; note zorunlu)
 *
 * İçerik yaşam döngüsü (Faz 2c):
 *   POST  /admin/titles                        (DRAFT oluşturur)
 *   POST  /admin/titles/:id/publish            (PUBLISHED'e alır)
 *   GET   /admin/titles                        (TÜM durumlar; status/kind/search + sayfalama)
 *   PATCH /admin/titles/:id/status             (TASLAK→İŞLENİYOR→YAYINDA→ARŞİVDE matrisi)
 *
 * Ana sayfa düzeni yönetimi (Faz 2c):
 *   GET   /admin/banners · POST /admin/banners · PATCH/DELETE /admin/banners/:id
 *   GET   /admin/home-sections · POST /admin/home-sections · PATCH/DELETE /admin/home-sections/:id
 *   POST  /admin/home-sections/:id/items · DELETE /admin/home-sections/:id/items/:itemId
 *
 * Yayın görünürlüğü ayrımı: herkese açık uçlar yalnızca PUBLISHED döner;
 * DRAFT/PROCESSING/ARCHIVED bu görünümde yaşar (Kural 6).
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminStatusChangeSchema,
  adminTitleListParamsSchema,
  bannerInputSchema,
  bannerUpdateSchema,
  homeSectionInputSchema,
  homeSectionItemInputSchema,
  homeSectionUpdateSchema,
  pageRequestSchema,
} from '@perdego/contracts';
import { parseQuery, ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, CurrentLang, type Lang, type RequestUser } from '../common/request-context';
import { Roles } from '../auth/guards';
import { AdminService } from './admin.service';

const adjustCreditsSchema = z.object({
  purchasedDelta: z.number().int().optional().default(0),
  grantedDelta: z.number().int().optional().default(0),
  note: z.string().trim().min(3, 'Düzeltme gerekçesi zorunludur').max(500),
});

const createContentSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug kebab-case olmalı'),
  kind: z.enum(['FILM', 'SERIES', 'SHORT_FILM']),
  seriesFormat: z.enum(['STANDARD', 'MINI']).optional(),
  titleTr: z.string().min(1),
  titleEn: z.string().min(1),
  synopsisTr: z.string().min(1),
  synopsisEn: z.string().min(1),
  releaseYear: z.number().int().min(1890).max(2100),
  ageRating: z.string().optional(),
  accessType: z.enum(['FREE', 'SUBSCRIPTION', 'CREDIT']).optional(),
  categorySlugs: z.array(z.string().min(1)).optional(),
});

@ApiTags('admin')
@Roles('EDITOR', 'ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('audit-logs')
  @ApiOperation({ summary: 'Denetim günlüğü (sayfalı)' })
  async auditLogs(@Query() query: unknown) {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    const entityType = typeof query === 'object' && query !== null && 'entityType' in query
      ? String((query as Record<string, unknown>).entityType)
      : undefined;
    return this.admin.listAuditLogs(page, pageSize, entityType ? { entityType } : undefined);
  }

  @Get('users')
  @ApiOperation({ summary: 'Kullanıcı listesi (arama + sayfalama)' })
  async users(@Query() query: unknown) {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    const search = typeof query === 'object' && query !== null && 'search' in query
      ? String((query as Record<string, unknown>).search)
      : undefined;
    return this.admin.listUsers(page, pageSize, search);
  }

  @Roles('ADMIN')
  @Post('users/:userId/credits/adjust')
  @ApiOperation({ summary: 'Kredi düzeltmesi (ADMIN; note zorunlu, audit loglanır)' })
  async adjustCredits(
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(adjustCreditsSchema)) dto: z.infer<typeof adjustCreditsSchema>,
  ) {
    return this.admin.adjustCredits({
      targetUserId: userId,
      purchasedDelta: dto.purchasedDelta,
      grantedDelta: dto.grantedDelta,
      note: dto.note,
      actorUserId: actor.id,
      ipHash: req.ip ? createHash('sha256').update(req.ip).digest('hex').slice(0, 32) : undefined,
    });
  }

  // ---------------- İçerik yaşam döngüsü --------------------------------------

  @Post('titles')
  @ApiOperation({ summary: 'İçerik taslağı oluştur (herkese açık uçlarda görünmez)' })
  async createContent(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createContentSchema)) dto: z.infer<typeof createContentSchema>,
  ) {
    return this.admin.createContent(dto, actor.id);
  }

  @Post('titles/:id/publish')
  @ApiOperation({ summary: 'İçeriği yayına al' })
  async publish(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.admin.publishContent(id, actor.id);
  }

  @Get('titles')
  @ApiOperation({ summary: 'Yönetim içerik listesi (TÜM durumlar; status/kind/search + sayfalama)' })
  async listTitles(@Query() query: unknown, @CurrentLang() lang: Lang) {
    const params = parseQuery(adminTitleListParamsSchema, query);
    return this.admin.listTitles(params, lang);
  }

  @Patch('titles/:id/status')
  @ApiOperation({ summary: 'İçerik durum geçişi (taslak/işleniyor/yayında/arşivde matrisi)' })
  async changeStatus(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminStatusChangeSchema)) dto: { status: 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED' },
  ) {
    return this.admin.changeStatus(id, dto.status, actor.id);
  }

  // ---------------- Banner yönetimi -------------------------------------------

  @Get('banners')
  @ApiOperation({ summary: 'Banner listesi (yönetim)' })
  async listBanners() {
    return this.admin.listBanners();
  }

  @Post('banners')
  @ApiOperation({ summary: 'Banner oluştur' })
  async createBanner(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(bannerInputSchema)) dto: z.infer<typeof bannerInputSchema>,
  ) {
    return this.admin.createBanner(dto, actor.id);
  }

  @Patch('banners/:id')
  @ApiOperation({ summary: 'Banner güncelle' })
  async updateBanner(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(bannerUpdateSchema)) dto: z.infer<typeof bannerUpdateSchema>,
  ) {
    return this.admin.updateBanner(id, dto, actor.id);
  }

  @Delete('banners/:id')
  @ApiOperation({ summary: 'Banner sil' })
  async deleteBanner(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.admin.deleteBanner(id, actor.id);
  }

  // ---------------- Ana sayfa bölüm yönetimi ----------------------------------

  @Get('home-sections')
  @ApiOperation({ summary: 'Ana sayfa bölüm listesi (items dahil)' })
  async listHomeSections(@CurrentLang() lang: Lang) {
    return this.admin.listHomeSections(lang);
  }

  @Post('home-sections')
  @ApiOperation({ summary: 'Ana sayfa bölümü oluştur (HERO | RAIL | CATEGORY_GRID)' })
  async createHomeSection(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(homeSectionInputSchema)) dto: z.infer<typeof homeSectionInputSchema>,
  ) {
    return this.admin.createHomeSection(dto, actor.id);
  }

  @Patch('home-sections/:id')
  @ApiOperation({ summary: 'Ana sayfa bölümü güncelle' })
  async updateHomeSection(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(homeSectionUpdateSchema)) dto: z.infer<typeof homeSectionUpdateSchema>,
  ) {
    return this.admin.updateHomeSection(id, dto, actor.id);
  }

  @Delete('home-sections/:id')
  @ApiOperation({ summary: 'Ana sayfa bölümü sil (items cascade)' })
  async deleteHomeSection(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.admin.deleteHomeSection(id, actor.id);
  }

  @Post('home-sections/:id/items')
  @ApiOperation({ summary: 'Küratörlü bölüme içerik ekle' })
  async addHomeSectionItem(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(homeSectionItemInputSchema)) dto: { contentId: string },
  ) {
    return this.admin.addHomeSectionItem(id, dto.contentId, actor.id);
  }

  @Delete('home-sections/:id/items/:itemId')
  @ApiOperation({ summary: 'Küratörlü bölümden içerik çıkar' })
  async removeHomeSectionItem(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.admin.removeHomeSectionItem(id, itemId, actor.id);
  }
}
