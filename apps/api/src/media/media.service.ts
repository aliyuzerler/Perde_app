/**
 * Oynatma (media) servisi — video erişim hakkı katmanı (Kural 5).
 *
 * - playback_sessions: imzalı URL sahipliği + paralel oynatma sayacı (≤ limit).
 * - İmzalı URL: HMAC-SHA256(sessionId, episodeId, exp) — sağlayıcı
 *   VideoProviderAdapter'ı Faz 4'te gerçek HLS URL'i üretir; buradaki
 *   /media/hls ucu imzalı manifest akışını kanıtlar (TTL 300 sn).
 * - Karar YENİDEN doğrulanır (BR-07): istemci canPlay=true gönderse bile
 *   AccessService kararı olmadan oturum açılmaz.
 */
import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { AccessService } from '../episodes/access.service';
import type { RequestUser } from '../common/request-context';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Oynatma oturumu açar. Hatalar: 404 bölüm yok, 409 encode sürüyor,
   * 402 abonelik/kredi, 403 yaş/askı, 409 paralel limit.
   *
   * origin: isteğin kendi kökeni (media.controller iletir); verilmemişse
   * PUBLIC_BASE_URL kullanılır. Böylece üretilen playbackUrl daima yanıtı
   * veren sunucuyu işaret eder (test/geliştirmede rastgele port dahil).
   */
  async createPlaybackSession(user: RequestUser | null, episodeId: string, origin?: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        content: { select: { status: true, ageRating: true, slug: true } },
        media: { where: { state: 'READY' }, take: 1 },
      },
    });
    if (!episode || episode.content.status !== 'PUBLISHED' || episode.status !== 'PUBLISHED') {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
    }
    if (episode.media.length === 0) {
      throw DomainError.conflict('EPISODE_NOT_READY', 'errors.episodeNotReady');
    }

    const fullUser = user ? await this.prisma.user.findUnique({ where: { id: user.id } }) : null;
    const access = await this.access.decide(episode, fullUser);
    if (!access.canPlay) {
      switch (access.reason) {
        case 'NEEDS_SUBSCRIPTION':
          throw DomainError.paymentRequired('NEEDS_SUBSCRIPTION', 'errors.needsSubscription');
        case 'NEEDS_CREDITS':
          throw DomainError.paymentRequired('NEEDS_CREDITS', 'errors.needsCredits', {
            creditCost: episode.creditCost,
          });
        case 'AGE_RESTRICTED':
          throw DomainError.forbidden('AGE_RESTRICTED', 'errors.ageRestricted');
        default:
          throw DomainError.forbidden('EPISODE_NOT_UNLOCKED', 'errors.notPlayable');
      }
    }

    // Paralel oynatma limiti (FREE izleyicilerde de uygulanır).
    if (fullUser) {
      const active = await this.prisma.playbackSession.count({
        where: { userId: fullUser.id, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (active >= this.env.PLAYBACK_MAX_PARALLEL) {
        throw DomainError.conflict('PLAYBACK_LIMIT_REACHED', 'errors.playbackLimit', {
          limit: this.env.PLAYBACK_MAX_PARALLEL,
        });
      }
    }

    const guest = !fullUser;
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + this.env.PLAYBACK_TTL_SECONDS * 1000);

    // Kayıtlı kullanıcı: oturum satırı (sahiplik + iptal + limit). Misafir:
    // yalnızca imzalı kısa ömürlü URL (BR-08 — FREE içerik konuklara açık).
    if (!guest) {
      await this.prisma.playbackSession.create({
        data: {
          userId: fullUser.id,
          episodeId,
          expiresAt,
        },
      });
    }

    const positionRow = fullUser
      ? await this.prisma.watchHistory.findUnique({
          where: { userId_episodeId: { userId: fullUser.id, episodeId } },
        })
      : null;

    const exp = Math.floor(expiresAt.getTime() / 1000);
    const token = createHmac('sha256', this.signingSecret())
      .update(`${sessionId}:${episodeId}:${exp}`)
      .digest('hex')
      .slice(0, 32);
    const base = (origin ?? this.env.PUBLIC_BASE_URL).replace(/\/+$/, '');

    return {
      episodeId,
      playbackUrl: `${base}/api/v1/media/hls/${episodeId}/${sessionId}.m3u8?token=${token}&exp=${exp}`,
      expiresAt: expiresAt.toISOString(),
      positionSeconds: positionRow?.positionSeconds ?? 0,
      quality: ['240p', '360p', '480p', '720p', '1080p'],
      guest,
    };
  }

  /**
   * İmzalı manifest doğrulaması: token uyuşmuyorsa 403 (sağlayıcı davranışı).
   * Kayıtlı kullanıcı oturumlarında iptal/süre ayrıca DB'den denetlenir.
   * Faz 4'te gerçek HLS manifest'ine köprülenecek; şimdilik demo manifest.
   */
  async verifySignedManifest(episodeId: string, sessionId: string, token: string, exp: number): Promise<void> {
    const expected = createHmac('sha256', this.signingSecret())
      .update(`${sessionId}:${episodeId}:${exp}`)
      .digest('hex')
      .slice(0, 32);
    if (token !== expected || exp * 1000 < Date.now()) {
      throw DomainError.forbidden('TOKEN_INVALID', 'errors.tokenInvalid');
    }
    // Kayıtlı oturum varsa iptal/süre denetimi; misafir oturumu DB'de yoktur.
    const session = await this.prisma.playbackSession.findUnique({ where: { id: sessionId } });
    if (session && (session.revokedAt || session.expiresAt.getTime() < Date.now())) {
      throw DomainError.forbidden('TOKEN_INVALID', 'errors.tokenInvalid');
    }
  }

  private signingSecret(): string {
    return this.env.WEBHOOK_SIGNING_SECRET ?? `perdego-dev-playback-${this.env.DATABASE_URL.slice(-24)}`;
  }
}
