/**
 * HTTP adapter — gerçek sunucu istemcisi (Faz 2'de uçlar devreye alındığında
 * mock yerine bu adapter seçilir; bkz. docs/ROADMAP.md Faz 2 kabul kriterleri).
 */
import type {
  Content,
  FeedResponse,
  SearchParams,
  SearchResponse,
} from '@perdego/contracts';
import { ApiClient } from './api-client';
import type { ContentApiPort } from './ports';

export function createHttpAdapter(client: ApiClient): ContentApiPort {
  return {
    async getFeed(): Promise<FeedResponse> {
      return client.get<FeedResponse>('/feed');
    },

    async searchContent(params: SearchParams): Promise<SearchResponse> {
      const query = new URLSearchParams({
        query: params.query,
        page: String(params.page),
        pageSize: String(params.pageSize),
      }).toString();
      return client.get<SearchResponse>(`/search?${query}`);
    },

    async getContentDetail(contentId: string): Promise<Content> {
      return client.get<Content>(`/content/${encodeURIComponent(contentId)}`);
    },
  };
}
