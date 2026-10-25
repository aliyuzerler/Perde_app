/**
 * Oynatma uçları (API_CONTRACT §4 — FAZ 4):
 *   POST /media/playback/:episodeId/session              → yetki + imzalı kaynaklar
 *   GET  /media/hls/:episodeId/:sessionId/:file(*)        → imzalı dosya servisi
 *          (master.m3u8, 240p/playlist.m3u8, 240p/seg000.ts, subtitles/tr.vtt, video.mp4)
 *   GET  /media/hls/:episodeId/:sessionId.m3u8            → eski uyum (master)
 *   PUT  /media/upload/:mediaId                            → imzalı doğrudan yükleme
 *
 * Dosya uçları her istekte: imza + süre + oturum iptali + READY denetimi.
 * Yanıtlar zarfa girmez (ikili/akış içerik — Express res doğrudan).
 */
import { Controller, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, requestOrigin, type RequestUser } from '../common/request-context';
import { Public } from '../auth/guards';
import { DomainError } from '../common/errors';
import { MediaService } from './media.service';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Public()
  @Post('playback/:episodeId/session')
  @ApiOperation({ summary: 'Oynatma oturumu: yetki kontrolü + imzalı akış kaynakları (TTL 300 sn)' })
  async session(
    @CurrentUser() user: RequestUser | null,
    @Param('episodeId') episodeId: string,
    @Req() req: Request,
  ) {
    return this.media.createPlaybackSession(user, episodeId, requestOrigin(req));
  }

  /** Eski uyum: oturum manifest'i (sessionId.m3u8) — master playlist döner. */
  @Public()
  @Get('hls/:episodeId/:sessionId.m3u8')
  @ApiOperation({ summary: 'İmzalı HLS master manifesti (eski uyum yolu)' })
  async manifestLegacy(
    @Param('episodeId') episodeId: string,
    @Param('sessionId') sessionId: string,
    @Query('token') token: string,
    @Query('exp') exp: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.serveFile(episodeId, sessionId, 'master.m3u8', token, exp, req, res);
  }

  /** İmzalı dosya servisi: manifest / varyant / segment / altyazı / mp4. */
  @Public()
  @Get('hls/:episodeId/:sessionId/*file')
  @ApiOperation({ summary: 'İmzalı oynatma dosyası (manifest/segment/altyazı/mp4)' })
  async file(
    @Param('episodeId') episodeId: string,
    @Param('sessionId') sessionId: string,
    @Param('file') file: string,
    @Query('token') token: string,
    @Query('exp') exp: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.serveFile(episodeId, sessionId, file, token, exp, req, res);
  }

  /**
   * İmzalı doğrudan yükleme (sağlayıcı ucu — local modda bu API'dir).
   * Gövde ham bayt akışıdır: JSON ayrıştırıcıya girmez (Content-Type video/*);
   * akış diske yazılır, üst sınır/magic byte sağlayıcıda denetlenir.
   */
  @Public()
  @Put('upload/:mediaId')
  @ApiOperation({ summary: 'İmzalı doğrudan yükleme (PUT, ham dosya gövdesi)' })
  async upload(
    @Param('mediaId') mediaId: string,
    @Query('token') token: string,
    @Query('exp') exp: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const contentType = req.headers['content-type'];
    if (contentType && /application\/(json|x-www-form-urlencoded)/.test(contentType)) {
      throw DomainError.badRequest('UNSUPPORTED_MEDIA', 'errors.unsupportedMedia', {
        hint: 'Yükleme gövdesi ham dosya baytlarıdır (video/mp4 vb.)',
      });
    }
    const result = await this.media.acceptUpload(
      mediaId,
      token ?? '',
      Number.parseInt(exp ?? '0', 10),
      req,
      contentType,
    );
    res.status(201).json({ ok: true, data: result });
  }

  private async serveFile(
    episodeId: string,
    sessionId: string,
    file: string | string[],
    token: string,
    exp: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    // Express 5 wildcard parametresi segment DİZİSİ döndürür ('240p/playlist.m3u8').
    const filePath = (Array.isArray(file) ? file.join('/') : file).replace(/^\/+/, '');
    const ctx = await this.media.verifyPlaybackRequest(
      episodeId,
      sessionId,
      token ?? '',
      Number.parseInt(exp ?? '0', 10),
    );
    // Yeniden yazım, isteği yanıtlayan sunucuyu işaret etsin (test portu dahil).
    ctx.origin = requestOrigin(req);
    const resolved = await this.media.resolvePlaybackFile(ctx, decodeURIComponent(filePath));

    if (resolved.body !== undefined) {
      res.status(200).type(resolved.contentType).send(resolved.body);
      return;
    }
    if (resolved.filePath && existsSync(resolved.filePath)) {
      const stat = statSync(resolved.filePath);
      const total = stat.size;
      // Range (bayt aralığı) desteği: oynatıcıların ileri sarma/bantlanma
      // istekleri 206 Partial Content ile karşılanır (tek aralık yeterlidir).
      const rangeHeader = req.headers.range;
      const rangeMatch =
        typeof rangeHeader === 'string'
          ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
          : null;

      const streamRange = (start: number, end: number): void => {
        res.status(206);
        res.type(resolved.contentType!);
        res.set('Content-Range', `bytes ${start}-${end}/${total}`);
        res.set('Accept-Ranges', 'bytes');
        res.set('Content-Length', String(end - start + 1));
        const stream = createReadStream(resolved.filePath!, { start, end });
        stream.on('error', () => {
          if (!res.headersSent) res.status(500).end();
          else res.end();
        });
        stream.pipe(res);
      };

      if (rangeMatch) {
        const rawStart = rangeMatch[1];
        const rawEnd = rangeMatch[2];
        // 'bytes=a-b' | 'bytes=a-' | 'bytes=-N' (son N bayt → başlangıç kaymalı)
        let start: number;
        let end: number;
        if (rawStart === '') {
          const suffix = Number(rawEnd);
          start = Math.max(0, total - suffix);
          end = total - 1;
        } else {
          start = Number(rawStart);
          end = rawEnd === '' ? total - 1 : Math.min(Number(rawEnd), total - 1);
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
          res.status(416).set('Content-Range', `bytes */${total}`).end();
          return;
        }
        streamRange(start, end);
        return;
      }

      // Tam içerik (200): akış ile servis edilir, belleğe alınmaz.
      res.status(200);
      res.type(resolved.contentType);
      res.set('Accept-Ranges', 'bytes');
      res.set('Content-Length', String(total));
      const stream = createReadStream(resolved.filePath);
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
      return;
    }
    throw DomainError.notFound('MEDIA_FILE_NOT_FOUND', 'errors.notFound');
  }
}
