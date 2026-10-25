/**
 * HTTP adapter — gerçek sunucu istemcisi.
 *
 * Katalog uçları (/feed, /search, /content, /categories) Faz 2b'de sunucuda
 * devreye alındığında mock yerine bu adapter seçilir. Hesap ve ödeme uçları
 * henüz sunucuda yoktur; bu adapter o yöntemlerde dürüstçe hata verir
 * (sahte başarılı yanıt üretmez).
 */
import type {
  AuthSession,
  CategoryDetailResponse,
  CategoryListResponse,
  Content,
  CreditPacksResponse,
  FeedResponse,
  PlansResponse,
  SearchParams,
  SearchResponse,
  WalletResponse,
  WalletTransactionsResponse,
} from '@perdego/contracts';
import { ApiClient, ApiClientError } from './api-client';
import type { ContentApiPort } from './ports';

function notYetImplemented(faz: string): ApiClientError {
  return new ApiClientError(
    'server',
    `Bu uç henüz sunucuda devreye alınmadı (${faz}).`,
    'SERVICE_UNAVAILABLE'
  );
}

export function createHttpAdapter(client: ApiClient): ContentApiPort {
  return {
    // ---------------- Katalog ----------------
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

    async getCategories(): Promise<CategoryListResponse> {
      return client.get<CategoryListResponse>('/categories');
    },

    async getCategoryContent(slug: string): Promise<CategoryDetailResponse> {
      return client.get<CategoryDetailResponse>(
        `/categories/${encodeURIComponent(slug)}/content`
      );
    },

    // ---------------- Abonelik ve kredi (Faz 5 sunucu) ----------------
    getSubscriptionPlans(): Promise<PlansResponse> {
      return Promise.reject(notYetImplemented('Faz 5'));
    },
    getCreditPacks(): Promise<CreditPacksResponse> {
      return Promise.reject(notYetImplemented('Faz 5'));
    },
    getWallet(): Promise<WalletResponse> {
      return Promise.reject(notYetImplemented('Faz 5'));
    },
    getWalletTransactions(): Promise<WalletTransactionsResponse> {
      return Promise.reject(notYetImplemented('Faz 5'));
    },
    purchaseCredits(): Promise<WalletResponse> {
      return Promise.reject(notYetImplemented('Faz 5'));
    },
    subscribe(): Promise<WalletResponse> {
      return Promise.reject(notYetImplemented('Faz 5'));
    },

    // ---------------- Hesap (Faz 3 sunucu) ----------------
    login(): Promise<AuthSession> {
      return Promise.reject(notYetImplemented('Faz 3 sunucu'));
    },
    register(): Promise<AuthSession> {
      return Promise.reject(notYetImplemented('Faz 3 sunucu'));
    },
    logout(): Promise<void> {
      return Promise.reject(notYetImplemented('Faz 3 sunucu'));
    },
  };
}
