/**
 * İzleme ilerlemesi servisi (watch_history).
 * Tamamlanma eşiği %90 — mobil playback-store ile aynı kural (parite).
 */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';
import { DomainError } from '../common/errors';
import { absoluteUrl } from '../common/absolute-url';
import { buildPageMeta } from '../common/pagination';
import type { Lang } from '../common/request-context';
import type { WatchProgressPut } from '@perdego/contracts';

const COMPLETED_RATIO = 0.9;

@Injectable()
export class WatchProgressService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async save(userId: string, episodeId: string, dto: WatchProgressPut) {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      select: { id: true, contentId: true, durationSeconds: true, status: true },
    });
    if (!episode || episode.status !== 'PUBLISHED') {
      throw DomainError.notFound('EPISODE_NOT_FOUND', 'errors.episodeNotFound', { episodeId });
    }

    const position = Math.min(dto.positionSeconds, episode.durationSeconds);
    const completed =
      dto.completed ?? position >= episode.durationSeconds * COMPLETED_RATIO;

    await this.prisma.watchHistory.upsert({
      where: { userId_episodeId: { userId, episodeId } },
      update: { positionSeconds: position, completed, lastWatchedAt: new Date() },
      create: {
        userId,
        episodeId,
        contentId: episode.contentId,
        positionSeconds: position,
        completed,
        lastWatchedAt: new Date(),
      },
    });
    return { saved: true as const, completed };
  }

  /**
   * Devam et rayı ve izleme geçmişi (Faz 2c kapsam parametresi):
   *   scope=continue → tamamlanmamışlar, son izlenenler (küçük sabit liste)
   *   scope=history  → tüm kayıtlar, sayfalı (Planim > Geçmiş; meta döner)
   * Kullanıcı bazında watch_history tablosu (BR-09).
   */
  async list(
    userId: string,
    page: number,
    pageSize: number,
    lang: Lang = 'tr',
    scope: 'continue' | 'history' = 'continue',
  ) {
    const localized = (tr: string, en: string): string => (lang === 'en' ? en || tr : tr || en);
    const select = {
      episode: {
        select: {
          titleTr: true,
          titleEn: true,
          seasonNumber: true,
          episodeNumber: true,
          durationSeconds: true,
        },
      },
      content: {
        select: { id: true, slug: true, titleTr: true, titleEn: true, posterUrl: true },
      },
    };
    const toView = (row: {
      episodeId: string;
      contentId: string;
      episode: { titleTr: string; titleEn: string; seasonNumber: number; episodeNumber: number; durationSeconds: number };
      content: { id: string; slug: string; titleTr: string; titleEn: string; posterUrl: string | null };
      positionSeconds: number;
      completed: boolean;
      lastWatchedAt: Date;
    }) => ({
      episodeId: row.episodeId,
      contentId: row.contentId,
      contentSlug: row.content.slug,
      contentTitle: localized(row.content.titleTr, row.content.titleEn),
      episodeTitle: localized(row.episode.titleTr, row.episode.titleEn),
      seasonNumber: row.episode.seasonNumber,
      episodeNumber: row.episode.episodeNumber,
      positionSeconds: row.positionSeconds,
      durationSeconds: row.episode.durationSeconds,
      completed: row.completed,
      lastWatchedAt: row.lastWatchedAt.toISOString(),
      posterUrl: absoluteUrl(this.env.PUBLIC_BASE_URL, row.content.posterUrl) ?? null,
    });

    if (scope === 'continue') {
      // Faz 2b davranışı korunur: tamamlanmamış son 20 (meta yok).
      const rows = await this.prisma.watchHistory.findMany({
        where: { userId, completed: false },
        orderBy: { lastWatchedAt: 'desc' },
        take: 20,
        include: select,
      });
      return { items: rows.map(toView) };
    }

    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.watchHistory.findMany({
        where,
        orderBy: { lastWatchedAt: 'desc' },
        include: select,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.watchHistory.count({ where }),
    ]);
    return { items: rows.map(toView), meta: buildPageMeta(page, pageSize, total) };
  }

  async get(userId: string, episodeId: string) {
    const row = await this.prisma.watchHistory.findUnique({
      where: { userId_episodeId: { userId, episodeId } },
    });
    if (!row) {
      return { episodeId, positionSeconds: 0, completed: false, lastWatchedAt: null };
    }
    return {
      episodeId,
      positionSeconds: row.positionSeconds,
      completed: row.completed,
      lastWatchedAt: row.lastWatchedAt.toISOString(),
    };
  }
}
