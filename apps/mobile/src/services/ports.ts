/**
 * İçerik API'si port (soyutlama).
 *
 * Mock adapter (geliştirme) ve HTTP adapter (Faz 2'de gerçek sunucu) bu portu
 * uygular. Ekranlar ve hook'lar yalnızca bu arayüzü bilir; adapter seçimi
 * `adapter.ts` fabrikasında yapılır.
 */
import type {
  Content,
  FeedResponse,
  SearchParams,
  SearchResponse,
} from '@perdego/contracts';

export interface ContentApiPort {
  /** Keşfet akışını getirir. */
  getFeed(): Promise<FeedResponse>;
  /** Arama yapar. */
  searchContent(params: SearchParams): Promise<SearchResponse>;
  /** İçerik detayını getirir. */
  getContentDetail(contentId: string): Promise<Content>;
}
