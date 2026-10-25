/**
 * Oynatma uçları (API_CONTRACT §4):
 *   POST /media/playback/:episodeId/session → yetki + imzalı URL
 *   GET  /media/hls/:episodeId/:sessionId.m3u8 → imzalı manifest (doğrulama)
 */
import { Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, requestOrigin, type RequestUser } from '../common/request-context';
import { Public } from '../auth/guards';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Post('playback/:episodeId/session')
  @ApiOperation({ summary: 'Oynatma oturumu: yetki kontrolü + imzalı URL (TTL 300 sn)' })
  async session(
    @CurrentUser() user: RequestUser | null,
    @Param('episodeId') episodeId: string,
    @Req() req: { protocol?: string; get?: (name: string) => string | undefined },
  ) {
    return this.media.createPlaybackSession(user, episodeId, requestOrigin(req));
  }

  @Public()
  @Get('hls/:episodeId/:sessionId.m3u8')
  @ApiOperation({ summary: 'İmzalı demo HLS manifesti (imza/süre doğrulamalı)' })
  async manifest(
    @Param('episodeId') episodeId: string,
    @Param('sessionId') sessionId: string,
    @Query('token') token: string,
    @Query('exp') exp: string,
    @Res() res: Response,
  ): Promise<void> {
    const expNum = Number.parseInt(exp ?? '0', 10);
    await this.media.verifySignedManifest(episodeId, sessionId, token ?? '', expNum);
    // Demo manifest: gerçek HLS akışı Faz 4'te VideoProviderAdapter ile gelir.
    res
      .status(200)
      .type('application/vnd.apple.mpegurl')
      .send(
        [
          '#EXTM3U',
          '#EXT-X-VERSION:3',
          '#EXT-X-TARGETDURATION:6',
          '#EXTINF:6.0,',
          `# demo segment (episode=${episodeId})`,
          '#EXT-X-ENDLIST',
        ].join('\n'),
      );
  }
}
