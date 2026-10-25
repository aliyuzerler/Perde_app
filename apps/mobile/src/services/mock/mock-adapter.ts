/**
 * Mock adapter — YALNIZCA GELİŞTİRME (Genel Kural 8).
 *
 * - `createMockAdapter` yalnızca `__DEV__` içinde çağrılabilir; üretim
 *   derlemesinde çağrılması çalışma zamanı hatası verir (sahte başarı imkânsız).
 * - Gerçek ağ gecikmesi taklit edilir; hata durumlarının test edilebilmesi için
 *   `mockDevStore` üzerinden zorunlu hata anahtarları vardır.
 * - Yanıtlar `packages/contracts` şemalarıyla üretilir (sözleşme uyumu garanti).
 * - Ödeme ve kimlik akışları mock'tur; canlı ödeme Faz 5'te, gerçek kimlik
 *   Faz 3 sunucu tarafında devreye alınır.
 */
import type {
  AccountDeletionResponse,
  AuthSession,
  AuthSessionListResponse,
  EpisodeDetailResponse,
  FavoritesListResponse,
  FavoriteMutationResponse,
  HomeResponse,
  LegalDocument,
  LoginRequest,
  PlaybackSession,
  PlansResponse,
  PublicUserProfile,
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
import type { ContentApiPort, CategoryContentPage } from '../ports';
import {
  createMockSession,
  findMockUserByCredentials,
  mockCreditPacks,
  mockCreditPacksResponse,
  mockOutbox,
  mockPlansResponse,
  mockProfile,
  mockTransactionLog,
  mockUsers,
  mockWalletState,
  pushMockEmail,
  resetMockUsers,
  type MockUserRecord,
} from './mock-data';
import {
  findMockEpisodeDetail,
  findMockTitleDetail,
  listMockTitles,
  mockAddFavorite,
  mockCategoryTitles,
  mockFavoritesList,
  mockHome,
  mockRemoveFavorite,
  mockSaveProgress,
  mockWatchProgressList,
  searchMockCatalog,
  resetMockCatalogState,
} from './mock-catalog-state';

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

/** Oturum modülü durumunu (kullanıcı listesi, kutu, cihazlar) sıfırlar. */
export function resetMockAccountState(): void {
  resetMockUsers();
  mockOutbox.length = 0;
  mockAccountState.current = null;
  mockAccountState.sessions = [];
  resetMockCatalogState();
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

function unauthorized(): Error {
  const error = new Error('INVALID_CREDENTIALS') as Error & { statusCode?: number };
  error.statusCode = 401;
  return error;
}

/** Sunucu hata nedenlerini taklit eden alan hatası (ApiEnvelope.details.reason). */
function domainError(statusCode: number, message: string, reason: string): Error {
  const error = new Error(message) as Error & { statusCode?: number; reason?: string };
  error.statusCode = statusCode;
  error.reason = reason;
  return error;
}

/** Mock oturum durumu: tek kullanıcı + cihaz oturumları + yasal metinler. */
const mockAccountState = {
  /** Oturum açmış kullanıcının mock referansı (dev akışı). */
  current: null as MockUserRecord | null,
  /** Cihaz başına mock oturumlar: id → refreshToken. */
  sessions: [] as { id: string; refreshToken: string; createdAt: string; current: boolean }[],
  legal: {
    terms: {
      slug: 'terms' as const,
      title: 'PerdeGo Kullanım Koşulları',
      version: '1.0',
      updatedAt: '2026-10-26',
      content: '# Kullanım Koşulları\n\nMock metin — geliştirme modunda gösterilir.',
    },
    privacy: {
      slug: 'privacy' as const,
      title: 'PerdeGo Gizlilik Politikası',
      version: '1.0',
      updatedAt: '2026-10-26',
      content: '# Gizlilik Politikası\n\nMock metin — geliştirme modunda gösterilir.',
    },
  },
};

function randomToken(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function sessionList(currentRefresh: string | null): AuthSessionListResponse {
  return {
    items: mockAccountState.sessions.map((session) => ({
      id: session.id,
      userAgent: 'Mock Device (geliştirme)',
      createdAt: session.createdAt,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      current: currentRefresh === session.refreshToken,
    })),
  };
}

function profileOf(user: MockUserRecord): PublicUserProfile {
  return {
    id: user.id,
    displayName: user.displayName,
    maskedEmail: `${user.email.slice(0, 1)}***@${user.email.split('@')[1] ?? ''}`,
    avatarUrl: null,
    preferredLocale: user.locale,
    joinedAt: user.joinedAt,
  };
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

/** Mock cüzdan görüntüsü — her istekte güncel durum kopyalanır. */
function walletSnapshot(): WalletResponse {
  return {
    wallet: {
      ...mockWalletState,
      creditBalance: mockWalletState.creditBalance,
    },
  };
}

export function createMockAdapter(): ContentApiPort & { getProfile: () => typeof mockProfile } {
  ensureDevEnvironment();

  return {
    getProfile: () => mockProfile,

    // ---------------- Katalog (Faz 2c: gerçek sunucu davranışının mock'u) ----
    async getFeed(): Promise<HomeResponse> {
      return respond(mockHome());
    },

    async listTitles(params: TitleListParams): Promise<TitleListResponse> {
      return respond(listMockTitles(params));
    },

    async searchContent(params: SearchParams): Promise<SearchResponse> {
      return respond(
        searchMockCatalog(params.query, params.page, params.pageSize, {
          kind: params.kind,
          category: params.category,
        })
      );
    },

    async getTitleDetail(slug: string): Promise<TitleDetailResponse> {
      const detail = findMockTitleDetail(slug);
      if (!detail) {
        const notFound = new Error('NOT_FOUND') as Error & { statusCode?: number };
        notFound.statusCode = 404;
        await delay(randomLatency());
        throw notFound;
      }
      return respond(detail);
    },

    async getEpisodeDetail(episodeId: string): Promise<EpisodeDetailResponse> {
      const episode = findMockEpisodeDetail(episodeId);
      if (!episode) {
        const notFound = new Error('NOT_FOUND') as Error & { statusCode?: number };
        notFound.statusCode = 404;
        await delay(randomLatency());
        throw notFound;
      }
      return respond(episode);
    },

    async getCategories() {
      // Kategori listesi görünür içeriklerden türetilir (arşiv/boş katalog saygılı).
      const home = mockHome();
      const counts = new Map<string, number>();
      for (const section of home.sections) {
        for (const item of section.items) {
          for (const genre of item.genres) counts.set(genre, (counts.get(genre) ?? 0) + 1);
        }
      }
      const items = [...counts.entries()].map(([slug, count]) => ({
        slug,
        name: slug.replace(/-/g, ' '),
        contentCount: count,
      }));
      return respond({ items });
    },

    async getCategoryContent(
      slug: string,
      page: number,
      pageSize: number
    ): Promise<CategoryContentPage> {
      const detail = mockCategoryTitles(slug, page, pageSize);
      if (!detail.found) {
        const notFound = new Error('NOT_FOUND') as Error & { statusCode?: number };
        notFound.statusCode = 404;
        await delay(randomLatency());
        throw notFound;
      }
      return respond({
        category: detail.category,
        items: detail.items,
        meta: detail.meta,
      });
    },

    // ---------------- Favoriler ve izleme (Faz 2c mock) ----------------
    async getFavorites(): Promise<FavoritesListResponse> {
      if (!mockAccountState.current) throw unauthorized();
      return respond({ items: mockFavoritesList() });
    },

    async addFavorite(contentId: string): Promise<FavoriteMutationResponse> {
      if (!mockAccountState.current) throw unauthorized();
      const response = mockAddFavorite(contentId);
      if (!response) {
        throw domainError(404, 'errors.contentNotFound', 'CONTENT_NOT_FOUND');
      }
      return respond(response);
    },

    async removeFavorite(contentId: string): Promise<FavoriteMutationResponse> {
      if (!mockAccountState.current) throw unauthorized();
      const response = mockRemoveFavorite(contentId);
      if (!response) {
        throw domainError(404, 'errors.contentNotFound', 'CONTENT_NOT_FOUND');
      }
      return respond(response);
    },

    async getWatchProgress(params: {
      scope: 'continue' | 'history';
      page: number;
      pageSize: number;
    }): Promise<WatchProgressListResponse> {
      if (!mockAccountState.current) throw unauthorized();
      return respond(mockWatchProgressList(params.scope, params.page, params.pageSize));
    },

    async saveWatchProgress(
      episodeId: string,
      input: WatchProgressPut
    ): Promise<{ saved: true; completed: boolean }> {
      if (!mockAccountState.current) throw unauthorized();
      const response = mockSaveProgress({
        episodeId,
        positionSeconds: input.positionSeconds,
        completed: input.completed,
      });
      if (!response) {
        throw domainError(404, 'errors.episodeNotFound', 'EPISODE_NOT_FOUND');
      }
      return respond(response);
    },

    // ---------------- Oynatma oturumu (FAZ 4) ----------------
    // DÜRÜST KAPSAM: gerçek video akışı yalnızca gerçek sunucudan gelir.
    // Mock adapter SAHTE video URL'i ÜRETMEZ (video URL'lerini uygulama
    // koduna gömme kuralı); oynatma için EXPO_PUBLIC_MOCK_API=0 gerekir.
    async createPlaybackSession(): Promise<PlaybackSession> {
      throw domainError(503, 'errors.playbackRequiresServer', 'SERVICE_UNAVAILABLE');
    },

    // ---------------- Abonelik ve kredi (mock) ----------------
    async getSubscriptionPlans(): Promise<PlansResponse> {
      return respond(mockPlansResponse);
    },

    async getCreditPacks(): Promise<CreditPacksResponse> {
      return respond(mockCreditPacksResponse);
    },

    async getWallet(): Promise<WalletResponse> {
      return respond(walletSnapshot());
    },

    async getWalletTransactions(): Promise<WalletTransactionsResponse> {
      return respond({
        items: [...mockTransactionLog].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      });
    },

    async purchaseCredits(packId: string): Promise<WalletResponse> {
      const pack = mockCreditPacks.find((item) => item.id === packId);
      if (!pack) {
        const notFound = new Error('NOT_FOUND') as Error & { statusCode?: number };
        notFound.statusCode = 404;
        await delay(randomLatency());
        throw notFound;
      }
      await delay(randomLatency());
      if (controls.failNextRequest) {
        controls.failNextRequest = false;
        throw new Error('MOCK_NETWORK_FAILURE');
      }
      const total = pack.credits + pack.bonusCredits;
      mockWalletState.purchasedCredits += total;
      mockWalletState.creditBalance += total;
      mockTransactionLog.push({
        id: `tx_${Date.now()}`,
        kind: 'CREDIT_PURCHASE',
        amount: total,
        balanceAfter: mockWalletState.creditBalance,
        createdAt: new Date().toISOString(),
        label: `${pack.credits} kredi paketi`,
      });
      return walletSnapshot();
    },

    async subscribe(planId: string): Promise<WalletResponse> {
      const plan = mockPlansResponse.plans.find((item) => item.id === planId);
      if (!plan) {
        const notFound = new Error('NOT_FOUND') as Error & { statusCode?: number };
        notFound.statusCode = 404;
        await delay(randomLatency());
        throw notFound;
      }
      await delay(randomLatency());
      if (controls.failNextRequest) {
        controls.failNextRequest = false;
        throw new Error('MOCK_NETWORK_FAILURE');
      }
      mockWalletState.subscriptionStatus = 'ACTIVE';
      const renews = new Date();
      renews.setMonth(renews.getMonth() + 1);
      mockWalletState.subscriptionRenewsAt = renews.toISOString();
      return walletSnapshot();
    },

    // ---------------- Hesap (Faz 3b mock — sunucu akışının birebir taklidi) ---
    async login(credentials: LoginRequest): Promise<AuthSession> {
      ensureDevEnvironment();
      await delay(randomLatency());
      const user = findMockUserByCredentials(credentials.email, credentials.password);
      if (!user) {
        throw unauthorized();
      }
      if (!user.emailVerified) {
        throw domainError(403, 'errors.emailNotVerified', 'EMAIL_NOT_VERIFIED');
      }
      const session = createMockSession(user);
      mockAccountState.current = user;
      mockAccountState.sessions.push({
        id: `s_${Date.now()}`,
        refreshToken: session.tokens.refreshToken,
        createdAt: new Date().toISOString(),
        current: true,
      });
      return session;
    },

    async register(request: RegisterRequest): Promise<AuthSession> {
      ensureDevEnvironment();
      await delay(randomLatency());
      const email = request.email.trim().toLowerCase();
      if (mockUsers.some((u) => u.email === email)) {
        throw domainError(409, 'errors.emailExists', 'EMAIL_ALREADY_EXISTS');
      }
      const user: MockUserRecord = {
        id: `u_${Date.now()}`,
        displayName: request.displayName,
        email,
        password: request.password,
        joinedAt: new Date().toISOString(),
        // Kayıt sonrası giriş kilitlidir — gerçek sunucu akışıyla aynı:
        // doğrulama e-postası gider, mock kutusuna anahtar düşer.
        emailVerified: false,
        locale: request.locale ?? 'tr',
        role: 'USER',
      };
      mockUsers.push(user);
      const token = randomToken('verify');
      pushMockEmail(user.email, 'PerdeGo — E-posta doğrulama', token);
      const session = createMockSession(user);
      mockAccountState.current = user;
      return session;
    },

    async logout(): Promise<void> {
      ensureDevEnvironment();
      await delay(120);
      mockAccountState.current = null;
      mockAccountState.sessions = [];
    },

    async verifyEmail(token: string): Promise<{ verified: true }> {
      ensureDevEnvironment();
      await delay(200);
      const index = mockOutbox.findIndex((mail) => mail.token === token);
      if (index === -1) {
        throw domainError(400, 'errors.tokenInvalid', 'TOKEN_INVALID');
      }
      const mail = mockOutbox[index]!;
      mockOutbox.splice(index, 1);
      const user = mockUsers.find((u) => u.email === mail.to);
      if (user) user.emailVerified = true;
      return { verified: true };
    },

    async resendVerification(email: string): Promise<{ sent: true }> {
      ensureDevEnvironment();
      await delay(200);
      const user = mockUsers.find((u) => u.email === email.trim().toLowerCase());
      if (user && !user.emailVerified) {
        pushMockEmail(user.email, 'PerdeGo — E-posta doğrulama', randomToken('verify'));
      }
      return { sent: true };
    },

    async forgotPassword(email: string): Promise<{ sent: true }> {
      ensureDevEnvironment();
      await delay(200);
      const user = mockUsers.find((u) => u.email === email.trim().toLowerCase());
      if (user) {
        pushMockEmail(user.email, 'PerdeGo — Parola sıfırlama', randomToken('reset'));
      }
      return { sent: true };
    },

    async resetPassword(token: string, newPassword: string): Promise<{ reset: true }> {
      ensureDevEnvironment();
      await delay(200);
      const index = mockOutbox.findIndex((mail) => mail.token === token);
      if (index === -1) {
        throw domainError(400, 'errors.tokenInvalid', 'TOKEN_INVALID');
      }
      const mail = mockOutbox[index]!;
      mockOutbox.splice(index, 1);
      const user = mockUsers.find((u) => u.email === mail.to);
      if (user) user.password = newPassword;
      mockAccountState.sessions = [];
      return { reset: true };
    },

    async changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }> {
      ensureDevEnvironment();
      await delay(200);
      const user = mockAccountState.current;
      if (!user || user.password !== currentPassword) {
        throw domainError(400, 'errors.wrongPassword', 'WRONG_PASSWORD');
      }
      user.password = newPassword;
      return { changed: true };
    },

    async getSessions(): Promise<AuthSessionListResponse> {
      ensureDevEnvironment();
      await delay(150);
      const currentRefresh = mockAccountState.sessions.find((s) => s.current)?.refreshToken ?? null;
      return sessionList(currentRefresh);
    },

    async revokeSession(sessionId: string): Promise<void> {
      ensureDevEnvironment();
      await delay(150);
      const index = mockAccountState.sessions.findIndex((s) => s.id === sessionId);
      if (index === -1) {
        throw domainError(404, 'errors.notFound', 'SESSION_NOT_FOUND');
      }
      mockAccountState.sessions.splice(index, 1);
    },

    async logoutAll(): Promise<{ revoked: number }> {
      ensureDevEnvironment();
      await delay(150);
      const count = mockAccountState.sessions.length;
      mockAccountState.sessions = [];
      return { revoked: count };
    },

    async updateProfile(input: {
      displayName?: string;
      locale?: 'tr' | 'en';
    }): Promise<PublicUserProfile> {
      ensureDevEnvironment();
      await delay(200);
      const user = mockAccountState.current;
      if (!user) throw unauthorized();
      if (input.displayName !== undefined) user.displayName = input.displayName;
      if (input.locale !== undefined) user.locale = input.locale;
      return profileOf(user);
    },

    async uploadAvatar(file: { uri: string; name: string; mimeType: string }): Promise<PublicUserProfile> {
      ensureDevEnvironment();
      await delay(300);
      const user = mockAccountState.current;
      if (!user) throw unauthorized();
      return { ...profileOf(user), avatarUrl: `mock://avatars/${encodeURIComponent(file.name)}` };
    },

    async removeAvatar(): Promise<PublicUserProfile> {
      ensureDevEnvironment();
      await delay(150);
      const user = mockAccountState.current;
      if (!user) throw unauthorized();
      return profileOf(user);
    },

    async requestAccountDeletion(password: string): Promise<AccountDeletionResponse> {
      ensureDevEnvironment();
      await delay(250);
      const user = mockAccountState.current;
      if (!user || user.password !== password) {
        throw domainError(400, 'errors.wrongPassword', 'WRONG_PASSWORD');
      }
      const purgeAt = new Date();
      purgeAt.setDate(purgeAt.getDate() + 30);
      mockAccountState.sessions = [];
      mockAccountState.current = null;
      return { purgeAt: purgeAt.toISOString(), email: user.email };
    },

    async restoreAccount(email: string, password: string): Promise<AuthSession> {
      ensureDevEnvironment();
      await delay(250);
      const user = mockUsers.find((u) => u.email === email.trim().toLowerCase());
      if (!user || user.password !== password) {
        throw unauthorized();
      }
      user.emailVerified = true;
      const session = createMockSession(user);
      mockAccountState.current = user;
      mockAccountState.sessions.push({
        id: `s_${Date.now()}`,
        refreshToken: session.tokens.refreshToken,
        createdAt: new Date().toISOString(),
        current: true,
      });
      return session;
    },

    async getLegalDocument(slug: 'terms' | 'privacy'): Promise<LegalDocument> {
      ensureDevEnvironment();
      await delay(120);
      return mockAccountState.legal[slug];
    },
  };
}
