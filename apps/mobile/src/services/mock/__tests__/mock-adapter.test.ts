/**
 * Mock adapter testleri.
 * Mock verinin contracts şemalarıyla uyumu burada doğrulanır — Faz 2'de
 * gerçek API de aynı sözleşmeleri sağlamak zorundadır.
 */
import { describe, expect, it } from '@jest/globals';
import {
  contentSchema,
  feedResponseSchema,
  searchResponseSchema,
} from '@perdego/contracts';
import { createMockAdapter, getMockDevControls } from '../mock-adapter';
import { mockContentList, mockFeed, mockProfile } from '../mock-data';

describe('mock veri bütünlüğü', () => {
  it('tüm mock içerikler content şemasına uyar', () => {
    for (const content of mockContentList) {
      expect(() => contentSchema.parse(content)).not.toThrow();
    }
  });

  it('mock feed feedResponse şemasına uyar', () => {
    expect(() => feedResponseSchema.parse(mockFeed)).not.toThrow();
  });

  it('tüm poster/hero URL alanları kasıtlı olarak boştur (özgün placeholder politikası)', () => {
    for (const content of mockContentList) {
      expect(content.posterUrl ?? null).toBeNull();
      expect(content.heroImageUrl ?? null).toBeNull();
    }
  });
});

describe('createMockAdapter', () => {
  const adapter = createMockAdapter();

  it('feed döner ve şemaya uyar', async () => {
    const feed = await adapter.getFeed();
    const parsed = feedResponseSchema.parse(feed);
    expect(parsed.sections.length).toBeGreaterThan(0);
    expect(parsed.sections.some((section) => section.layout === 'HERO')).toBe(true);
  });

  it('başlıkla arama yapar (Türkçe büyük/küçük harf duyarsız)', async () => {
    const result = await adapter.searchContent({ query: 'kum saati', page: 1, pageSize: 20 });
    expect(() => searchResponseSchema.parse(result)).not.toThrow();
    expect(result.items.some((item) => item.slug === 'kum-saati-protokolu')).toBe(true);
  });

  it('tür ile arama yapar', async () => {
    const result = await adapter.searchContent({ query: 'gerilim', page: 1, pageSize: 20 });
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('var olmayan içerik için 404 benzeri hata fırlatır', async () => {
    await expect(adapter.getContentDetail('c_yok_olsun')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('var olan içerik detayını döner', async () => {
    const detail = await adapter.getContentDetail(mockContentList[0]!.id);
    expect(detail.slug).toBe('kum-saati-protokolu');
    expect(detail.seasons.length).toBe(1);
  });

  it('failNextRequest açıldığında bir sonraki isteği hata yapar (hata durumu demosu)', async () => {
    const controls = getMockDevControls();
    controls.failNextRequest = true;
    await expect(adapter.getFeed()).rejects.toThrow('MOCK_NETWORK_FAILURE');
    expect(controls.failNextRequest).toBe(false);
  });

  it('geliştirme profilini döner', () => {
    expect(adapter.getProfile().id).toBe(mockProfile.id);
  });
});
