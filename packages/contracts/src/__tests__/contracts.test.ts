import { describe, expect, it } from 'vitest';
import {
  accessTypeSchema,
  apiErrorSchema,
  contentKindSchema,
  contentSchema,
  contentSummarySchema,
  episodeSchema,
  feedSectionSchema,
  pageMetaSchema,
  publicUserProfileSchema,
  searchParamsSchema,
} from '../index';

const validContent = {
  id: 'c_001',
  slug: 'gece-yarisi-konseri',
  kind: 'SHORT_FILM',
  title: 'Gece Yarısı Konseri',
  synopsis: 'Terk edilmiş bir sinema salonunda geçen gerilim dolu bir gece.',
  releaseYear: 2026,
  genres: ['gerilim', 'dram'],
  accessType: 'FREE',
  seasons: [],
  isNew: true,
};

describe('contentKindSchema', () => {
  it('geçerli türleri kabul eder', () => {
    expect(contentKindSchema.parse('FILM')).toBe('FILM');
    expect(contentKindSchema.parse('SERIES')).toBe('SERIES');
    expect(contentKindSchema.parse('SHORT_FILM')).toBe('SHORT_FILM');
  });

  it('geçersiz türü reddeder', () => {
    expect(() => contentKindSchema.parse('REKLAM')).toThrow();
  });
});

describe('contentSchema', () => {
  it('geçerli içeriği ayrıştırır ve varsayılanları uygular', () => {
    const parsed = contentSchema.parse(validContent);
    expect(parsed.cast).toEqual([]);
    expect(parsed.isNew).toBe(true);
  });

  it('kebab-case olmayan slug reddeder', () => {
    expect(() =>
      contentSchema.parse({ ...validContent, slug: 'Gecce Yarisi' })
    ).toThrow();
  });

  it('geçersiz yıl değerini reddeder', () => {
    expect(() =>
      contentSchema.parse({ ...validContent, releaseYear: 1800 })
    ).toThrow();
  });

  it('SERIES için boş olmayan sezon listesi zorunlu değildir (istemci tarafı sözleşme)', () => {
    const parsed = contentSchema.parse({
      ...validContent,
      kind: 'SERIES',
    });
    expect(parsed.seasons).toEqual([]);
  });
});

describe('episodeSchema', () => {
  it('geçerli bölümü kabul eder', () => {
    const parsed = episodeSchema.parse({
      id: 'e_001',
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'İlk Perde',
      durationSeconds: 640,
      accessType: accessTypeSchema.parse('SUBSCRIPTION'),
    });
    expect(parsed.accessType).toBe('SUBSCRIPTION');
  });

  it('sıfır süreyi reddeder', () => {
    expect(() =>
      episodeSchema.parse({
        id: 'e_002',
        seasonNumber: 1,
        episodeNumber: 2,
        title: 'X',
        durationSeconds: 0,
        accessType: 'FREE',
      })
    ).toThrow();
  });
});

describe('contentSummarySchema ve feedSectionSchema', () => {
  it('ray bölümünü ayrıştırır', () => {
    const summary = contentSummarySchema.parse({
      contentId: 'c_001',
      slug: 'gece-yarisi-konseri',
      kind: 'SHORT_FILM',
      title: 'Gece Yarısı Konseri',
      releaseYear: 2026,
      accessType: 'FREE',
    });
    expect(summary.isNew).toBe(false);

    const section = feedSectionSchema.parse({
      id: 's_trend',
      title: 'Bu Hafta Trendler',
      layout: 'RAIL',
      items: [summary],
    });
    expect(section.layout).toBe('RAIL');
  });

  it('boş items listesini reddeder', () => {
    expect(() =>
      feedSectionSchema.parse({
        id: 's_empty',
        title: 'Boş',
        layout: 'RAIL',
        items: [],
      })
    ).toThrow();
  });
});

describe('pageMetaSchema', () => {
  it('sayfalama üst verisini doğrular', () => {
    const meta = pageMetaSchema.parse({
      page: 1,
      pageSize: 20,
      totalItems: 45,
      totalPages: 3,
      hasNextPage: true,
    });
    expect(meta.hasNextPage).toBe(true);
  });
});

describe('searchParamsSchema', () => {
  it('varsayılan sayfa değerlerini uygular', () => {
    const parsed = searchParamsSchema.parse({ query: 'gerilim' });
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(20);
  });

  it('boş sorguyu reddeder', () => {
    expect(() => searchParamsSchema.parse({ query: '   ' })).toThrow();
  });
});

describe('apiErrorSchema', () => {
  it('hata zarfını doğrular', () => {
    const parsed = apiErrorSchema.parse({
      code: 'NOT_FOUND',
      message: 'İçerik bulunamadı',
    });
    expect(parsed.code).toBe('NOT_FOUND');
  });

  it('bilinmeyen hata kodunu reddeder', () => {
    expect(() =>
      apiErrorSchema.parse({ code: 'WAT', message: 'x' })
    ).toThrow();
  });
});

describe('publicUserProfileSchema', () => {
  it('varsayılan dili tr yapar', () => {
    const parsed = publicUserProfileSchema.parse({
      id: 'u_001',
      displayName: 'Deniz',
      joinedAt: '2026-10-01T09:00:00Z',
    });
    expect(parsed.preferredLocale).toBe('tr');
  });
});
