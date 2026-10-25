/**
 * İçerik + hesap + cüzdan API'si port (soyutlama).
 *
 * Mock adapter (geliştirme) ve HTTP adapter (gerçek sunucu) bu portu uygular.
 * Ekranlar ve hook'lar yalnızca bu arayüzü bilir; adapter seçimi `adapter.ts`
 * fabrikasında yapılır. Kural: ekranlar asla doğrudan mock veriye erişmez;
 * örnek veri yalnızca bu portun ardındaki mock adapter içinde yaşar.
 */
import type {
  AuthSession,
  AccountDeletionResponse,
  AuthSessionListResponse,
  CategoryDetailResponse,
  CategoryListResponse,
  Content,
  CreditPacksResponse,
  FeedResponse,
  LegalDocument,
  LoginRequest,
  PlansResponse,
  PublicUserProfile,
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

  // ---------- Abonelik ve kredi (mock; gerçek ödeme Faz 5) ----------
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

  // ---------- Hesap (Faz 3b: gerçek uçlar + mock eşdeğerleri) ----------
  /** E-posta + parola ile giriş. Doğrulanmamış e-postada 403 EMAIL_NOT_VERIFIED. */
  login(credentials: LoginRequest): Promise<AuthSession>;
  /** Kayıt (kullanım koşulları kabulü zorunlu). */
  register(request: RegisterRequest): Promise<AuthSession>;
  /** Oturumu kapatır (sunucuda refresh token iptal edilir). */
  logout(): Promise<void>;
  /** E-posta doğrulama anahtarını tüketir. */
  verifyEmail(token: string): Promise<{ verified: true }>;
  /** Doğrulama e-postasını yeniden gönder. */
  resendVerification(email: string): Promise<{ sent: true }>;
  /** Parola sıfırlama e-postası ister. */
  forgotPassword(email: string): Promise<{ sent: true }>;
  /** Anahtar ile parola sıfırlama (tüm oturumlar kapanır). */
  resetPassword(token: string, newPassword: string): Promise<{ reset: true }>;
  /** Oturum açıkken parola değiştirme (diğer cihazlar kapanır). */
  changePassword(currentPassword: string, newPassword: string): Promise<{ changed: true }>;
  /** Aktif oturum listesi. */
  getSessions(): Promise<AuthSessionListResponse>;
  /** Tek bir oturumu (cihazı) uzaktan kapatır. */
  revokeSession(sessionId: string): Promise<void>;
  /** Tüm cihazlardan çıkış. */
  logoutAll(): Promise<{ revoked: number }>;
  /** Profil güncelleme. */
  updateProfile(input: { displayName?: string; locale?: 'tr' | 'en' }): Promise<PublicUserProfile>;
  /** Profil fotoğrafı yükleme (jpeg/png/webp ≤ 2 MB). */
  uploadAvatar(file: { uri: string; name: string; mimeType: string }): Promise<PublicUserProfile>;
  /** Profil fotoğrafını kaldırma. */
  removeAvatar(): Promise<PublicUserProfile>;
  /** Hesap silme talebi (parola teyitli). */
  requestAccountDeletion(password: string): Promise<AccountDeletionResponse>;
  /** Silme talebini geri alır + oturum açar. */
  restoreAccount(email: string, password: string): Promise<AuthSession>;
  /** Yasal metin. */
  getLegalDocument(slug: 'terms' | 'privacy'): Promise<LegalDocument>;
}
