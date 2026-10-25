import { describe, expect, it } from 'vitest';
import { AccessService } from './access.service';
import type { PrismaService } from '../prisma/prisma.service';

function makeAccess(options: { activeSubscription: boolean; unlockedAt?: Date | null }): AccessService {
  const prisma = {
    subscription: {
      count: async () => (options.activeSubscription ? 1 : 0),
    },
    episodeUnlock: {
      findUnique: async () =>
        options.unlockedAt ? { createdAt: options.unlockedAt } : null,
    },
  } as unknown as PrismaService;
  return new AccessService(prisma);
}

const baseEpisode = {
  id: 'ep_1',
  accessType: 'FREE' as const,
  status: 'PUBLISHED' as const,
  content: { ageRating: null },
};

const adultUser = { id: 'u1', birthYear: 1995 } as never;

describe('AccessService.decide — erişim kararı (BR-02/03/07)', () => {
  it('SCHEDULED bölüm oynatılamaz', async () => {
    const access = makeAccess({ activeSubscription: false });
    const result = await access.decide({ ...baseEpisode, status: 'SCHEDULED' }, adultUser);
    expect(result).toEqual({ canPlay: false, reason: 'SCHEDULED' });
  });

  it('FREE bölüm konuğa açıktır (BR-08)', async () => {
    const access = makeAccess({ activeSubscription: false });
    const result = await access.decide(baseEpisode, null);
    expect(result).toEqual({ canPlay: true, reason: 'FREE' });
  });

  it('SUBSCRIPTION bölüm aboneliksiz konuğa kapalıdır', async () => {
    const access = makeAccess({ activeSubscription: false });
    const result = await access.decide(
      { ...baseEpisode, accessType: 'SUBSCRIPTION' as const },
      null,
    );
    expect(result).toEqual({ canPlay: false, reason: 'NEEDS_SUBSCRIPTION' });
  });

  it('SUBSCRIPTION bölüm aktif aboneliğe açıktır', async () => {
    const access = makeAccess({ activeSubscription: true });
    const result = await access.decide(
      { ...baseEpisode, accessType: 'SUBSCRIPTION' as const },
      adultUser,
    );
    expect(result).toEqual({ canPlay: true, reason: 'SUBSCRIPTION_ACTIVE' });
  });

  it('CREDIT bölüm kilitsiz kullanıcıya NEEDS_CREDITS der', async () => {
    const access = makeAccess({ activeSubscription: false, unlockedAt: null });
    const result = await access.decide(
      { ...baseEpisode, accessType: 'CREDIT' as const },
      adultUser,
    );
    expect(result).toEqual({ canPlay: false, reason: 'NEEDS_CREDITS' });
  });

  it('CREDIT bölüm unlock\u2019lı kullanıcıya UNLOCKED + tarih verir (Kural 3 temeli)', async () => {
    const unlockedAt = new Date('2026-10-01T10:00:00Z');
    const access = makeAccess({ activeSubscription: false, unlockedAt });
    const result = await access.decide(
      { ...baseEpisode, accessType: 'CREDIT' as const },
      adultUser,
    );
    expect(result).toEqual({ canPlay: true, reason: 'UNLOCKED', unlockedAt: unlockedAt.toISOString() });
  });

  it('abonelik CREDIT bölümü açmaz (ayrı haklar — Kural 5)', async () => {
    const access = makeAccess({ activeSubscription: true, unlockedAt: null });
    const result = await access.decide(
      { ...baseEpisode, accessType: 'CREDIT' as const },
      adultUser,
    );
    expect(result).toEqual({ canPlay: false, reason: 'NEEDS_CREDITS' });
  });

  it('18+ içerik doğum yılı olmayan kullanıcıya AGE_RESTRICTED der (PRD §8)', async () => {
    const access = makeAccess({ activeSubscription: false });
    const result = await access.decide(
      { ...baseEpisode, content: { ageRating: '18+' } },
      null,
    );
    expect(result).toEqual({ canPlay: false, reason: 'AGE_RESTRICTED' });
  });

  it('18+ içerik reşit kullanıcıya açıktır', async () => {
    const access = makeAccess({ activeSubscription: false });
    const result = await access.decide(
      { ...baseEpisode, content: { ageRating: '18+' } },
      adultUser,
    );
    expect(result).toEqual({ canPlay: true, reason: 'FREE' });
  });

  it('18+ içerik küçük kullanıcıya kapalıdır', async () => {
    const access = makeAccess({ activeSubscription: false });
    const minor = { id: 'u2', birthYear: new Date().getUTCFullYear() - 15 } as never;
    const result = await access.decide(
      { ...baseEpisode, content: { ageRating: '18+' } },
      minor,
    );
    expect(result).toEqual({ canPlay: false, reason: 'AGE_RESTRICTED' });
  });
});

describe('AccessService.decideMany — toplu karar (Faz 2c N+1 düzeltmesi)', () => {
  function makeBatchAccess(options: {
    activeSubscription: boolean;
    unlocked: Record<string, Date>;
  }): { service: AccessService; calls: { subscriptionCount: number; unlockQueries: number; unlockInIds: string[][] } } {
    const calls = { subscriptionCount: 0, unlockQueries: 0, unlockInIds: [] as string[][] };
    const prisma = {
      subscription: {
        count: async () => {
          calls.subscriptionCount += 1;
          return options.activeSubscription ? 1 : 0;
        },
      },
      episodeUnlock: {
        findUnique: async () => {
          throw new Error('decideMany findUnique kullanmamalı (N+1)');
        },
        findMany: async (args: { where: { episodeId: { in: string[] } } }) => {
          calls.unlockQueries += 1;
          calls.unlockInIds.push(args.where.episodeId.in);
          return Object.entries(options.unlocked)
            .filter(([episodeId]) => args.where.episodeId.in.includes(episodeId))
            .map(([episodeId, createdAt]) => ({ episodeId, createdAt }));
        },
      },
    } as unknown as PrismaService;
    return { service: new AccessService(prisma), calls };
  }

  it('boş girdi hiç sorgu atmadan boş liste döner', async () => {
    const { service, calls } = makeBatchAccess({ activeSubscription: false, unlocked: {} });
    expect(await service.decideMany([], adultUser)).toEqual([]);
    expect(calls.subscriptionCount).toBe(0);
    expect(calls.unlockQueries).toBe(0);
  });

  it('20 bölümlük dizi için TOPLAM 1 abonelik + 1 unlock sorgusu atar (N+1 yok)', async () => {
    const { service, calls } = makeBatchAccess({ activeSubscription: true, unlocked: {} });
    const episodes = Array.from({ length: 20 }, (_, i) => ({
      id: `ep_${i}`,
      accessType: 'SUBSCRIPTION' as const,
      status: 'PUBLISHED' as const,
      content: { ageRating: null },
    }));
    const result = await service.decideMany(episodes, adultUser);
    expect(result).toHaveLength(20);
    expect(result.every((r) => r.reason === 'SUBSCRIPTION_ACTIVE' && r.canPlay)).toBe(true);
    expect(calls.subscriptionCount).toBe(1); // decide() bunu 20 kez atardı
    expect(calls.unlockQueries).toBe(1);
    expect(calls.unlockInIds[0]).toHaveLength(20); // IN toplu sorgu
  });

  it('decide() ile parite: karışım Free/Subscription/Credit aynı kararı döner', async () => {
    const unlockedAt = new Date('2026-10-01T10:00:00Z');
    // Parite mock'u: hem decide (findUnique) hem decideMany (findMany) çalışır.
    const prisma = {
      subscription: { count: async () => 0 },
      episodeUnlock: {
        findUnique: async (args: { where: { userId_episodeId: { episodeId: string } } }) =>
          args.where.userId_episodeId.episodeId === 'ep_credit'
            ? { createdAt: unlockedAt }
            : null,
        findMany: async (args: { where: { episodeId: { in: string[] } } }) =>
          args.where.episodeId.in.includes('ep_credit')
            ? [{ episodeId: 'ep_credit', createdAt: unlockedAt }]
            : [],
      },
    } as unknown as PrismaService;
    const service = new AccessService(prisma);
    const mixed = [
      { id: 'ep_free', accessType: 'FREE' as const, status: 'PUBLISHED' as const, content: { ageRating: null } },
      { id: 'ep_sub', accessType: 'SUBSCRIPTION' as const, status: 'PUBLISHED' as const, content: { ageRating: null } },
      { id: 'ep_credit', accessType: 'CREDIT' as const, status: 'PUBLISHED' as const, content: { ageRating: null } },
    ];
    const batch = await service.decideMany(mixed, adultUser);
    const singles = await Promise.all(mixed.map((e) => service.decide(e, adultUser)));
    expect(batch).toEqual(singles);
  });

  it('konuk kullanıcı unlock sorgusu atmadan CREDIT bölümü NEEDS_CREDITS alır', async () => {
    const { service, calls } = makeBatchAccess({ activeSubscription: false, unlocked: {} });
    const result = await service.decideMany(
      [{ id: 'ep_credit', accessType: 'CREDIT' as const, status: 'PUBLISHED' as const, content: { ageRating: null } }],
      null,
    );
    expect(result).toEqual([{ canPlay: false, reason: 'NEEDS_CREDITS' }]);
    expect(calls.subscriptionCount).toBe(0);
    expect(calls.unlockQueries).toBe(0);
  });
});
