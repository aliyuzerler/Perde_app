import { describe, expect, it } from 'vitest';
import type { Content, Episode, Season } from '@prisma/client';
import {
  groupSeasons,
  isNewContent,
  toCatalogEpisode,
  toContentSummary,
  toTitleDetail,
} from './content-mapper';

const now = Date.now();
const recent = new Date(now - 5 * 86400_000);
const old = new Date(now - 90 * 86400_000);

function row(overrides: Partial<Content> = {}): Content {
  return {
    id: 'c_1',
    slug: 'son-vardiya',
    kind: 'SERIES',
    seriesFormat: 'MINI',
    titleTr: 'Son Vardiya',
    titleEn: 'Last Shift',
    originalTitle: null,
    synopsisTr: 'tr synopsis',
    synopsisEn: 'en synopsis',
    taglineTr: 'tr tagline',
    taglineEn: 'en tagline',
    releaseYear: 2026,
    ageRating: '16+',
    durationSeconds: null,
    posterUrl: '/placeholders/poster/son-vardiya.svg',
    heroImageUrl: null,
    verticalPreviewUrl: null,
    accessType: 'SUBSCRIPTION',
    status: 'PUBLISHED',
    publishedAt: recent,
    createdById: null,
    createdAt: recent,
    updatedAt: recent,
    ...overrides,
  } as Content;
}

describe('toContentSummary', () => {
  it('tr dilinde tr başlık ve mutlak poster URL verir', () => {
    const summary = toContentSummary(
      { ...row(), categories: [{ category: { slug: 'dram', sortOrder: 1 } }] },
      'tr',
      'http://localhost:3000',
    );
    expect(summary.title).toBe('Son Vardiya');
    expect(summary.posterUrl).toBe('http://localhost:3000/placeholders/poster/son-vardiya.svg');
    expect(summary.genres).toEqual(['dram']);
    expect(summary.isNew).toBe(true);
  });

  it('en dilinde en başlığa düşer', () => {
    const summary = toContentSummary(row(), 'en', 'http://localhost:3000');
    expect(summary.title).toBe('Last Shift');
  });

  it('seçilen dil boşsa diğer dile düşer', () => {
    const summary = toContentSummary(row({ titleTr: '' as never }), 'tr', 'http://localhost:3000');
    expect(summary.title).toBe('Last Shift');
  });

  it('30 günden eski yayın isNew=false olur', () => {
    const summary = toContentSummary(row({ publishedAt: old }), 'tr', 'http://localhost:3000');
    expect(summary.isNew).toBe(false);
  });

  it('publishedAt null ise isNew=false olur', () => {
    expect(isNewContent(null)).toBe(false);
  });
});

describe('toCatalogEpisode', () => {
  const episode = {
    id: 'ep_1',
    contentId: 'c_1',
    seasonNumber: 1,
    episodeNumber: 2,
    titleTr: 'Bodrum Kat',
    titleEn: 'The Basement',
    synopsisTr: null,
    synopsisEn: 'en',
    durationSeconds: 498,
    verticalPreviewUrl: null,
    accessType: 'CREDIT' as const,
    creditCost: 2,
    status: 'PUBLISHED' as const,
    publishedAt: recent,
    freeUntilAt: null,
    createdAt: recent,
    updatedAt: recent,
    content: { ageRating: '16+' },
  } as unknown as Episode & { content: { ageRating: string | null } };

  it('erişim kararıyla birlikte eşler', () => {
    const view = toCatalogEpisode(episode, 'tr', 'http://localhost:3000', {
      canPlay: false,
      reason: 'NEEDS_CREDITS',
    });
    expect(view.title).toBe('Bodrum Kat');
    expect(view.creditCost).toBe(2);
    expect(view.access?.reason).toBe('NEEDS_CREDITS');
  });

  it('erişim kararı verilmezse alan atlanır (additive sözleşme)', () => {
    const view = toCatalogEpisode(episode, 'en', 'http://localhost:3000');
    expect(view.access).toBeUndefined();
  });
});

describe('groupSeasons + toTitleDetail', () => {
  const seasons = [
    { id: 'sn_2', contentId: 'c_1', seasonNumber: 2, titleTr: null, titleEn: null, synopsisTr: null, synopsisEn: null, createdAt: now, updatedAt: now },
    { id: 'sn_1', contentId: 'c_1', seasonNumber: 1, titleTr: 'İlk Sezon', titleEn: 'First Season', synopsisTr: null, synopsisEn: null, createdAt: now, updatedAt: now },
  ] as unknown as Season[];

  it('sezonları numaraya göre sıralar', () => {
    const grouped = groupSeasons(seasons, new Map(), 'tr');
    expect(grouped.map((s) => s.seasonNumber)).toEqual([1, 2]);
    expect(grouped[0]?.title).toBe('İlk Sezon');
    expect(grouped[1]?.title).toBeUndefined();
  });

  it('detay yanıtında id + erişimli sezonlar taşınır', () => {
    const detail = toTitleDetail(row(), 'tr', 'http://localhost:3000', seasons, [
      { id: 'sn_1', seasonNumber: 1, title: 'İlk Sezon', episodes: [] },
    ]);
    expect(detail.id).toBe('c_1');
    expect(detail.seasons).toHaveLength(2);
    expect(detail.accessSeasons).toHaveLength(1);
    expect(detail.synopsis).toBe('tr synopsis');
    expect(detail.tagline).toBe('tr tagline');
  });
});
