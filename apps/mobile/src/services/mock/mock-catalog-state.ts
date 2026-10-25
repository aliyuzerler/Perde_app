/**
 * Mock katalog durumu — Faz 2c (YALNIZCA GELİŞTİRME).
 *
 * Gerçek sunucunun katalog/kütüphane davranışını geliştirme ortamında birebir
 * taklit eder: /home (banner+ray), /catalog/titles (filtre+sayfalama),
 * detay (erişim kararlı bölümler), favoriler ve izleme ilerlemesi.
 *
 * Test senaryoları (görev brief'i) dev/test ortamında seçilebilir:
 *   - `setMockCatalogScenario('empty-catalog')` → boş katalog
 *   - `setMockContentArchived(contentId, true)` → arşivlenmiş içerik
 *   - `setMockUnlockedEpisodes([...])` → krediyle açılmış bölümler
 * Bu yardımcılar `__DEV__` dışında çalışmaz (sahte veri üretimine kapalı).
 */
import type {
  Banner,
  CatalogEpisode,
  CatalogSeason,
  Content,
  ContentSummary,
  EpisodeAccess,
  FavoriteMutationResponse,
  HomeResponse,
  PageMeta,
  TitleDetailResponse,
  TitleListParams,
  TitleListResponse,
  WatchProgressItem,
} from '@perdego/contracts';
import { mockCategories, mockContentList, mockWalletState } from './mock-data';
import type { WatchScope } from '../ports';

export type MockCatalogScenario = 'default' | 'empty-catalog';

const COMPLETION_RATIO = 0.9;

/** Mock banner'lar (16:9; gerçek sunucu placeholder görsellerini mutlak URL ile verir). */
const mockBanners: Banner[] = [
  {
    id: 'b_mock_sezon',
    title: 'Yeni Sezon PerdeGo’da',
    subtitle: 'Kum Saati Protokolü ile zamana karşı',
    imageUrl: 'https://mock.perdego.dev/placeholders/banner/kum-saati-protokolu.svg',
    targetContentSlug: 'kum-saati-protokolu',
    deepLink: null,
  },
  {
    id: 'b_mock_kredi',
    title: 'Kredi Kampanyası',
    subtitle: 'İlk kredi paketinde bonus',
    imageUrl: 'https://mock.perdego.dev/placeholders/banner/gizli-bahce.svg',
    targetContentSlug: null,
    deepLink: null,
  },
];

const scenarioState = {
  scenario: 'default' as MockCatalogScenario,
  archived: new Set<string>(),
  unlocked: new Set<string>(),
  favorites: new Set<string>(),
  /** episodeId → ilerleme kaydı. */
  progress: new Map<string, WatchProgressItem>(),
};

function devOnly(): void {
  if (!__DEV__) {
    throw new Error('Mock katalog yardımcıları yalnızca geliştirme ortamında kullanılabilir.');
  }
}

export function setMockCatalogScenario(scenario: MockCatalogScenario): void {
  devOnly();
  scenarioState.scenario = scenario;
}

export function setMockContentArchived(contentId: string, archived: boolean): void {
  devOnly();
  if (archived) scenarioState.archived.add(contentId);
  else scenarioState.archived.delete(contentId);
}

export function setMockUnlockedEpisodes(episodeIds: string[]): void {
  devOnly();
  scenarioState.unlocked = new Set(episodeIds);
}

/** Tüm katalog/kütüphane mock durumunu sıfırlar (test izolasyonu). */
export function resetMockCatalogState(): void {
  devOnly();
  scenarioState.scenario = 'default';
  scenarioState.archived = new Set();
  scenarioState.unlocked = new Set();
  scenarioState.favorites = new Set();
  scenarioState.progress = new Map();
}

function visibleContents(): Content[] {
  if (scenarioState.scenario === 'empty-catalog') return [];
  return mockContentList.filter((content) => !scenarioState.archived.has(content.id));
}

function summaryOf(content: Content): ContentSummary {
  return {
    contentId: content.id,
    slug: content.slug,
    kind: content.kind,
    title: content.title,
    releaseYear: content.releaseYear,
    ageRating: content.ageRating,
    genres: content.genres,
    posterUrl: content.posterUrl,
    verticalPreviewUrl: content.verticalPreviewUrl,
    accessType: content.accessType,
    isNew: content.isNew,
  };
}

function buildPageMeta(page: number, pageSize: number, totalItems: number): PageMeta {
  return {
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
    hasNextPage: page < Math.ceil(totalItems / pageSize),
  };
}

/** GET /home eşleniği: banner'lar + raylar (arşiv/boş katalog senaryosuna saygılı). */
export function mockHome(): HomeResponse {
  if (scenarioState.scenario === 'empty-catalog') {
    return { banners: [], sections: [] };
  }
  const visible = visibleContents();
  const sections = [
    {
      id: 'hero_one',
      title: 'Öne Çıkan',
      layout: 'HERO' as const,
      items: visible.slice(0, 1).map(summaryOf),
    },
    {
      id: 'rail_trend',
      title: 'Trend Olan Mini Diziler',
      layout: 'RAIL' as const,
      items: visible.filter((c) => c.kind === 'SERIES').slice(0, 6).map(summaryOf),
    },
    {
      id: 'rail_verticals',
      title: 'Popüler Dikey Dramalar',
      layout: 'RAIL' as const,
      items: visible.slice(1, 5).map(summaryOf),
    },
    {
      id: 'rail_new',
      title: 'Yeni Eklenenler',
      layout: 'RAIL' as const,
      items: [...visible].reverse().slice(0, 6).map(summaryOf),
    },
    {
      id: 'grid_dram',
      title: 'Dram Dünyası',
      layout: 'GRID' as const,
      items: visible.filter((c) => c.genres.includes('dram')).slice(0, 6).map(summaryOf),
    },
  ].filter((section) => section.items.length > 0);
  return { banners: [...mockBanners], sections };
}

/** GET /catalog/titles eşleniği: filtre + sıralama + sayfalama. */
export function listMockTitles(params: TitleListParams): TitleListResponse {
  let rows = visibleContents();
  if (params.kind) rows = rows.filter((content) => content.kind === params.kind);
  if (params.accessType) rows = rows.filter((content) => content.accessType === params.accessType);
  if (params.category) rows = rows.filter((content) => content.genres.includes(params.category!));
  const sorted = [...rows].sort((a, b) => {
    if (params.sort === 'title') return a.title.localeCompare(b.title, 'tr');
    if (params.sort === 'oldest') return a.releaseYear - b.releaseYear;
    return Number(b.isNew) - Number(a.isNew);
  });
  const start = (params.page - 1) * params.pageSize;
  return {
    items: sorted.slice(start, start + params.pageSize).map(summaryOf),
    meta: buildPageMeta(params.page, params.pageSize, sorted.length),
  };
}

/** GET /search eşleniği: başlık/tür/özet + filtreler + sayfalama. */
export function searchMockCatalog(
  query: string,
  page: number,
  pageSize: number,
  filters?: { kind?: 'FILM' | 'SERIES' | 'SHORT_FILM'; category?: string },
): { items: ContentSummary[]; meta: PageMeta } {
  const normalized = query.trim().toLocaleLowerCase('tr-TR');
  let matched = visibleContents().filter((content) =>
    [content.title, content.genres.join(' '), content.synopsis]
      .join(' ')
      .toLocaleLowerCase('tr-TR')
      .includes(normalized)
  );
  if (filters?.kind) matched = matched.filter((content) => content.kind === filters.kind);
  if (filters?.category) matched = matched.filter((content) => content.genres.includes(filters.category!));
  const start = (page - 1) * pageSize;
  return {
    items: matched.slice(start, start + pageSize).map(summaryOf),
    meta: buildPageMeta(page, pageSize, matched.length),
  };
}

/** GET /catalog/categories/:slug/titles eşleniği (sayfalı). */
export function mockCategoryTitles(
  slug: string,
  page: number,
  pageSize: number,
): { found: false } | { found: true; category: { slug: string; name: string; contentCount: number }; items: ContentSummary[]; meta: PageMeta } {
  // Bilinmeyen kategori: gerçek sunucu gibi CATEGORY_NOT_FOUND (adapter 404 verir).
  const known = mockCategories.some((category) => category.slug === slug);
  if (!known) return { found: false };
  if (scenarioState.scenario === 'empty-catalog') {
    return { found: true, category: { slug, name: categoryDisplayName(slug), contentCount: 0 }, items: [], meta: buildPageMeta(page, pageSize, 0) };
  }
  const rows = visibleContents().filter((content) => content.genres.includes(slug));
  const start = (page - 1) * pageSize;
  return {
    found: true,
    category: { slug, name: categoryDisplayName(slug), contentCount: rows.length },
    items: rows.slice(start, start + pageSize).map(summaryOf),
    meta: buildPageMeta(page, pageSize, rows.length),
  };
}

/** Mock kategori adı: bilinen listeden, yoksa slug'tan türetilir. */
function categoryDisplayName(slug: string): string {
  return mockCategories.find((category) => category.slug === slug)?.name ?? slug.replace(/-/g, ' ');
}

/** Bölüm erişim kararı (sunucu AccessService.decideMany paritesi — mock). */
function episodeAccess(episode: Content['seasons'][number]['episodes'][number]): EpisodeAccess {
  if (episode.accessType === 'FREE') return { canPlay: true, reason: 'FREE' };
  if (episode.accessType === 'SUBSCRIPTION') {
    return isEntitled()
      ? { canPlay: true, reason: 'SUBSCRIPTION_ACTIVE' }
      : { canPlay: false, reason: 'NEEDS_SUBSCRIPTION' };
  }
  return scenarioState.unlocked.has(episode.id)
    ? { canPlay: true, reason: 'UNLOCKED', unlockedAt: new Date().toISOString() }
    : { canPlay: false, reason: 'NEEDS_CREDITS' };
}

function isEntitled(): boolean {
  // Mock cüzdan abonelik durumu (Faz 3 mock'u) entitle kararı verir.
  return ['ACTIVE', 'TRIALING', 'GRACE_PERIOD'].includes(mockWalletState.subscriptionStatus);
}

function toCatalogEpisode(
  episode: Content['seasons'][number]['episodes'][number]
): CatalogEpisode {
  return {
    ...episode,
    creditCost: episode.accessType === 'CREDIT' ? 2 : null,
    access: episodeAccess(episode),
  };
}

/** GET /catalog/titles/:slug eşleniği (id veya slug). */
export function findMockTitleDetail(slugOrId: string): TitleDetailResponse | undefined {
  const content = visibleContents().find(
    (candidate) => candidate.id === slugOrId || candidate.slug === slugOrId
  );
  if (!content) return undefined;
  const accessSeasons: CatalogSeason[] = content.seasons.map((season) => ({
    id: `${content.id}_s${season.seasonNumber}`,
    seasonNumber: season.seasonNumber,
    title: season.title,
    episodes: season.episodes.map(toCatalogEpisode),
  }));
  return {
    ...content,
    accessSeasons,
  };
}

/** GET /catalog/episodes/:id eşleniği. */
export function findMockEpisodeDetail(
  episodeId: string
): (CatalogEpisode & { content: ContentSummary }) | undefined {
  for (const content of visibleContents()) {
    for (const season of content.seasons) {
      const episode = season.episodes.find((candidate) => candidate.id === episodeId);
      if (episode) {
        return { ...toCatalogEpisode(episode), content: summaryOf(content) };
      }
    }
  }
  return undefined;
}

// ---------------- Favoriler -------------------------------------------------

export function mockFavoritesList(): ContentSummary[] {
  return visibleContents()
    .filter((content) => scenarioState.favorites.has(content.id))
    .map(summaryOf);
}

export function mockAddFavorite(contentId: string): FavoriteMutationResponse | undefined {
  const exists = mockContentList.some((content) => content.id === contentId);
  if (!exists) return undefined;
  const already = scenarioState.favorites.has(contentId);
  scenarioState.favorites.add(contentId);
  return { contentId, favorited: true, alreadyFavorited: already };
}

export function mockRemoveFavorite(contentId: string): FavoriteMutationResponse | undefined {
  const exists = mockContentList.some((content) => content.id === contentId);
  if (!exists) return undefined;
  scenarioState.favorites.delete(contentId);
  return { contentId, favorited: false, alreadyFavorited: false };
}

// ---------------- İzleme ilerlemesi ------------------------------------------

export function mockSaveProgress(input: {
  episodeId: string;
  positionSeconds: number;
  completed?: boolean;
}): { saved: true; completed: boolean } | undefined {
  for (const content of visibleContents()) {
    for (const season of content.seasons) {
      const episode = season.episodes.find((candidate) => candidate.id === input.episodeId);
      if (episode) {
        const position = Math.min(input.positionSeconds, episode.durationSeconds);
        const completed = input.completed ?? position >= episode.durationSeconds * COMPLETION_RATIO;
        scenarioState.progress.set(input.episodeId, {
          episodeId: input.episodeId,
          contentId: content.id,
          contentSlug: content.slug,
          contentTitle: content.title,
          episodeTitle: episode.title,
          seasonNumber: season.seasonNumber,
          episodeNumber: episode.episodeNumber,
          positionSeconds: position,
          durationSeconds: episode.durationSeconds,
          completed,
          lastWatchedAt: new Date().toISOString(),
          posterUrl: content.posterUrl,
        });
        return { saved: true, completed };
      }
    }
  }
  return undefined;
}

/** GET /watch-progress eşleniği (scope=continue|history). */
export function mockWatchProgressList(
  scope: WatchScope,
  page: number,
  pageSize: number
): { items: WatchProgressItem[]; meta?: PageMeta } {
  const rows = [...scenarioState.progress.values()].sort((a, b) =>
    b.lastWatchedAt.localeCompare(a.lastWatchedAt)
  );
  if (scope === 'continue') {
    return { items: rows.filter((row) => !row.completed).slice(0, 20) };
  }
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    meta: buildPageMeta(page, pageSize, rows.length),
  };
}
