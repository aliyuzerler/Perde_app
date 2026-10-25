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
