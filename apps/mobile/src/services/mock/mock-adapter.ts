/**
 * Mock adapter — YALNIZCA GELİŞTİRME (Genel Kural 8).
 *
 * - `createMockAdapter` yalnızca `__DEV__` içinde çağrılabilir; üretim
 *   derlemesinde çağrılması çalışma zamanı hatası verir (sahte başarı imkânsız).
 * - Gerçek ağ gecikmesi taklit edilir; hata durumlarının test edilebilmesi için
 *   `mockDevStore` üzerinden zorunlu hata anahtarları vardır.
 * - Yanıtlar `packages/contracts` şemalarıyla üretilir (sözleşme uyumu garanti).
 */
import type {
  Content,
  FeedResponse,
  SearchParams,
  SearchResponse,
} from '@perdego/contracts';
import type { ContentApiPort } from '../ports';
import {
  findMockContent,
  mockFeed,
  mockProfile,
  searchMockContent,
} from './mock-data';

export interface MockDevControls {
  /** Bir sonraki isteğin ağ hatasıyla sonuçlanmasını zorlar (hata durumu demosu). */
  failNextRequest: boolean;
}

const controls: MockDevControls = {
  failNextRequest: false,
};

/** Geliştirme ortamında hata senaryolarını tetiklemek için kontrol arayüzü. */
export function getMockDevControls(): MockDevControls {
  return controls;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomLatency(): number {
  return 350 + Math.floor(Math.random() * 300);
}

function ensureDevEnvironment(): void {
  if (!__DEV__) {
    throw new Error(
      'MockAdapter yalnızca geliştirme ortamında kullanılabilir. Üretimde gerçek API adapter devreye almalıdır.'
    );
  }
}

async function respond<T>(payload: T): Promise<T> {
  ensureDevEnvironment();
  await delay(randomLatency());
  if (controls.failNextRequest) {
    controls.failNextRequest = false;
    throw new Error('MOCK_NETWORK_FAILURE');
  }
  return payload;
}

export function createMockAdapter(): ContentApiPort & { getProfile: () => typeof mockProfile } {
  ensureDevEnvironment();

  return {
    getProfile: () => mockProfile,

    async getFeed(): Promise<FeedResponse> {
      return respond(mockFeed);
    },

    async searchContent(params: SearchParams): Promise<SearchResponse> {
      return respond(searchMockContent(params.query, params.page, params.pageSize));
    },

    async getContentDetail(contentId: string): Promise<Content> {
      const content = findMockContent(contentId);
      if (!content) {
        const notFound = new Error('NOT_FOUND') as Error & { statusCode?: number };
        notFound.statusCode = 404;
        await delay(randomLatency());
        throw notFound;
      }
      return respond(content);
    },
  };
}
