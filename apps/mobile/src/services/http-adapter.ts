/**
 * HTTP adapter — gerçek sunucu istemcisi (Faz 7: mağaza satın alma akışı devrede).
 *
 * Katalog uçları gerçek API'ye bağlanır:
 *   /home · /catalog/titles · /catalog/titles/:slug · /catalog/episodes/:id
 *   /search?query=&kind=&category= · /catalog/categories · /catalog/categories/:slug/titles
 * Favoriler (/watchlist) ve izleme ilerlemesi (/watch-progress) oturum
 * gerektirir; access token ApiClient tarafından başlığa eklenir.
 *
 * Satın alma akışı (Faz 7): satın alma RC SDK ile yapılır; bu adapter yalnızca
 * SUNUCU DOĞRULAMAsı uçlarını çağırır:
 *   POST /billing/purchases/validate  (Idempotency-Key zorunlu — BR-06)
 *   POST /billing/entitlements/sync   (mağaza durum eşitleme / geri yükleme)
 *   GET  /billing/config              (sağlayıcı durumu + ürün kimlikleri)
 * İstemcinin sunucu doğrulaması olmadan hak yazdığı YOL YOKTUR.
 */
import type {
  AccountDeletionResponse,
  AuthSession,
  AuthSessionListResponse,
  BillingConfigResponse,
  DeviceResponse,
  EntitlementSyncRequest,
  EntitlementSyncResponse,
  EpisodeDetailResponse,
  FavoritesListResponse,
  FavoriteMutationResponse,
  HomeResponse,
  LegalDocument,
  NotificationListResponse,
  NotificationPreferences,
  PlaybackSession,
  PlansResponse,
  PublicUserProfile,
  PurchaseValidate,
  PurchaseValidateResponse,
  RegisterRequest,
  SearchParams,
  SearchResponse,
  TitleDetailResponse,
  TitleListParams,
  TitleListResponse,
  WatchProgressListResponse,
  WatchProgressPut,
  CreditPacksResponse,
  WalletResponse,
  WalletTransactionsResponse,
} from '@perdego/contracts';
import { ApiClient } from './api-client';
import type { ContentApiPort, CategoryContentPage } from './ports';

function toQueryString(entries: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

/** Idempotency-Key: sunucu BR-06 kuralı (min 8 karakter). */
function idempotencyHeaders(key: string): Record<string, string> {
  return { 'Idempotency-Key': key };
}

export function createHttpAdapter(client: ApiClient): ContentApiPort {
  return {
    // ---------------- Katalog (Faz 2c) ----------------
    async getFeed(): Promise<HomeResponse> {
      return client.get<HomeResponse>('/home');
    },

    async listTitles(params: TitleListParams): Promise<TitleListResponse> {
      const query = toQueryString({
        page: params.page,
        pageSize: params.pageSize,
        kind: params.kind,
        accessType: params.accessType,
        category: params.category,
        sort: params.sort,
      });
      return client.get<TitleListResponse>(`/catalog/titles?${query}`);
    },

    async searchContent(params: SearchParams): Promise<SearchResponse> {
      const query = toQueryString({
        query: params.query,
        page: params.page,
        pageSize: params.pageSize,
        kind: params.kind,
        category: params.category,
      });
      return client.get<SearchResponse>(`/search?${query}`);
    },

    async getTitleDetail(slug: string): Promise<TitleDetailResponse> {
      return client.get<TitleDetailResponse>(`/catalog/titles/${encodeURIComponent(slug)}`);
    },

    async getEpisodeDetail(episodeId: string): Promise<EpisodeDetailResponse> {
      return client.get<EpisodeDetailResponse>(`/catalog/episodes/${encodeURIComponent(episodeId)}`);
    },

    async getCategories() {
      return client.get('/catalog/categories');
    },

    async getCategoryContent(slug: string, page: number, pageSize: number): Promise<CategoryContentPage> {
      const query = toQueryString({ page, pageSize });
      return client.get<CategoryContentPage>(
        `/catalog/categories/${encodeURIComponent(slug)}/titles?${query}`
      );
    },

    // ---------------- Favoriler ve izleme (Faz 2c) ----------------
    async getFavorites(): Promise<FavoritesListResponse> {
      return client.get<FavoritesListResponse>('/watchlist');
    },

    async addFavorite(contentId: string): Promise<FavoriteMutationResponse> {
      return client.post<FavoriteMutationResponse>(`/watchlist/${encodeURIComponent(contentId)}`);
    },

    async removeFavorite(contentId: string): Promise<FavoriteMutationResponse> {
      return client.delete<FavoriteMutationResponse>(`/watchlist/${encodeURIComponent(contentId)}`);
    },

    async getWatchProgress(params: {
      scope: 'continue' | 'history';
      page: number;
      pageSize: number;
    }): Promise<WatchProgressListResponse> {
      const query = toQueryString({
        scope: params.scope,
        page: params.scope === 'history' ? params.page : undefined,
        pageSize: params.scope === 'history' ? params.pageSize : undefined,
      });
      return client.get<WatchProgressListResponse>(`/watch-progress?${query}`);
    },

    async saveWatchProgress(
      episodeId: string,
      input: WatchProgressPut,
    ): Promise<{ saved: true; completed: boolean }> {
      return client.put<{ saved: true; completed: boolean }>(
        `/watch-progress/${encodeURIComponent(episodeId)}`,
        input
      );
    },

    // ---------------- Oynatma oturumu (FAZ 4) ----------------
    async createPlaybackSession(episodeId: string): Promise<PlaybackSession> {
      return client.post<PlaybackSession>(
        `/media/playback/${encodeURIComponent(episodeId)}/session`
      );
    },

    // ---------------- Abonelik ve kredi (Faz 7: gerçek uçlar) ----------------
    async getSubscriptionPlans(): Promise<PlansResponse> {
      const products = await client.get<PlansResponse & CreditPacksResponse>('/billing/products');
      return { plans: products.plans };
    },
    async getCreditPacks(): Promise<CreditPacksResponse> {
      const products = await client.get<PlansResponse & CreditPacksResponse>('/billing/products');
      return { packs: products.packs };
    },
    async getBillingConfig(): Promise<BillingConfigResponse> {
      return client.get<BillingConfigResponse>('/billing/config');
    },
    async getWallet(): Promise<WalletResponse> {
      return client.get<WalletResponse>('/credits/wallet');
    },
    async getWalletTransactions(): Promise<WalletTransactionsResponse> {
      return client.get<WalletTransactionsResponse>('/credits/transactions');
    },
    async validatePurchase(
      input: PurchaseValidate & { idempotencyKey: string },
    ): Promise<PurchaseValidateResponse> {
      const { idempotencyKey, ...body } = input;
      return client.post<PurchaseValidateResponse>(
        '/billing/purchases/validate',
        body,
        idempotencyHeaders(idempotencyKey),
      );
    },
    async syncEntitlements(input: EntitlementSyncRequest): Promise<EntitlementSyncResponse> {
      return client.post<EntitlementSyncResponse>('/billing/entitlements/sync', input);
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

    // ---------------- Bildirimler (FAZ 9) ----------------
    async registerDeviceToken(input: {
      platform: 'IOS' | 'ANDROID';
      pushToken: string;
      appVersion?: string;
      locale: 'tr' | 'en';
    }): Promise<DeviceResponse> {
      return client.post<DeviceResponse>('/notifications/devices', input);
    },

    async removeDeviceToken(deviceId: string): Promise<{ removed: boolean }> {
      return client.delete<{ removed: boolean }>(
        `/notifications/devices/${encodeURIComponent(deviceId)}`,
      );
    },

    async listNotifications(params: {
      page: number;
      pageSize: number;
    }): Promise<NotificationListResponse> {
      const query = toQueryString({ page: params.page, pageSize: params.pageSize });
      return client.get<NotificationListResponse>(`/notifications?${query}`);
    },

    async markNotificationRead(notificationId: string): Promise<{ marked: boolean }> {
      return client.post<{ marked: boolean }>(
        `/notifications/${encodeURIComponent(notificationId)}/read`,
        {},
      );
    },

    async markAllNotificationsRead(): Promise<{ marked: true }> {
      return client.post<{ marked: true }>('/notifications/read-all', {});
    },

    async getNotificationPreferences(): Promise<NotificationPreferences> {
      return client.get<NotificationPreferences>('/notifications/preferences');
    },

    async updateNotificationPreferences(
      input: { newEpisode?: boolean; newContent?: boolean; promo?: boolean },
    ): Promise<NotificationPreferences> {
      return client.patch<NotificationPreferences>('/notifications/preferences', input);
    },
  };
}
