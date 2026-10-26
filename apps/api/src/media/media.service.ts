/**
 * Oynatma (media) servisi — FAZ 4: MediaProvider portu ile gerçek video akışı.
 *
 * Güvenlik modeli (görevin 10 video altyapısı kuralı):
 *  - Her oynatma isteğinde erişim kararı YENİDEN doğrulanır (BR-07): oturum
 *    açılmadan ve dosya servis edilmeden önce AccessService devreye girer.
 *  - playbackUrl + sources: süreli, oturuma bağlı İMZALI URL'ler; kalıcı
 *    public video bağlantısı üretilmez (premium dahil — Kural 9/10).
 *  - Video yalnızca READY medya + PUBLISHED bölüm için oynatılır.
 *  - Yükleme: yönetim kısa ömürlü imzalı PUT URL alır; dosya sağlayıcıya
 *    DOĞRUDAN gönderilir (backend JSON gövdesinden taşınmaz).
 *  - Video URL'leri/anahtarları uygulama koduna gömülmez; yalnızca oturum
 *    yanıtı ile verilir.
 *
 * İmza: HMAC-SHA256(secret, `playback:sessionId:episodeId:exp`) — manifest,
 * segment, altyazı ve mp4 isteklerinde aynı imza doğrulanır.
 */
import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { AccessService } from '../episodes/access.service';
import { AuditService } from '../audit/audit.service';
import type { RequestUser } from '../common/request-context';
import type { Readable } from 'node:stream';
import type {
  MediaProviderPort,
  PlaybackSourceContext,
  ProviderFileResult,
} from './provider/media-provider.port';
import { MEDIA_PROVIDER_PORT } from './provider/tokens';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MEDIA_PROVIDER_PORT) private readonly provider: MediaProviderPort,
  ) {}

  /**
   * Oynatma oturumu açar. Hatalar: 404 bölüm yok, 409 encode sürüyor/medya yok,
   * 402 abonelik/kredi, 403 yaş/askı, 409 paralel limit.
   *
   * Medya seçimi: önce ortam değişkenindeki sağlayıcının READY kaydı; yoksa
   * en yeni READY kaydı (sağlayıcı değişimi uygulamayı kırmasın).
   */
  async createPlaybackSession(user: RequestUser | null, episodeId: string, origin?: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        content: { select: { status: true, ageRating: true, slug: true } },
        media: { where: { state: 'READY' }, orderBy: { createdAt: 'desc' }, include: { textTracks: true } },
      },
    });
    if (!episode || episode.content.status !== 'PUBLISHED' || episode.status !== 'PUBLISHED') {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
    }
    const media =
      episode.media.find((row) => row.provider === this.provider.name.toUpperCase()) ?? episode.media[0];
    if (!media) {
      throw DomainError.conflict('EPISODE_NOT_READY', 'errors.episodeNotReady');
    }
    if (this.provider.name === 'LOCAL') {
      // Örnek paket dosyalarının üretildiğini erken doğrula (NET hata).
      this.provider.assertSamplePresent?.(media.providerAssetId);
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
    // KRİTİK: satır kimliği URL'deki sessionId İLE AYNI olmalı — aksi halde
    // verifyPlaybackRequest satırı bulamaz ve premium istekler reddedilir
    // (FAZ 6 bulgusu F6-02: satır cuid ile üretiliyor, URL uuid taşıyordu —
    // iptal/süre denetimi fiilen hiç çalışmıyordu).
    if (!guest) {
      await this.prisma.playbackSession.create({
        data: { id: sessionId, userId: fullUser.id, episodeId, expiresAt },
      });
    }

    const positionRow = fullUser
      ? await this.prisma.watchHistory.findUnique({
          where: { userId_episodeId: { userId: fullUser.id, episodeId } },
        })
      : null;

    const exp = Math.floor(expiresAt.getTime() / 1000);
    const token = this.playbackToken(sessionId, episodeId, exp);
    const base = (origin ?? this.env.PUBLIC_BASE_URL).replace(/\/+$/, '');

    const sources = await this.provider.buildPlaybackSources({
      episodeId,
      providerAssetId: media.providerAssetId,
      mediaId: media.id,
      sessionId,
      token,
      exp,
      origin: base,
      textTracks: media.textTracks.map((t) => ({
        language: t.language,
        label: t.label,
        sourceRef: t.sourceRef,
        isDefault: t.isDefault,
      })),
    });

    const root = `/api/v1/media/hls/${episodeId}/${sessionId}`;
    const textTracks = media.textTracks.map((t) => ({
      language: t.language,
      label: t.label,
      isDefault: t.isDefault,
      url: `${base}${root}/${t.sourceRef}?token=${token}&exp=${exp}`,
    }));

    return {
      episodeId,
      provider: this.provider.name,
      playbackUrl: sources.hls ?? sources.mp4 ?? '',
      sources: {
        ...(sources.hls ? { hls: sources.hls } : {}),
        ...(sources.mp4 ? { mp4: sources.mp4 } : {}),
      },
      expiresAt: expiresAt.toISOString(),
      positionSeconds: positionRow?.positionSeconds ?? 0,
      quality: sources.quality,
      guest,
      textTracks,
    };
  }

  /**
   * Yönetim önizleme oturumu (FAZ 8): EDITOR/ADMIN, TASLAK/ARŞİV bölümü
   * dahil oynatıp yayın öncesi denetim yapar. Herkese açık oynatma
   * kurallarından BİLİNÇLİ olarak ayrıktır (Kural 6 — taslak herkese açık
   * uçlarda görünmez); uç EDITOR/ADMIN rol korumalıdır ve oturum satırı
   * yine bu yöneticiye yazılır (imzalı dosya servisi sahiplik denetler).
   */
  async createAdminPreview(user: RequestUser, episodeId: string, origin?: string) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: {
        content: { select: { slug: true, titleTr: true } },
        media: { where: { state: 'READY' }, orderBy: { createdAt: 'desc' }, include: { textTracks: true } },
      },
    });
    if (!episode) {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
    }
    const media = episode.media.find((row) => row.provider === this.provider.name.toUpperCase()) ?? episode.media[0];
    if (!media) {
      throw DomainError.conflict('EPISODE_NOT_READY', 'errors.episodeNotReady');
    }
    if (this.provider.name === 'LOCAL') {
      this.provider.assertSamplePresent?.(media.providerAssetId);
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + this.env.PLAYBACK_TTL_SECONDS * 1000);
    await this.prisma.playbackSession.create({
      data: { id: sessionId, userId: user.id, episodeId, expiresAt },
    });

    const exp = Math.floor(expiresAt.getTime() / 1000);
    const token = this.playbackToken(sessionId, episodeId, exp);
    const base = (origin ?? this.env.PUBLIC_BASE_URL).replace(/\/+$/, '');

    const sources = await this.provider.buildPlaybackSources({
      episodeId,
      providerAssetId: media.providerAssetId,
      mediaId: media.id,
      sessionId,
      token,
      exp,
      origin: base,
      textTracks: media.textTracks.map((t) => ({
        language: t.language,
        label: t.label,
        sourceRef: t.sourceRef,
        isDefault: t.isDefault,
      })),
    });

    return {
      episodeId,
      episodeTitle: episode.titleTr,
      contentSlug: episode.content.slug,
      episodeStatus: episode.status,
      provider: this.provider.name,
      playbackUrl: sources.mp4 ?? sources.hls ?? '',
      sources: {
        ...(sources.hls ? { hls: sources.hls } : {}),
        ...(sources.mp4 ? { mp4: sources.mp4 } : {}),
      },
      expiresAt: expiresAt.toISOString(),
      quality: sources.quality,
    };
  }

  /**
   * İmzalı oynatma istekleri için ortak doğrulama:
   *   1. HMAC token + süre,
   *   2. oturum iptali/süresi (DB'deki kayıtlı oturumlar),
   *   3. premium (FREE olmayan) bölümde canlı oturum satırı şartı — imza
   *      sırrı sızsa/öngörülebilir olsa bile var olmayan sessionId ile
   *      premium dosya servis edilmez (FAZ 6 bulgusu F6-01; konuk FREE
   *      akışı BR-08 gereği satırsız çalışmayı sürdürür),
   *   4. bölüm/medya READY durumu (kaldırılmış içerik anında kesilir).
   */
  async verifyPlaybackRequest(
    episodeId: string,
    sessionId: string,
    token: string,
    exp: number,
  ): Promise<PlaybackSourceContext> {
    const expected = this.playbackToken(sessionId, episodeId, exp);
    if (token !== expected) {
      throw DomainError.forbidden('TOKEN_INVALID', 'errors.tokenInvalid');
    }
    if (exp * 1000 < Date.now()) {
      throw DomainError.forbidden('TOKEN_EXPIRED', 'errors.tokenExpired');
    }
    const session = await this.prisma.playbackSession.findUnique({ where: { id: sessionId } });
    if (session && (session.revokedAt || session.expiresAt.getTime() < Date.now())) {
      throw DomainError.forbidden('TOKEN_INVALID', 'errors.tokenInvalid');
    }
    // Premium içerik: oturum satırı olmadan dosya yok. Üyelikli bölümlerde
    // oturum her zaman kayıtlıdır (createPlaybackSession); satır yokluğu
    // SAHTE/konuk-denemeli istektir.
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { accessType: true },
    });
    if (episode && episode.accessType !== 'FREE') {
      if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
        throw DomainError.forbidden('TOKEN_INVALID', 'errors.tokenInvalid');
      }
    }

    const media = await this.prisma.episodeMedia.findFirst({
      where: { episodeId, state: 'READY' },
      orderBy: { createdAt: 'desc' },
      include: { textTracks: true },
    });
    if (!media) {
      throw DomainError.conflict('EPISODE_NOT_READY', 'errors.episodeNotReady');
    }
    return {
      episodeId,
      providerAssetId: media.providerAssetId,
      mediaId: media.id,
      sessionId,
      token,
      exp,
      origin: this.env.PUBLIC_BASE_URL,
      textTracks: media.textTracks.map((t) => ({
        language: t.language,
        label: t.label,
        sourceRef: t.sourceRef,
        isDefault: t.isDefault,
      })),
    };
  }

  /** İmzalı dosya isteği (manifest/segment/vtt/mp4) → sağlayıcı çözümü. */
  async resolvePlaybackFile(
    ctx: PlaybackSourceContext,
    file: string,
  ): Promise<ProviderFileResult> {
    return this.provider.resolveFile({ ...ctx, file });
  }

  // ------------------------------------------------------------------ upload

  /**
   * Yönetim: sağlayıcıya DOĞRUDAN yükleme için süreli imzalı URL üretir.
   * Bölüm yoksa 404; bölüm yayınlanmış olsa da yeniden medya eklenebilir
   * (yeni medya PROCESSING iken oynatma eski READY medya ile sürer).
   */
  async createUploadUrl(
    actor: RequestUser,
    episodeId: string,
    input: { originalName?: string; contentType?: string },
    origin?: string,
  ) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, status: true },
    });
    if (!episode) {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
    }

    // Kimlik deterministik: satır id = providerAssetId'nin taşıdığı id.
    // Böylece settleUpload/syncStatus/resolveFile aynı dosyaya işaret eder.
    const mediaId = randomUUID();
    const media = await this.prisma.episodeMedia.create({
      data: {
        id: mediaId,
        episodeId,
        provider: 'LOCAL',
        providerAssetId: `upload:${mediaId}`,
        state: 'AWAITING_UPLOAD',
        originalName: input.originalName ?? null,
      },
    });

    const ticket = this.provider.createUploadTicket({
      mediaId: media.id,
      episodeId,
      originalName: input.originalName,
      contentType: input.contentType,
      origin: (origin ?? this.env.PUBLIC_BASE_URL).replace(/\/+$/, ''),
    });

    await this.prisma.episodeMedia.update({
      where: { id: media.id },
      data: { uploadExpiresAt: new Date(ticket.expiresAt) },
    });

    await this.audit.log({
      actorUserId: actor.id,
      action: 'MEDIA_UPLOAD_URL_ISSUED',
      entityType: 'episode_media',
      entityId: media.id,
      after: { episodeId, provider: 'LOCAL', originalName: input.originalName ?? null },
    });

    return {
      // Sözleşme alanı: istemci durumu sorgularken mediaId kullanır.
      mediaId: media.id,
      ...ticket,
    };
  }

  /**
   * İmzalı yükleme PUT gövdesini sağlayıcıya aktarır ve işleme durumuna alır.
   * media kaydı AWAITING_UPLOAD değilse 409 (tek yükleme hakkı).
   */
  async acceptUpload(
    mediaId: string,
    token: string,
    exp: number,
    stream: Readable,
    declaredContentType?: string,
  ) {
    this.provider.verifyUploadTicket(mediaId, token, exp);

    const media = await this.prisma.episodeMedia.findUnique({ where: { id: mediaId } });
    if (!media) {
      throw DomainError.notFound('MEDIA_NOT_FOUND', 'errors.notFound', { mediaId });
    }
    if (media.state !== 'AWAITING_UPLOAD') {
      throw DomainError.conflict('MEDIA_ALREADY_UPLOADED', 'errors.mediaAlreadyUploaded');
    }

    const status = await this.provider.settleUpload({
      mediaId,
      episodeId: media.episodeId,
      originalName: media.originalName ?? undefined,
      requestStream: stream,
      declaredContentType,
    });

    const updated = await this.prisma.episodeMedia.update({
      where: { id: mediaId },
      data: {
        state: status.state === 'ERROR' ? 'ERROR' : status.state,
        sizeBytes: status.sizeBytes ?? null,
        durationSeconds: status.durationSeconds ?? null,
        errorMessage: status.errorMessage ?? null,
      },
    });

    await this.syncStatusIntoDb(mediaId, status);

    return {
      mediaId: updated.id,
      episodeId: updated.episodeId,
      provider: 'LOCAL' as const,
      state: updated.state,
      sizeBytes: updated.sizeBytes ?? null,
      durationSeconds: updated.durationSeconds ?? null,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /** İşleme durumunu yeniler (local: gecikmeli READY; bulut: sağlayıcı API). */
  async syncMediaStatus(mediaId: string) {
    const media = await this.prisma.episodeMedia.findUnique({ where: { id: mediaId } });
    if (!media) {
      throw DomainError.notFound('MEDIA_NOT_FOUND', 'errors.notFound', { mediaId });
    }
    if (media.state === 'AWAITING_UPLOAD') {
      return this.toMediaStatus(media);
    }
    const status = await this.provider.syncStatus({
      mediaId: media.id,
      episodeId: media.episodeId,
      providerAssetId: media.providerAssetId,
      originalName: media.originalName,
      sizeBytes: media.sizeBytes,
    });
    if ((status.state as string) === 'AWAITING_UPLOAD') {
      // Sağlayıcı dosyayı göremiyorsa mevcut durumu KORU (geriye örtme yok):
      // PROCESSING/READY bilgisi kaybolmaz, yanlış AWAITING yazımı engellenir.
      return this.toMediaStatus(media);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // Kısmi unique index (bölüm başına TEK READY) sırası: ESKİ READY
      // kayıtlarını ÖNCE oyuna kapat, sonra yeni sürümü READY'e al.
      if (status.state === 'READY') {
        await tx.episodeMedia.updateMany({
          where: { episodeId: media.episodeId, state: 'READY', id: { not: mediaId } },
          data: { state: 'ERROR', errorMessage: 'Eski sürüm: yeni medya yayında (READY)' },
        });
      }
      const row = await tx.episodeMedia.update({
        where: { id: mediaId },
        data: {
          state: status.state,
          durationSeconds: status.durationSeconds ?? media.durationSeconds,
          sizeBytes: status.sizeBytes ?? media.sizeBytes,
          errorMessage: status.errorMessage ?? null,
          ...(status.state === 'READY' ? { readyAt: new Date() } : {}),
        },
      });
      return row;
    });
    await this.syncStatusIntoDb(mediaId, status);
    return this.toMediaStatus(updated);
  }

  /** Bölümün tüm medya kayıtları (yönetim listesi). */
  async listEpisodeMedia(episodeId: string) {
    const rows = await this.prisma.episodeMedia.findMany({
      where: { episodeId },
      orderBy: { createdAt: 'desc' },
      include: { textTracks: true },
    });
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true },
    });
    if (!episode) {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
    }
    return { items: rows.map((row) => this.toMediaStatus(row)) };
  }

  /** Tek medya durumu. */
  async getMediaStatus(mediaId: string) {
    const media = await this.prisma.episodeMedia.findUnique({
      where: { id: mediaId },
      include: { textTracks: true },
    });
    if (!media) {
      throw DomainError.notFound('MEDIA_NOT_FOUND', 'errors.notFound', { mediaId });
    }
    return this.toMediaStatus(media);
  }

  /** Medya kaydını siler (sağlayıcı asset'iyle birlikte). */
  async deleteMedia(actor: RequestUser, mediaId: string) {
    const media = await this.prisma.episodeMedia.findUnique({ where: { id: mediaId } });
    if (!media) {
      throw DomainError.notFound('MEDIA_NOT_FOUND', 'errors.notFound', { mediaId });
    }
    await this.provider.deleteAsset(media.providerAssetId);
    await this.prisma.mediaTextTrack.deleteMany({ where: { mediaId } });
    await this.prisma.episodeMedia.delete({ where: { id: mediaId } });
    await this.audit.log({
      actorUserId: actor.id,
      action: 'MEDIA_DELETED',
      entityType: 'episode_media',
      entityId: mediaId,
      before: { episodeId: media.episodeId, providerAssetId: media.providerAssetId, state: media.state },
    });
    return { deleted: true as const, mediaId };
  }

  // ------------------------------------------------------------------ helpers

  private playbackToken(sessionId: string, episodeId: string, exp: number): string {
    return createHmac('sha256', this.signingSecret())
      .update(`playback:${sessionId}:${episodeId}:${exp}`)
      .digest('hex')
      .slice(0, 32);
  }

  private signingSecret(): string {
    return this.env.WEBHOOK_SIGNING_SECRET ?? `perdego-dev-playback-${this.env.DATABASE_URL.slice(-24)}`;
  }

  /** Sağlayıcı durumundaki textTrack'leri DB'ye yansıtır (idempotent upsert). */
  private async syncStatusIntoDb(
    mediaId: string,
    status: { state: string; textTracks?: Array<{ language: string; label: string; sourceRef: string; isDefault?: boolean }> },
  ): Promise<void> {
    if (status.state !== 'READY' || !status.textTracks || status.textTracks.length === 0) return;
    for (const track of status.textTracks) {
      await this.prisma.mediaTextTrack.upsert({
        where: { mediaId_language: { mediaId, language: track.language } },
        update: { label: track.label, sourceRef: track.sourceRef, isDefault: track.isDefault ?? false },
        create: {
          mediaId,
          language: track.language,
          label: track.label,
          sourceRef: track.sourceRef,
          isDefault: track.isDefault ?? false,
        },
      });
    }
  }

  private toMediaStatus(row: {
    id: string;
    episodeId: string;
    provider: string;
    state: string;
    durationSeconds: number | null;
    sizeBytes: number | null;
    errorMessage: string | null;
    originalName: string | null;
    updatedAt: Date;
    textTracks?: Array<{ language: string; label: string; isDefault: boolean }>;
  }) {
    return {
      mediaId: row.id,
      episodeId: row.episodeId,
      provider: row.provider,
      state: row.state,
      durationSeconds: row.durationSeconds ?? null,
      sizeBytes: row.sizeBytes ?? null,
      errorMessage: row.errorMessage ?? null,
      originalName: row.originalName ?? null,
      playbackReady: row.state === 'READY',
      textTracks: (row.textTracks ?? []).map((t) => ({
        language: t.language,
        label: t.label,
        isDefault: t.isDefault,
      })),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
