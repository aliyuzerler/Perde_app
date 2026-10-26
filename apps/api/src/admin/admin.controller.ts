/**
 * Yönetim uçları — rol korumalı (EDITOR/ADMIN; finansal/kritik işlemler
 * ADMIN + adım-yukarı token'ı — FAZ 8).
 *
 * Kullanıcı/ödemeler:
 *   GET   /admin/audit-logs                      (FAZ 8: action/actorId filtreleri)
 *   GET   /admin/users
 *   GET   /admin/users/:userId                   (FAZ 8 detay)
 *   POST  /admin/users/:userId/credits/adjust   (ADMIN; note zorunlu)
 *   PATCH /admin/users/:userId/status            (ADMIN + step-up — FAZ 8)
 *   PATCH /admin/users/:userId/role              (ADMIN + step-up — FAZ 8)
 *
 * İçerik yaşam döngüsü (Faz 2c + FAZ 8 düzenleme):
 *   POST  /admin/titles                        (DRAFT oluşturur)
 *   POST  /admin/titles/:id/publish            (PUBLISHED'e alır)
 *   GET   /admin/titles                        (TÜM durumlar; status/kind/search + sayfalama)
 *   GET   /admin/titles/:id                    (detay: sezonlar+bölümler+medya — FAZ 8)
 *   PATCH /admin/titles/:id/status             (TASLAK→İŞLENİYOR→YAYINDA→ARŞİVDE matrisi)
 *   PATCH /admin/titles/:id                    (afiş/başlık/açıklama/kategori — FAZ 8)
 *
 * Sezon/bölüm (FAZ 8):
 *   POST  /admin/titles/:id/seasons · PATCH /admin/seasons/:id
 *   POST  /admin/titles/:id/episodes · PATCH/DELETE /admin/episodes/:id
 *   PATCH /admin/episodes/:id/status (yayınla / yayından kaldır)
 *
 * Gelir modeli (FAZ 8; güncellemeler ADMIN + step-up):
 *   GET   /admin/plans · PATCH /admin/plans/:id
 *   GET   /admin/credit-packs · PATCH /admin/credit-packs/:id
 *   GET   /admin/store-transactions · GET /admin/credit-ledger
 *
 * Bildirim kampanyaları (FAZ 8; gönderim ADMIN + step-up):
 *   GET   /admin/notification-campaigns · POST /admin/notification-campaigns
 *   POST  /admin/notification-campaigns/:id/cancel
 *
 * Dashboard (FAZ 8):
 *   GET   /admin/dashboard?from&to
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
  adminCampaignInputSchema,
  adminCreditLedgerListParamsSchema,
  adminCreditPackUpdateSchema,
  adminDashboardParamsSchema,
  adminEpisodeInputSchema,
  adminEpisodeStatusChangeSchema,
  adminEpisodeUpdateSchema,
  adminPlanUpdateSchema,
  adminSeasonInputSchema,
  adminSeasonUpdateSchema,
  adminSendListParamsSchema,
  adminStatusChangeSchema,
  adminStoreTransactionListParamsSchema,
  adminTitleListParamsSchema,
  adminTitleUpdateSchema,
  adminUserStatusUpdateSchema,
  adminUserRoleUpdateSchema,
  bannerInputSchema,
  bannerUpdateSchema,
  homeSectionInputSchema,
  homeSectionItemInputSchema,
  homeSectionUpdateSchema,
  pageRequestSchema,
} from '@perdego/contracts';
import { parseQuery, ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, CurrentLang, type Lang, type RequestUser } from '../common/request-context';
import { Roles, StepUp } from '../auth/guards';
import { CampaignsService } from '../notifications/campaigns.service';
import { PushDispatchService } from '../notifications/push-dispatch.service';
import { AdminService } from './admin.service';

const adjustCreditsSchema = z.object({
  purchasedDelta: z.number().int().optional().default(0),
  grantedDelta: z.number().int().optional().default(0),
  note: z.string().trim().min(3, 'Düzeltme gerekçesi zorunludur').max(500),
});

const hashIp = (ip: string | undefined): string | undefined =>
  ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : undefined;

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
  constructor(
    private readonly admin: AdminService,
    private readonly campaigns: CampaignsService,
    private readonly push: PushDispatchService,
  ) {}

  @Get('audit-logs')
  @ApiOperation({ summary: 'Denetim günlüğü (sayfalı; FAZ 8: action/actorId filtreleri)' })
  async auditLogs(@Query() query: unknown) {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    const q = query as Record<string, unknown>;
    const entityType = typeof q?.entityType === 'string' ? q.entityType : undefined;
    const entityId = typeof q?.entityId === 'string' ? q.entityId : undefined;
    const action = typeof q?.action === 'string' && q.action.length > 0 ? q.action : undefined;
    const actorUserId = typeof q?.actorId === 'string' && q.actorId.length > 0 ? q.actorId : undefined;
    return this.admin.listAuditLogs(page, pageSize, { entityType, entityId, action, actorUserId });
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

  // ---------------------------------------------------------------------------
  // FAZ 8 — Dashboard
  // ---------------------------------------------------------------------------

  @Get('dashboard')
  @ApiOperation({ summary: 'Panel özeti (kullanıcı/abonelik/katalog/satın alma/kredi + tarih aralığı)' })
  async dashboard(@Query() query: unknown) {
    const params = parseQuery(adminDashboardParamsSchema, query);
    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from
      ? new Date(params.from)
      : new Date(to.getTime() - 30 * 86_400_000);
    return this.admin.getDashboard({ from, to });
  }

  // ---------------------------------------------------------------------------
  // FAZ 8 — Yapım düzenleme + yönetim detayı
  // ---------------------------------------------------------------------------

  @Get('titles/:id')
  @ApiOperation({ summary: 'Yapım yönetim detayı (sezonlar + bölümler + medya durumu)' })
  async titleDetail(@Param('id') id: string) {
    return this.admin.getTitleDetail(id);
  }

  @Patch('titles/:id')
  @ApiOperation({ summary: 'Yapım düzenle: başlık, açıklama, afiş, kategori, erişim modeli (audit loglu)' })
  async updateTitle(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminTitleUpdateSchema)) dto: z.infer<typeof adminTitleUpdateSchema>,
  ) {
    return this.admin.updateTitle(id, dto, actor.id);
  }

  // ---------------------------------------------------------------------------
  // FAZ 8 — Sezon ve bölüm yönetimi
  // ---------------------------------------------------------------------------

  @Post('titles/:id/seasons')
  @ApiOperation({ summary: 'Sezon oluştur (audit loglu)' })
  async createSeason(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminSeasonInputSchema)) dto: z.infer<typeof adminSeasonInputSchema>,
  ) {
    return this.admin.createSeason(id, dto, actor.id);
  }

  @Patch('seasons/:seasonId')
  @ApiOperation({ summary: 'Sezon düzenle (audit loglu)' })
  async updateSeason(
    @CurrentUser() actor: RequestUser,
    @Param('seasonId') seasonId: string,
    @Body(new ZodValidationPipe(adminSeasonUpdateSchema)) dto: z.infer<typeof adminSeasonUpdateSchema>,
  ) {
    return this.admin.updateSeason(seasonId, dto, actor.id);
  }

  @Post('titles/:id/episodes')
  @ApiOperation({ summary: 'Bölüm oluştur: numara, süre, erişim modeli, kredi fiyatı (DRAFT başlar)' })
  async createEpisode(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(adminEpisodeInputSchema)) dto: z.infer<typeof adminEpisodeInputSchema>,
  ) {
    return this.admin.createEpisode(id, dto, actor.id);
  }

  @Patch('episodes/:episodeId')
  @ApiOperation({ summary: 'Bölüm düzenle: metaveri + erişim modeli + kredi fiyatı (audit loglu)' })
  async updateEpisode(
    @CurrentUser() actor: RequestUser,
    @Param('episodeId') episodeId: string,
    @Body(new ZodValidationPipe(adminEpisodeUpdateSchema)) dto: z.infer<typeof adminEpisodeUpdateSchema>,
  ) {
    return this.admin.updateEpisode(episodeId, dto, actor.id);
  }

  @Patch('episodes/:episodeId/status')
  @ApiOperation({ summary: 'Bölüm yayınla / yayından kaldır / arşivle (geçiş matrisi denetimli)' })
  async changeEpisodeStatus(
    @CurrentUser() actor: RequestUser,
    @Param('episodeId') episodeId: string,
    @Body(new ZodValidationPipe(adminEpisodeStatusChangeSchema)) dto: z.infer<typeof adminEpisodeStatusChangeSchema>,
  ) {
    return this.admin.changeEpisodeStatus(episodeId, dto.status, actor.id);
  }

  @Delete('episodes/:episodeId')
  @ApiOperation({ summary: 'Bölüm sil (yalnızca izleme/açma kaydı olmayan taslak/arşiv bölümü)' })
  async deleteEpisode(@CurrentUser() actor: RequestUser, @Param('episodeId') episodeId: string) {
    return this.admin.deleteEpisode(episodeId, actor.id);
  }

  // ---------------------------------------------------------------------------
  // FAZ 8 — Gelir modeli (finansal görünümler EDITOR/ADMIN; güncellemeler
  // ADMIN + adım-yukarı)
  // ---------------------------------------------------------------------------

  @Get('plans')
  @ApiOperation({ summary: 'Abonelik planları (platform ürün kimlikleriyle)' })
  async listPlans() {
    return this.admin.listPlans();
  }

  @Roles('ADMIN')
  @StepUp()
  @Patch('plans/:planId')
  @ApiOperation({ summary: 'Plan güncelle: fiyat, ürün kimliği, aktiflik (ADMIN + step-up, audit loglu)' })
  async updatePlan(
    @CurrentUser() actor: RequestUser,
    @Param('planId') planId: string,
    @Body(new ZodValidationPipe(adminPlanUpdateSchema)) dto: z.infer<typeof adminPlanUpdateSchema>,
  ) {
    return this.admin.updatePlan(planId, dto, actor.id);
  }

  @Get('credit-packs')
  @ApiOperation({ summary: 'Kredi paketleri (platform ürün kimlikleriyle)' })
  async listCreditPacks() {
    return this.admin.listCreditPacks();
  }

  @Roles('ADMIN')
  @StepUp()
  @Patch('credit-packs/:packId')
  @ApiOperation({ summary: 'Kredi paketi güncelle (ADMIN + step-up, audit loglu)' })
  async updateCreditPack(
    @CurrentUser() actor: RequestUser,
    @Param('packId') packId: string,
    @Body(new ZodValidationPipe(adminCreditPackUpdateSchema)) dto: z.infer<typeof adminCreditPackUpdateSchema>,
  ) {
    return this.admin.updateCreditPack(packId, dto, actor.id);
  }

  @Get('store-transactions')
  @ApiOperation({ summary: 'Satın alma kayıtları (iade/durum filtreli, sayfalı)' })
  async listStoreTransactions(@Query() query: unknown) {
    const params = parseQuery(adminStoreTransactionListParamsSchema, query);
    return this.admin.listStoreTransactions(params);
  }

  @Get('credit-ledger')
  @ApiOperation({ summary: 'Kredi ledger hareketleri (tip/kullanıcı filtreli, sayfalı)' })
  async listLedger(@Query() query: unknown) {
    const params = parseQuery(adminCreditLedgerListParamsSchema, query);
    return this.admin.listLedger(params);
  }

  // ---------------------------------------------------------------------------
  // FAZ 8 — Kullanıcı yönetimi
  // ---------------------------------------------------------------------------

  @Get('users/:userId')
  @ApiOperation({ summary: 'Kullanıcı detayı: profil + cüzdan + abonelik + son hareketler' })
  async userDetail(@Param('userId') userId: string) {
    return this.admin.getUserDetail(userId);
  }

  @Roles('ADMIN')
  @StepUp()
  @Patch('users/:userId/status')
  @ApiOperation({ summary: 'Kullanıcı askıya al / geri al (ADMIN + step-up, audit loglu)' })
  async changeUserStatus(
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(adminUserStatusUpdateSchema)) dto: z.infer<typeof adminUserStatusUpdateSchema>,
  ) {
    return this.admin.changeUserStatus(userId, dto.status, actor.id, hashIp(req.ip));
  }

  @Roles('ADMIN')
  @StepUp()
  @Patch('users/:userId/role')
  @ApiOperation({ summary: 'Kullanıcı rolü değiştir (ADMIN + step-up, audit loglu)' })
  async changeUserRole(
    @CurrentUser() actor: RequestUser,
    @Req() req: Request,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(adminUserRoleUpdateSchema)) dto: z.infer<typeof adminUserRoleUpdateSchema>,
  ) {
    return this.admin.changeUserRole(userId, dto.role, actor.id, hashIp(req.ip));
  }

  // ---------------------------------------------------------------------------
  // FAZ 8 — Bildirim kampanyaları
  // ---------------------------------------------------------------------------

  @Get('notification-campaigns')
  @ApiOperation({ summary: 'Kampanya listesi (durum + sonuç sayaçlarıyla)' })
  async listCampaigns() {
    return this.campaigns.list();
  }

  @Roles('ADMIN')
  @StepUp()
  @Post('push/dispatch')
  @ApiOperation({
    summary:
      'Push dispatch + süpürmeleri elle tetikle (FAZ 9): PENDING gönderimler, geçersiz token temizliği, abonelik hatırlatmaları',
  })
  async dispatchPush(@CurrentUser() actor: RequestUser) {
    void actor;
    const dispatch = await this.push.dispatchPending();
    const sweeps = await this.push.runSweeps();
    return {
      dispatch,
      removedTokens: sweeps.removed,
      reminders: sweeps.reminders,
      provider: this.push.providerName,
    };
  }

  @Get('notification-campaigns/:id/sends')
  @ApiOperation({
    summary: 'Kampanya push gönderim izleri (cihaz başına PENDING/SENT/FAILED + sayaçlar — FAZ 9)',
  })
  async listCampaignSends(
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    const params = parseQuery(adminSendListParamsSchema, query);
    return this.campaigns.listSends(id, params);
  }

  @Roles('ADMIN')
  @StepUp()
  @Post('notification-campaigns')
  @ApiOperation({ summary: 'Duyuru oluştur: derhal gönder veya planla (ADMIN + step-up)' })
  async createCampaign(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(adminCampaignInputSchema)) dto: z.infer<typeof adminCampaignInputSchema>,
  ) {
    return this.campaigns.create(dto, actor.id);
  }

  @Roles('ADMIN')
  @StepUp()
  @Post('notification-campaigns/:id/cancel')
  @ApiOperation({ summary: 'Planlanmış kampanyayı iptal et (ADMIN + step-up)' })
  async cancelCampaign(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.campaigns.cancel(id, actor.id);
  }
}
