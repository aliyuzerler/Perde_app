/**
 * İzleme ilerlemesi (BR-09: kaldığı yerden devam).
 *   PUT  /watch-progress/:episodeId → konum kaydet (upsert)
 *   GET  /watch-progress            → devam et rayı
 *   GET  /watch-progress/:episodeId → tek bölüm konumu
 */
import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import {
  pageRequestSchema,
  watchProgressPutSchema,
  type WatchProgressPut,
  type WatchProgressListResponse,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe, parseQuery } from '../common/zod-validation.pipe';
import { CurrentUser, CurrentLang, type Lang, type RequestUser } from '../common/request-context';
import { WatchProgressService } from './watch-progress.service';

@ApiTags('watch-progress')
@Controller('watch-progress')
export class WatchProgressController {
  constructor(private readonly progress: WatchProgressService) {}

  @Put(':episodeId')
  @ApiOperation({ summary: 'Oynatma konumunu kaydet (upsert)' })
  async save(
    @CurrentUser() user: RequestUser,
    @Param('episodeId') episodeId: string,
    @Body(new ZodValidationPipe(watchProgressPutSchema)) dto: WatchProgressPut,
  ): Promise<{ saved: true; completed: boolean }> {
    return this.progress.save(user.id, episodeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Devam et listesi (son izlenenler)' })
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: unknown,
    @CurrentLang() lang: Lang,
  ): Promise<WatchProgressListResponse> {
    const { page, pageSize } = parseQuery(pageRequestSchema, query);
    return this.progress.list(user.id, page, pageSize, lang);
  }

  @Get(':episodeId')
  @ApiOperation({ summary: 'Tek bölüm ilerlemesi' })
  async get(
    @CurrentUser() user: RequestUser,
    @Param('episodeId') episodeId: string,
  ): Promise<{ episodeId: string; positionSeconds: number; completed: boolean; lastWatchedAt: string | null }> {
    return this.progress.get(user.id, episodeId);
  }
}
