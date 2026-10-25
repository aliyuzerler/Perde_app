/**
 * Mock adapter testleri (Faz 2c güncel port).
 * Mock verinin contracts şemalarıyla uyumu burada doğrulanır — gerçek API de
 * aynı sözleşmeleri sağlamak zorundadır.
 */
import { describe, expect, it } from '@jest/globals';
import {
  contentSchema,
  homeResponseSchema,
  searchResponseSchema,
  titleDetailResponseSchema,
  titleListResponseSchema,
} from '@perdego/contracts';
import { createMockAdapter, getMockDevControls } from '../mock-adapter';
import { mockContentList, mockProfile } from '../mock-data';

describe('mock veri bütünlüğü', () => {
  it('tüm mock içerikler content şemasına uyar', () => {
    for (const content of mockContentList) {
      expect(() => contentSchema.parse(content)).not.toThrow();
    }
  });

  it('tüm poster/hero URL alanları kasıtlı olarak boştur (özgün placeholder politikası)', () => {
    for (const content of mockContentList) {
      expect(content.posterUrl ?? null).toBeNull();
      expect(content.heroImageUrl ?? null).toBeNull();
    }
  });
});

describe('createMockAdapter — katalog (Faz 2c)', () => {
  const adapter = createMockAdapter();

  it('home döner ve şemaya uyar (banner + raylar + hero)', async () => {
    const home = await adapter.getFeed();
    const parsed = homeResponseSchema.parse(home);
    expect(parsed.banners.length).toBeGreaterThan(0);
    expect(parsed.sections.length).toBeGreaterThan(0);
    expect(parsed.sections.some((section) => section.layout === 'HERO')).toBe(true);
  });

  it('sayfalı içerik listesi verir ve meta doğru', async () => {
    const page1 = await adapter.listTitles({ page: 1, pageSize: 4, sort: 'newest' });
    const parsed = titleListResponseSchema.parse(page1);
    expect(parsed.items).toHaveLength(4);
    expect(parsed.meta.totalItems).toBe(mockContentList.length);
    expect(parsed.meta.hasNextPage).toBe(true);

    const page2 = await adapter.listTitles({ page: 2, pageSize: 4, sort: 'newest' });
    const page1Ids = page1.items.map((i) => i.contentId);
    for (const item of page2.items) {
      expect(page1Ids).not.toContain(item.contentId);
    }
  });

  it('kind filtresi listeyi daraltır', async () => {
    const series = await adapter.listTitles({ page: 1, pageSize: 50, sort: 'newest', kind: 'SERIES' });
    expect(series.items.every((item) => item.kind === 'SERIES')).toBe(true);
    expect(series.items.length).toBeGreaterThan(0);
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

  it('sonuçsuz arama boş sayfalı yanıt verir (hata değil)', async () => {
    const result = await adapter.searchContent({ query: 'hiç-olmayan-yapım-zzz', page: 1, pageSize: 20 });
    expect(result.items).toEqual([]);
    expect(result.meta.totalItems).toBe(0);
  });

  it('var olmayan içerik için 404 benzeri hata fırlatır', async () => {
    await expect(adapter.getTitleDetail('c_yok_olsun')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('var olan içerik detayını erişim kararlı sezonlarla döner', async () => {
    const detail = await adapter.getTitleDetail(mockContentList[0]!.slug);
    const parsed = titleDetailResponseSchema.parse(detail);
    expect(parsed.slug).toBe('kum-saati-protokolu');
    expect(parsed.accessSeasons.length).toBeGreaterThan(0);
    for (const season of parsed.accessSeasons) {
      for (const episode of season.episodes) {
        expect(episode.access).toBeDefined();
        expect(episode.access!.reason).toBeDefined();
      }
    }
  });

  it('bölüm detayı sunucu erişim kararıyla döner', async () => {
    const detail = await adapter.getTitleDetail(mockContentList[0]!.slug);
    const episode = detail.accessSeasons[0]!.episodes[0]!;
    const ep = await adapter.getEpisodeDetail(episode.id);
    expect(ep.id).toBe(episode.id);
    expect(ep.content.slug).toBe('kum-saati-protokolu');
    expect(ep.access).toBeDefined();
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
