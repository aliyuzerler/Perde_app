/**
 * HTTP adapter — gerçek sunucu istemcisi (Faz 3b: hesap uçları devrede).
 *
 * Katalog uçları (/feed, /search, /content, /categories) ve hesap uçları
 * (auth/account/legal) gerçek API'ye bağlanır. Kredi/abonelik satın alma
 * uçları sunucu mağaza entegrasyonu (Faz 5) öncesinde dürüstçe hata verir
 * (sahte başarılı yanıt üretmez).
 */
import type {
  AccountDeletionResponse,
  AuthSession,
  AuthSessionListResponse,
  RegisterRequest,
  CategoryDetailResponse,
  CategoryListResponse,
  Content,
  CreditPacksResponse,
  FeedResponse,
  LegalDocument,
  PlansResponse,
  PublicUserProfile,
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

    // ---------------- Hesap (Faz 3b sunucu) ----------------
    async login(input: { email: string; password: string }): Promise<AuthSession> {
      return client.post<AuthSession>('/auth/login', input);
    },

    async register(request: RegisterRequest): Promise<AuthSession> {
      return client.post<AuthSession>('/auth/register', request);
    },

    async logout(): Promise<void> {
      await client.post('/auth/logout');
    },

    async verifyEmail(token: string): Promise<{ verified: true }> {
      return client.post('/auth/verify-email', { token });
    },

    async resendVerification(email: string): Promise<{ sent: true }> {
      return client.post('/auth/resend-verification', { email });
    },

    async forgotPassword(email: string): Promise<{ sent: true }> {
      return client.post('/auth/forgot-password', { email });
    },

    async resetPassword(token: string, newPassword: string): Promise<{ reset: true }> {
      return client.post('/auth/reset-password', { token, newPassword });
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
      return client.post('/auth/change-password', { currentPassword, newPassword });
    },

    async getSessions(): Promise<AuthSessionListResponse> {
      return client.get<AuthSessionListResponse>('/auth/sessions');
    },

    async revokeSession(sessionId: string): Promise<void> {
      await client.delete(`/auth/sessions/${encodeURIComponent(sessionId)}`);
    },

    async logoutAll(): Promise<{ revoked: number }> {
      return client.post('/auth/logout-all');
    },

    async updateProfile(input: {
      displayName?: string;
      locale?: 'tr' | 'en';
    }): Promise<PublicUserProfile> {
      return client.patch<PublicUserProfile>('/me', input);
    },

    async uploadAvatar(file: {
      uri: string;
      name: string;
      mimeType: string;
    }): Promise<PublicUserProfile> {
      const form = new FormData();
      form.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType,
      } as unknown as Blob);
      return client.upload<PublicUserProfile>('/me/avatar', form);
    },

    async removeAvatar(): Promise<PublicUserProfile> {
      return client.delete<PublicUserProfile>('/me/avatar');
    },

    async requestAccountDeletion(password: string): Promise<AccountDeletionResponse> {
      return client.post<AccountDeletionResponse>('/account/delete-request', { password });
    },

    async restoreAccount(email: string, password: string): Promise<AuthSession> {
      return client.post<AuthSession>('/account/restore', { email, password });
    },

    async getLegalDocument(slug: 'terms' | 'privacy'): Promise<LegalDocument> {
      return client.get<LegalDocument>(`/legal/${slug}`);
    },
  };
}
