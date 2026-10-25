/**
 * Bölüm erişim kararı (BR-02/03/07 — sunucu tek yetkili).
 *
 * Kural 5 (görev): abonelik durumu, bölüm erişimi ve video erişim hakkı
 * ÜÇ AYRI tabloda yaşar ve bu servis kararı BİRLEŞTİRİR:
 *   1. episodes.access_type      → bölümün meta erişim türü (katalog)
 *   2. subscriptions (aktif dönem) → abonelik entitlement'ı
 *   3. episode_unlocks           → kalıcı krediyle açma hakkı
 * Karar burada verilir; oynatma oturumu (MediaService) kararı YENİDEN
 * doğrular (istemci canPlay=true gönderse bile sunucu kontrol eder).
 */
import { Injectable } from '@nestjs/common';
import type { Episode, User } from '@prisma/client';
import type { EpisodeAccess } from '@perdego/contracts';
import { PrismaService } from '../prisma/prisma.service';

/** Abonelikte oynatma hakkı veren durumlar (BR-02). */
const ENTITLED_STATUSES = ['TRIALING', 'ACTIVE', 'GRACE_PERIOD'] as const;

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aktif abonelik var mı? (Subscriptions tablosu — durum makinesi buradan
   * okunur; başka modül kendi kopyasını tutmaz.)
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const count = await this.prisma.subscription.count({
      where: {
        userId,
        status: { in: [...ENTITLED_STATUSES] },
        OR: [
          { currentPeriodEnd: null },
          { currentPeriodEnd: { gt: new Date() } },
        ],
      },
    });
    return count > 0;
  }

  /** Kullanıcının bu bölümü kalıcı olarak açmış mı? (episode_unlocks) */
  async isUnlocked(userId: string, episodeId: string): Promise<Date | null> {
    const unlock = await this.prisma.episodeUnlock.findUnique({
      where: { userId_episodeId: { userId, episodeId } },
      select: { createdAt: true },
    });
    return unlock ? unlock.createdAt : null;
  }

  /** 18+ yaş kontrolü (PRD §8): kullanıcı doğum yılı vermemişse erişim yok. */
  private isAgeRestricted(content: { ageRating: string | null }, user: User | null): boolean {
    if (content.ageRating !== '18+') return false;
    if (!user?.birthYear) return true;
    return new Date().getUTCFullYear() - user.birthYear < 18;
  }

  /**
   * Tek karar noktası. Sıra: SCHEDULED → AGE_RESTRICTED → FREE →
   * SUBSCRIPTION → CREDIT.
   */
  async decide(
    episode: Pick<Episode, 'id' | 'accessType' | 'status'> & {
      content: { ageRating: string | null };
    },
    user: User | null,
  ): Promise<EpisodeAccess> {
    if (episode.status === 'SCHEDULED') {
      return { canPlay: false, reason: 'SCHEDULED' };
    }

    if (this.isAgeRestricted(episode.content, user)) {
      return { canPlay: false, reason: 'AGE_RESTRICTED' };
    }

    switch (episode.accessType) {
      case 'FREE':
        return { canPlay: true, reason: 'FREE' };
      case 'SUBSCRIPTION': {
        if (!user) return { canPlay: false, reason: 'NEEDS_SUBSCRIPTION' };
        const active = await this.hasActiveSubscription(user.id);
        return active
          ? { canPlay: true, reason: 'SUBSCRIPTION_ACTIVE' }
          : { canPlay: false, reason: 'NEEDS_SUBSCRIPTION' };
      }
      case 'CREDIT': {
        if (!user) return { canPlay: false, reason: 'NEEDS_CREDITS' };
        const unlockedAt = await this.isUnlocked(user.id, episode.id);
        return unlockedAt
          ? { canPlay: true, reason: 'UNLOCKED', unlockedAt: unlockedAt.toISOString() }
          : { canPlay: false, reason: 'NEEDS_CREDITS' };
      }
    }
  }

  /**
   * Toplu karar (Faz 2c N+1 düzeltmesi): `decide` bölüm başına 1 abonelik
   * + 1 unlock sorgusu atardı (20 bölümlük dizi → 40 sorgu). Bu sürüm
   * kullanıcı başına TOPLAM 2 sorgu atar (1 abonelik sayısı + 1 unlock
   * findMany IN) ve kalanı bellekte birleştirir. Karar mantığı `decide`
   * ile birebir aynıdır (parite testi: access.service.spec.ts).
   */
  async decideMany(
    episodes: ReadonlyArray<
      Pick<Episode, 'id' | 'accessType' | 'status'> & {
        content: { ageRating: string | null };
      }
    >,
    user: User | null,
  ): Promise<EpisodeAccess[]> {
    if (episodes.length === 0) return [];

    const [hasActiveSubscription, unlockedIds] = await Promise.all([
      user ? this.hasActiveSubscription(user.id) : Promise.resolve(false),
      user
        ? this.prisma.episodeUnlock
            .findMany({
              where: { userId: user.id, episodeId: { in: episodes.map((e) => e.id) } },
              select: { episodeId: true, createdAt: true },
            })
            .then((rows) => new Map(rows.map((row) => [row.episodeId, row.createdAt])))
        : Promise.resolve(new Map<string, Date>()),
    ]);

    return episodes.map((episode) => {
      if (episode.status === 'SCHEDULED') {
        return { canPlay: false, reason: 'SCHEDULED' };
      }
      if (this.isAgeRestricted(episode.content, user)) {
        return { canPlay: false, reason: 'AGE_RESTRICTED' };
      }
      switch (episode.accessType) {
        case 'FREE':
          return { canPlay: true, reason: 'FREE' };
        case 'SUBSCRIPTION':
          return hasActiveSubscription
            ? { canPlay: true, reason: 'SUBSCRIPTION_ACTIVE' }
            : { canPlay: false, reason: 'NEEDS_SUBSCRIPTION' };
        case 'CREDIT': {
          if (!user) return { canPlay: false, reason: 'NEEDS_CREDITS' };
          const unlockedAt = unlockedIds.get(episode.id);
          return unlockedAt
            ? { canPlay: true, reason: 'UNLOCKED', unlockedAt: unlockedAt.toISOString() }
            : { canPlay: false, reason: 'NEEDS_CREDITS' };
        }
      }
    });
  }
}
