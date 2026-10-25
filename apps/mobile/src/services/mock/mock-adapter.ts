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
  AuthSession,
  CategoryDetailResponse,
  CategoryListResponse,
  Content,
  CreditPacksResponse,
  FeedResponse,
  LoginRequest,
  PlansResponse,
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
  mockPlansResponse,
  mockProfile,
  mockTransactionLog,
  mockWalletState,
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

function unauthorized(): Error {
  const error = new Error('INVALID_CREDENTIALS') as Error & { statusCode?: number };
  error.statusCode = 401;
  return error;
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

    // ---------------- Hesap (mock oturum) ----------------
    async login(credentials: LoginRequest): Promise<AuthSession> {
      ensureDevEnvironment();
      await delay(randomLatency());
      const user = findMockUserByCredentials(credentials.email, credentials.password);
      if (!user) {
        throw unauthorized();
      }
      return createMockSession(user);
    },

    async register(request: RegisterRequest): Promise<AuthSession> {
      ensureDevEnvironment();
      await delay(randomLatency());
      if (findMockUserByCredentials(request.email, request.password)) {
        const conflict = new Error('EMAIL_IN_USE') as Error & { statusCode?: number };
        conflict.statusCode = 409;
        throw conflict;
      }
      const user = {
        id: `u_${Date.now()}`,
        displayName: request.displayName,
        email: request.email,
        password: request.password,
        joinedAt: new Date().toISOString(),
      };
      return createMockSession(user);
    },

    async logout(): Promise<void> {
      ensureDevEnvironment();
      await delay(120);
    },
  };
}
