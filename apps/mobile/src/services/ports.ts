/**
 * İçerik + hesap + cüzdan API'si port (soyutlama).
 *
 * Mock adapter (geliştirme) ve HTTP adapter (gerçek sunucu) bu portu uygular.
 * Ekranlar ve hook'lar yalnızca bu arayüzü bilir; adapter seçimi `adapter.ts`
 * fabrikasında yapılır. Kural: ekranlar asla doğrudan mock veriye erişmez;
 * örnek veri yalnızca bu portun ardındaki mock adapter içinde yaşar
 * (Faz 3 — geçici veri katmanı açık biçimde ayrılmıştır).
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

export interface ContentApiPort {
  // ---------- Katalog ----------
  /** Ana sayfa bölümleri (hero + yatay raylar). */
  getFeed(): Promise<FeedResponse>;
  /** Arama yapar. */
  searchContent(params: SearchParams): Promise<SearchResponse>;
  /** İçerik detayını getirir. */
  getContentDetail(contentId: string): Promise<Content>;
  /** Kategori listesi (keşfet sayfası). */
  getCategories(): Promise<CategoryListResponse>;
  /** Bir kategorinin içerikleri. */
  getCategoryContent(slug: string): Promise<CategoryDetailResponse>;

  // ---------- Abonelik ve kredi (Faz 3: mock; gerçek ödeme Faz 5) ----------
  /** Abonelik planları (paywall). */
  getSubscriptionPlans(): Promise<PlansResponse>;
  /** Kredi paketleri (kredi mağazası). */
  getCreditPacks(): Promise<CreditPacksResponse>;
  /** Cüzdan bakiyesi ve abonelik durumu. */
  getWallet(): Promise<WalletResponse>;
  /** Cüzdan hareket geçmişi. */
  getWalletTransactions(): Promise<WalletTransactionsResponse>;
  /** Kredi paketi satın alır (mock — canlı ödeme akışı Faz 5'te). */
  purchaseCredits(packId: string): Promise<WalletResponse>;
  /** Plan seçimi (mock — mağaza/iap Faz 5'te). */
  subscribe(planId: string): Promise<WalletResponse>;

  // ---------- Hesap (Faz 3: mock oturum; gerçek kimlik Faz 3 sunucu) ----------
  login(credentials: LoginRequest): Promise<AuthSession>;
  register(request: RegisterRequest): Promise<AuthSession>;
  logout(): Promise<void>;
}
