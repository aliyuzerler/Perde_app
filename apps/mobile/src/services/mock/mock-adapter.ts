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
  LoginRequest,
  CategoryDetailResponse,
  CategoryListResponse,
  Content,
  CreditPacksResponse,
  FeedResponse,
  LegalDocument,
  PlansResponse,
  PublicUserProfile,
  RegisterRequest,
  SearchParams,
  SearchResponse,
  WalletResponse,
  WalletTransactionsResponse,
} from '@perdego/contracts';
import type { ContentApiPort } from '../ports';
import {
  createMockSession,
  findMockCategory,
  findMockContent,
  findMockUserByCredentials,
  mockCategoryList,
  mockCreditPacks,
  mockCreditPacksResponse,
  mockFeed,
  mockOutbox,
  mockPlansResponse,
  mockProfile,
  mockTransactionLog,
  mockUsers,
  mockWalletState,
  pushMockEmail,
  resetMockUsers,
  searchMockContent,
  type MockUserRecord,
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

/** Oturum modülü durumunu (kullanıcı listesi, kutu, cihazlar) sıfırlar. */
export function resetMockAccountState(): void {
  resetMockUsers();
  mockOutbox.length = 0;
  mockAccountState.current = null;
  mockAccountState.sessions = [];
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

    // ---------------- Katalog ----------------
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

    async getCategories(): Promise<CategoryListResponse> {
      return respond(mockCategoryList);
    },

    async getCategoryContent(slug: string): Promise<CategoryDetailResponse> {
      const detail = findMockCategory(slug);
      if (!detail) {
        const notFound = new Error('NOT_FOUND') as Error & { statusCode?: number };
        notFound.statusCode = 404;
        await delay(randomLatency());
        throw notFound;
      }
      return respond(detail);
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
