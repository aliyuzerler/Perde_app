/**
 * İçerik + hesap + cüzdan API'si port (soyutlama).
 *
 * Mock adapter (geliştirme) ve HTTP adapter (gerçek sunucu) bu portu uygular.
 * Ekranlar ve hook'lar yalnızca bu arayüzü bilir; adapter seçimi `adapter.ts`
 * fabrikasında yapılır. Kural: ekranlar asla doğrudan mock veriye erişmez;
 * örnek veri yalnızca bu portun ardındaki mock adapter içinde yaşar.
 *
 * Faz 2c: katalog uçları gerçek sunucu sözleşmesiyle hizalandı —
 * /home, /catalog/titles, /catalog/titles/:slug, /catalog/episodes/:id,
 * /search (kind/category filtreli), /catalog/categories, favoriler
 * (/watchlist) ve izleme ilerlemesi (/watch-progress, scope=continue|history).
 */
import type {
  AccountDeletionResponse,
  AuthSession,
  AuthSessionListResponse,
  BillingConfigResponse,
  CategoryDetailResponse,
  CategoryListResponse,
  CreditPacksResponse,
  DeviceResponse,
  EntitlementSyncRequest,
  EntitlementSyncResponse,
  EpisodeDetailResponse,
  FavoritesListResponse,
  FavoriteMutationResponse,
  HomeResponse,
  LegalDocument,
  LoginRequest,
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
  WalletResponse,
  WalletTransactionsResponse,
  PageMeta,
} from '@perdego/contracts';

/** Sayfalı kategori içeriği (meta ile). */
export type CategoryContentPage = CategoryDetailResponse & { meta?: PageMeta };

/** Kütüphane sorgu kapsamı. */
export type WatchScope = 'continue' | 'history';

export interface ContentApiPort {
  // ---------- Katalog (Faz 2c: gerçek uçlar) ----------
  /** Ana sayfa: banner'lar + bölüm rayları (GET /home). */
  getFeed(): Promise<HomeResponse>;
  /** Sayfalı/filtreli içerik listesi (GET /catalog/titles — keşfet ızgarası). */
  listTitles(params: TitleListParams): Promise<TitleListResponse>;
  /** Arama (GET /search — kind/category filtreleri opsiyonel). */
  searchContent(params: SearchParams): Promise<SearchResponse>;
  /** İçerik detayı: sezonlar + erişim kararlı bölümler (GET /catalog/titles/:slug). */
  getTitleDetail(slug: string): Promise<TitleDetailResponse>;
  /** Bölüm detayı + sunucu erişim kararı (GET /catalog/episodes/:id). */
  getEpisodeDetail(episodeId: string): Promise<EpisodeDetailResponse>;
  /** Kategori listesi (GET /catalog/categories). */
  getCategories(): Promise<CategoryListResponse>;
  /** Bir kategorinin içerikleri (GET /catalog/categories/:slug/titles — sayfalı). */
  getCategoryContent(slug: string, page: number, pageSize: number): Promise<CategoryContentPage>;

  // ---------- Favoriler ve izleme ilerlemesi (Faz 2c: gerçek uçlar) ----------
  /** Favori listesi (GET /watchlist — kimlik gerekir). */
  getFavorites(): Promise<FavoritesListResponse>;
  /** Favoriye ekle (POST /watchlist/:contentId — idempotent). */
  addFavorite(contentId: string): Promise<FavoriteMutationResponse>;
  /** Favoriden çıkar (DELETE /watchlist/:contentId — idempotent). */
  removeFavorite(contentId: string): Promise<FavoriteMutationResponse>;
  /**
   * İzleme listesi (GET /watch-progress). scope=continue → devam et rayı;
   * scope=history → tüm kayıtlar (sayfalı, meta döner). Kimlik gerekir.
   */
  getWatchProgress(params: {
    scope: WatchScope;
    page: number;
    pageSize: number;
  }): Promise<WatchProgressListResponse>;
  /** Oynatma konumunu sunucuya kaydet (PUT /watch-progress/:episodeId). */
  saveWatchProgress(
    episodeId: string,
    input: WatchProgressPut,
  ): Promise<{ saved: true; completed: boolean }>;

  // ---------- Oynatma oturumu (FAZ 4: gerçek video akışı) ----------
  /**
   * Oynatma oturumu açar (POST /media/playback/:episodeId/session).
   * Sunucu erişim kararını YENİDEN doğrular: kilitli bölümde 402/403 döner;
   * yanıt kısa ömürlü imzalı akış URL'leri (hls/mp4) ve altyazı listesi taşır.
   * Video URL'leri uygulamaya gömülmez — yalnızca oturum yanıtı ile verilir.
   */
  createPlaybackSession(episodeId: string): Promise<PlaybackSession>;

  // ---------- Abonelik ve kredi (Faz 7: gerçek mağaza akışı) ----------
  /** Abonelik planları (paywall bilgilendirme — fiyatlar mağazadan da gelir). */
  getSubscriptionPlans(): Promise<PlansResponse>;
  /** Kredi paketleri (kredi mağazası). */
  getCreditPacks(): Promise<CreditPacksResponse>;
  /** Ödeme sağlayıcı durumu + mağaza ürün kimlikleri. */
  getBillingConfig(): Promise<BillingConfigResponse>;
  /** Cüzdan bakiyesi ve abonelik durumu. */
  getWallet(): Promise<WalletResponse>;
  /** Cüzdan hareket geçmişi. */
  getWalletTransactions(): Promise<WalletTransactionsResponse>;
  /**
   * Mağaza satın almasını sunucuda doğrular (RevenueCat ters sorgulu).
   * idempotencyKey: BR-06 — aynı satın alma tekrarında çift işleme yok.
   * Sunucu doğrulaması geçemeyen satın alma hak vermez (Güvenlik-1).
   */
  validatePurchase(input: PurchaseValidate & { idempotencyKey: string }): Promise<PurchaseValidateResponse>;
  /** Mağaza durumu eşitleme / geri yükleme (abonelik + kredi). */
  syncEntitlements(input: EntitlementSyncRequest): Promise<EntitlementSyncResponse>;

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

  // ---------- Bildirimler (FAZ 9: push + uygulama içi merkez) ----------
  /** Push token kaydet (upsert; çoklu cihaz destekli). */
  registerDeviceToken(input: {
    platform: 'IOS' | 'ANDROID';
    pushToken: string;
    appVersion?: string;
    locale: 'tr' | 'en';
  }): Promise<DeviceResponse>;
  /** Push token kaldır (çıkışta). */
  removeDeviceToken(deviceId: string): Promise<{ removed: boolean }>;
  /** Uygulama içi bildirim merkezi (sayfalı + unreadCount). */
  listNotifications(params: { page: number; pageSize: number }): Promise<NotificationListResponse>;
  /** Tek bildirimi okundu işaretle. */
  markNotificationRead(notificationId: string): Promise<{ marked: boolean }>;
  /** Tüm bildirimleri okundu işaretle. */
  markAllNotificationsRead(): Promise<{ marked: true }>;
  /** Bildirim tercihleri. */
  getNotificationPreferences(): Promise<NotificationPreferences>;
  /** Bildirim tercihlerini güncelle (system kapatılamaz). */
  updateNotificationPreferences(
    input: { newEpisode?: boolean; newContent?: boolean; promo?: boolean },
  ): Promise<NotificationPreferences>;
}
