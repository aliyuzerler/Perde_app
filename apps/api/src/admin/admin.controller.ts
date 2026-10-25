/**
 * Admin uçları — rol korumalı (EDITOR/ADMIN; kredi düzeltmesi yalnız ADMIN).
 *   GET   /admin/audit-logs
 *   GET   /admin/users
 *   POST  /admin/users/:userId/credits/adjust   (ADMIN; note zorunlu)
 *   POST  /admin/titles                          (DRAFT oluşturur)
 *   POST  /admin/titles/:id/publish
 */
import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { pageRequestSchema } from '@perdego/contracts';
import { parseQuery, ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../common/request-context';
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
}
