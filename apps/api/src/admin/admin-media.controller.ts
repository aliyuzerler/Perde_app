/**
 * Yönetim medya uçları (FAZ 4) — rol korumalı (EDITOR/ADMIN).
 *
 * Yükleme iş akışı (sağlayıcı bağımsız — MediaProvider portu):
 *   POST   /admin/episodes/:episodeId/media/upload-url → süreli imzalı yükleme anahtarı
 *   PUT    <uploadUrl>                                  → dosya DOĞRUDAN sağlayıcıya (bu uç değil)
 *   GET    /admin/media/:mediaId                        → işleme durumu (polling)
 *   POST   /admin/media/:mediaId/sync                   → sağlayıcı durumu yeniden çekilir
 *   GET    /admin/episodes/:episodeId/media             → bölümün medya kayıtları
 *   DELETE /admin/media/:mediaId                        → kayıt + sağlayıcı asset silimi
 *
 * Oynatma yalnızca state=READY ve bölüm PUBLISHED iken açılır; işleme sürerken
 * bölüm herkese açık uçlarda görünmez (PROCESSING — Kural 6).
 */
import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { mediaUploadUrlRequestSchema } from '@perdego/contracts';
import type { MediaUploadUrlRequest } from '@perdego/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, requestOrigin, type RequestUser } from '../common/request-context';
import { Roles } from '../auth/guards';
import { MediaService } from '../media/media.service';

@ApiTags('admin')
@Roles('EDITOR', 'ADMIN')
@Controller('admin')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Post('episodes/:episodeId/media/upload-url')
  @ApiOperation({ summary: 'Sağlayıcıya doğrudan yükleme anahtarı üret (süreli + imzalı)' })
  async createUploadUrl(
    @CurrentUser() actor: RequestUser,
    @Param('episodeId') episodeId: string,
    @Body(new ZodValidationPipe(mediaUploadUrlRequestSchema)) dto: MediaUploadUrlRequest,
    @Req() req: Request,
  ) {
    return this.media.createUploadUrl(
      actor,
      episodeId,
      { originalName: dto.originalName, contentType: dto.contentType },
      requestOrigin(req),
    );
  }

  @Get('media/:mediaId')
  @ApiOperation({ summary: 'Medya işleme durumu (AWAITING_UPLOAD/PROCESSING/READY/ERROR)' })
  async status(@Param('mediaId') mediaId: string) {
    return this.media.getMediaStatus(mediaId);
  }

  @Post('media/:mediaId/sync')
  @ApiOperation({ summary: 'Sağlayıcıdan işleme durumunu yeniden çek (transkod takibi)' })
  async sync(@Param('mediaId') mediaId: string) {
    return this.media.syncMediaStatus(mediaId);
  }

  @Get('episodes/:episodeId/media')
  @ApiOperation({ summary: 'Bölümün medya kayıtları' })
  async listEpisodeMedia(@Param('episodeId') episodeId: string) {
    return this.media.listEpisodeMedia(episodeId);
  }

  @Delete('media/:mediaId')
  @ApiOperation({ summary: 'Medya kaydını + sağlayıcı assetini sil (audit loglanır)' })
  async deleteMedia(@CurrentUser() actor: RequestUser, @Param('mediaId') mediaId: string) {
    return this.media.deleteMedia(actor, mediaId);
  }
}
