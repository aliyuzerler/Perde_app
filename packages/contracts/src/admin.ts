/**
 * Yönetim (admin) sözleşmeleri — Faz 2c: katalog yönetimi.
 *
 * Amaç: ana sayfa section/banner yönetimi ve içerik yaşam döngüsü
 * (TASLAK → İŞLENİYOR → YAYINDA → ARŞİVDE) için istemci/server sözleşmesi.
 * Bu uçların tamamı EDITOR/ADMIN rolü gerektirir; herkese açık katalog uçları
 * yalnızca PUBLISHED kayıtları görür (Kural 6) — yönetim görünümü ile
 * kullanıcı görünümü sunucuda ayrıştırılmıştır.
 */
import { z } from 'zod';
import { pageMetaSchema } from './common';
import { accessTypeSchema, contentKindSchema, contentSummarySchema } from './content';
import { pageRequestSchema } from './common';

/** İçerik yaşam döngüsü durumları (işleniyor: medya transkod aşaması). */
export const contentStatusSchema = z.enum([
  'DRAFT',
  'PROCESSING',
  'PUBLISHED',
  'ARCHIVED',
]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

/** GET /api/v1/admin/titles sorgusu (yönetim görünümü — tüm durumlar). */
export const adminTitleListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: contentStatusSchema.optional(),
  kind: contentKindSchema.optional(),
  /** Başlık/slug arama. */
  search: z.string().trim().min(1).max(80).optional(),
});
export type AdminTitleListParams = z.infer<typeof adminTitleListParamsSchema>;

/** Yönetim liste satırı: özet + durum + yayın zamanı. */
export const adminTitleSummarySchema = contentSummarySchema.extend({
  status: contentStatusSchema,
  publishedAt: z.string().min(1).nullable().optional(),
});
export type AdminTitleSummary = z.infer<typeof adminTitleSummarySchema>;

export const adminTitleListResponseSchema = z.object({
  items: z.array(adminTitleSummarySchema).default([]),
  meta: pageMetaSchema,
});
export type AdminTitleListResponse = z.infer<typeof adminTitleListResponseSchema>;

/** PATCH /api/v1/admin/titles/:id/status gövdesi. */
export const adminStatusChangeSchema = z.object({
  status: contentStatusSchema,
});
export type AdminStatusChange = z.infer<typeof adminStatusChangeSchema>;

export const adminStatusChangeResponseSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  status: contentStatusSchema,
  publishedAt: z.string().min(1).nullable(),
});
export type AdminStatusChangeResponse = z.infer<
  typeof adminStatusChangeResponseSchema
>;

// ---------------------------------------------------------------------------
// Banner yönetimi
// ---------------------------------------------------------------------------

export const bannerInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug kebab-case olmalı'),
  titleTr: z.string().min(1).max(120),
  titleEn: z.string().min(1).max(120),
  subtitleTr: z.string().max(200).optional(),
  subtitleEn: z.string().max(200).optional(),
  imageUrl: z.string().min(1).max(500),
  targetContentId: z.string().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});
export type BannerInput = z.infer<typeof bannerInputSchema>;

/** PATCH gövdesi: tüm alanlar opsiyonel. */
export const bannerUpdateSchema = bannerInputSchema.partial().omit({ slug: true });
export type BannerUpdate = z.infer<typeof bannerUpdateSchema>;

export const bannerAdminSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  titleTr: z.string().min(1),
  titleEn: z.string().min(1),
  subtitleTr: z.string().min(1).nullable().optional(),
  subtitleEn: z.string().min(1).nullable().optional(),
  imageUrl: z.string().min(1),
  targetContentId: z.string().min(1).nullable(),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  startsAt: z.string().min(1).nullable(),
  endsAt: z.string().min(1).nullable(),
});
export type BannerAdmin = z.infer<typeof bannerAdminSchema>;

export const bannerListResponseSchema = z.object({
  items: z.array(bannerAdminSchema).default([]),
});
export type BannerListResponse = z.infer<typeof bannerListResponseSchema>;

// ---------------------------------------------------------------------------
// Ana sayfa bölüm (home section) yönetimi
// ---------------------------------------------------------------------------

export const homeSectionTypeSchema = z.enum(['HERO', 'RAIL', 'CATEGORY_GRID']);
export type HomeSectionType = z.infer<typeof homeSectionTypeSchema>;

export const homeSectionInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'key kebab-case olmalı'),
  sectionType: homeSectionTypeSchema,
  titleTr: z.string().min(1).max(120),
  titleEn: z.string().min(1).max(120),
  categoryId: z.string().min(1).nullable().optional(),
  contentLimit: z.number().int().min(1).max(20).default(10),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type HomeSectionInput = z.infer<typeof homeSectionInputSchema>;

export const homeSectionUpdateSchema = homeSectionInputSchema
  .partial()
  .omit({ key: true });
export type HomeSectionUpdate = z.infer<typeof homeSectionUpdateSchema>;

export const homeSectionAdminSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  sectionType: homeSectionTypeSchema,
  titleTr: z.string().min(1),
  titleEn: z.string().min(1),
  categoryId: z.string().min(1).nullable(),
  categorySlug: z.string().min(1).nullable().optional(),
  contentLimit: z.number().int().min(1).max(20),
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
  /** Küratörlü items (yalnızca RAIL/HERO için dolu). */
  items: z.array(contentSummarySchema).default([]),
});
export type HomeSectionAdmin = z.infer<typeof homeSectionAdminSchema>;

export const homeSectionListResponseSchema = z.object({
  items: z.array(homeSectionAdminSchema).default([]),
});
export type HomeSectionListResponse = z.infer<
  typeof homeSectionListResponseSchema
>;

/** POST /admin/home-sections/:id/items gövdesi. */
export const homeSectionItemInputSchema = z.object({
  contentId: z.string().min(1),
});
export type HomeSectionItemInput = z.infer<typeof homeSectionItemInputSchema>;

/** Genel mutation onayı (ekle/çıkar/güncelle/sil). */
export const adminMutationResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().min(1),
});
export type AdminMutationResponse = z.infer<typeof adminMutationResponseSchema>;

// ---------------------------------------------------------------------------
// FAZ 8 — Yönetim paneli gerçek backend sözleşmeleri
// ---------------------------------------------------------------------------

/** Bölüm yaşam döngüsü durumları. */
export const adminEpisodeStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);
export type EpisodeStatus = z.infer<typeof adminEpisodeStatusSchema>;

/** Medya işleme durumu (yönetim görünümü). */
export const adminMediaStateSchema = z.enum([
  'AWAITING_UPLOAD',
  'PROCESSING',
  'READY',
  'ERROR',
]);
export type AdminMediaState = z.infer<typeof adminMediaStateSchema>;

// ------------------------- Yapım düzenleme ---------------------------------

/** PATCH /admin/titles/:id gövdesi — tüm alanlar opsiyonel (kısmi güncelleme). */
export const adminTitleUpdateSchema = z.object({
  titleTr: z.string().trim().min(1).max(200).optional(),
  titleEn: z.string().trim().min(1).max(200).optional(),
  originalTitle: z.string().trim().max(200).nullable().optional(),
  synopsisTr: z.string().trim().min(1).max(5000).optional(),
  synopsisEn: z.string().trim().min(1).max(5000).optional(),
  taglineTr: z.string().trim().max(300).nullable().optional(),
  taglineEn: z.string().trim().max(300).nullable().optional(),
  releaseYear: z.number().int().min(1890).max(2100).optional(),
  ageRating: z.string().trim().max(10).nullable().optional(),
  durationSeconds: z.number().int().min(1).max(36000).nullable().optional(),
  posterUrl: z.string().url().max(2048).nullable().optional(),
  heroImageUrl: z.string().url().max(2048).nullable().optional(),
  verticalPreviewUrl: z.string().url().max(2048).nullable().optional(),
  accessType: accessTypeSchema.optional(),
  seriesFormat: z.enum(['STANDARD', 'MINI']).nullable().optional(),
  categorySlugs: z.array(z.string().min(1)).optional(),
});
export type AdminTitleUpdate = z.infer<typeof adminTitleUpdateSchema>;

/** Bölüm medya özeti (yönetim görünümü — sağlayıcı sırları ASLA dönülmez). */
export const adminEpisodeMediaSummarySchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  state: adminMediaStateSchema,
  originalName: z.string().nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  uploadExpiresAt: z.string().nullable().optional(),
  readyAt: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
export type AdminEpisodeMediaSummary = z.infer<
  typeof adminEpisodeMediaSummarySchema
>;

/** Yönetim bölüm özeti. */
export const adminEpisodeSummarySchema = z.object({
  id: z.string().min(1),
  seasonNumber: z.number().int().min(1),
  episodeNumber: z.number().int().min(1),
  titleTr: z.string().min(1),
  titleEn: z.string().min(1),
  synopsisTr: z.string().nullable().optional(),
  synopsisEn: z.string().nullable().optional(),
  durationSeconds: z.number().int().min(0),
  accessType: accessTypeSchema,
  creditCost: z.number().int().nullable().optional(),
  status: adminEpisodeStatusSchema,
  publishedAt: z.string().nullable().optional(),
  freeUntilAt: z.string().nullable().optional(),
  verticalPreviewUrl: z.string().nullable().optional(),
  media: z.array(adminEpisodeMediaSummarySchema).default([]),
  updatedAt: z.string().min(1),
});
export type AdminEpisodeSummary = z.infer<typeof adminEpisodeSummarySchema>;

/** Yönetim sezon özeti (bölümleriyle). */
export const adminSeasonSummarySchema = z.object({
  id: z.string().min(1),
  seasonNumber: z.number().int().min(1),
  titleTr: z.string().nullable().optional(),
  titleEn: z.string().nullable().optional(),
  synopsisTr: z.string().nullable().optional(),
  synopsisEn: z.string().nullable().optional(),
  episodes: z.array(adminEpisodeSummarySchema).default([]),
});
export type AdminSeasonSummary = z.infer<typeof adminSeasonSummarySchema>;

/** GET /admin/titles/:id — tam yönetim detayı. */
export const adminTitleDetailSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  kind: contentKindSchema,
  seriesFormat: z.enum(['STANDARD', 'MINI']).nullable().optional(),
  titleTr: z.string().min(1),
  titleEn: z.string().min(1),
  originalTitle: z.string().nullable().optional(),
  synopsisTr: z.string().min(1),
  synopsisEn: z.string().min(1),
  taglineTr: z.string().nullable().optional(),
  taglineEn: z.string().nullable().optional(),
  releaseYear: z.number().int().min(1890).max(2100),
  ageRating: z.string().nullable().optional(),
  durationSeconds: z.number().int().nullable().optional(),
  posterUrl: z.string().nullable().optional(),
  heroImageUrl: z.string().nullable().optional(),
  verticalPreviewUrl: z.string().nullable().optional(),
  accessType: accessTypeSchema,
  status: contentStatusSchema,
  publishedAt: z.string().nullable().optional(),
  categories: z
    .array(
      z.object({
        id: z.string().min(1),
        slug: z.string().min(1),
        nameTr: z.string().min(1),
        nameEn: z.string().min(1),
      }),
    )
    .default([]),
  seasons: z.array(adminSeasonSummarySchema).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type AdminTitleDetail = z.infer<typeof adminTitleDetailSchema>;

// ------------------------- Sezon ve bölüm ----------------------------------

/** POST /admin/titles/:id/seasons gövdesi. */
export const adminSeasonInputSchema = z.object({
  seasonNumber: z.number().int().min(1).max(100),
  titleTr: z.string().trim().max(200).optional(),
  titleEn: z.string().trim().max(200).optional(),
  synopsisTr: z.string().trim().max(5000).optional(),
  synopsisEn: z.string().trim().max(5000).optional(),
});
export type AdminSeasonInput = z.infer<typeof adminSeasonInputSchema>;

/** PATCH /admin/seasons/:seasonId gövdesi. */
export const adminSeasonUpdateSchema = adminSeasonInputSchema
  .omit({ seasonNumber: true })
  .partial();
export type AdminSeasonUpdate = z.infer<typeof adminSeasonUpdateSchema>;

/** POST /admin/titles/:id/episodes gövdesi. */
export const adminEpisodeInputSchema = z
  .object({
    seasonNumber: z.number().int().min(1).max(100),
    episodeNumber: z.number().int().min(1).max(2000),
    titleTr: z.string().trim().min(1).max(200),
    titleEn: z.string().trim().min(1).max(200),
    synopsisTr: z.string().trim().max(5000).optional(),
    synopsisEn: z.string().trim().max(5000).optional(),
    durationSeconds: z.number().int().min(1).max(36000),
    accessType: accessTypeSchema.default('FREE'),
    /** accessType=CREDIT ise zorunlu ve > 0 (CHECK ile paralel). */
    creditCost: z.number().int().min(1).max(10000).optional(),
    verticalPreviewUrl: z.string().url().max(2048).nullable().optional(),
    freeUntilAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine(
    (v) => v.accessType !== 'CREDIT' || (v.creditCost ?? 0) > 0,
    {
      message: 'CREDIT erişiminde creditCost zorunludur ve 0’dan büyüktür',
      path: ['creditCost'],
    },
  );
export type AdminEpisodeInput = z.infer<typeof adminEpisodeInputSchema>;

/** PATCH /admin/episodes/:episodeId gövdesi. */
export const adminEpisodeUpdateSchema = z
  .object({
    seasonNumber: z.number().int().min(1).max(100).optional(),
    episodeNumber: z.number().int().min(1).max(2000).optional(),
    titleTr: z.string().trim().min(1).max(200).optional(),
    titleEn: z.string().trim().min(1).max(200).optional(),
    synopsisTr: z.string().trim().max(5000).nullable().optional(),
    synopsisEn: z.string().trim().max(5000).nullable().optional(),
    durationSeconds: z.number().int().min(1).max(36000).optional(),
    accessType: accessTypeSchema.optional(),
    creditCost: z.number().int().min(1).max(10000).nullable().optional(),
    verticalPreviewUrl: z.string().url().max(2048).nullable().optional(),
    freeUntilAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .refine(
    (v) => v.accessType !== 'CREDIT' || (v.creditCost ?? 0) > 0,
    {
      message: 'CREDIT erişiminde creditCost zorunludur ve 0’dan büyüktür',
      path: ['creditCost'],
    },
  );
export type AdminEpisodeUpdate = z.infer<typeof adminEpisodeUpdateSchema>;

/** PATCH /admin/episodes/:episodeId/status gövdesi. */
export const adminEpisodeStatusChangeSchema = z.object({
  status: adminEpisodeStatusSchema,
});
export type AdminEpisodeStatusChange = z.infer<
  typeof adminEpisodeStatusChangeSchema
>;

// ------------------------- Gelir modeli ------------------------------------

/** Abonelik planı (yönetim görünümü — ürün kimlikleriyle). */
export const adminPlanSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  titleTr: z.string().min(1),
  titleEn: z.string().min(1),
  platformProductIdIos: z.string().nullable().optional(),
  platformProductIdAndroid: z.string().nullable().optional(),
  billingPeriod: z.enum(['MONTHLY', 'YEARLY']),
  priceKurus: z.number().int().min(0),
  currency: z.string().min(3).max(3),
  trialDays: z.number().int().min(0),
  gracePeriodDays: z.number().int().min(0),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
  activeSubscriberCount: z.number().int().min(0).default(0),
});
export type AdminPlan = z.infer<typeof adminPlanSchema>;

export const adminPlanListResponseSchema = z.object({
  items: z.array(adminPlanSchema).default([]),
});
export type AdminPlanListResponse = z.infer<typeof adminPlanListResponseSchema>;

/** PATCH /admin/plans/:id — finansasel alan; ADMIN + step-up ister. */
export const adminPlanUpdateSchema = z.object({
  titleTr: z.string().trim().min(1).max(120).optional(),
  titleEn: z.string().trim().min(1).max(120).optional(),
  platformProductIdIos: z.string().trim().max(200).nullable().optional(),
  platformProductIdAndroid: z.string().trim().max(200).nullable().optional(),
  priceKurus: z.number().int().min(0).max(10000000).optional(),
  currency: z.string().trim().length(3).optional(),
  trialDays: z.number().int().min(0).max(365).optional(),
  gracePeriodDays: z.number().int().min(0).max(90).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type AdminPlanUpdate = z.infer<typeof adminPlanUpdateSchema>;

/** Kredi paketi (yönetim görünümü). */
export const adminCreditPackSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  credits: z.number().int().min(1),
  bonusCredits: z.number().int().min(0),
  platformProductIdIos: z.string().nullable().optional(),
  platformProductIdAndroid: z.string().nullable().optional(),
  priceKurus: z.number().int().min(0),
  currency: z.string().min(3).max(3),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});
export type AdminCreditPack = z.infer<typeof adminCreditPackSchema>;

export const adminCreditPackListResponseSchema = z.object({
  items: z.array(adminCreditPackSchema).default([]),
});
export type AdminCreditPackListResponse = z.infer<
  typeof adminCreditPackListResponseSchema
>;

/** PATCH /admin/credit-packs/:id — finansal alan; ADMIN + step-up ister. */
export const adminCreditPackUpdateSchema = z.object({
  platformProductIdIos: z.string().trim().max(200).nullable().optional(),
  platformProductIdAndroid: z.string().trim().max(200).nullable().optional(),
  priceKurus: z.number().int().min(0).max(10000000).optional(),
  currency: z.string().trim().length(3).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  bonusCredits: z.number().int().min(0).max(100000).optional(),
});
export type AdminCreditPackUpdate = z.infer<typeof adminCreditPackUpdateSchema>;

/** Mağaza işlemi (satın alma kaydı — yönetim görünümü). */
export const adminStoreTransactionSchema = z.object({
  id: z.string().min(1),
  userId: z.string().nullable().optional(),
  userEmail: z.string().nullable().optional(),
  platform: z.enum(['IOS', 'ANDROID']),
  productType: z.enum(['SUBSCRIPTION', 'CREDIT_PACK']),
  productId: z.string().min(1),
  storeTransactionId: z.string().min(1),
  quantity: z.number().int().min(1),
  priceKurus: z.number().int().nullable().optional(),
  currency: z.string().nullable().optional(),
  purchaseState: z.enum(['PENDING', 'PURCHASED', 'REFUNDED', 'REVOKED']),
  validatedAt: z.string().nullable().optional(),
  refundedAt: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
export type AdminStoreTransaction = z.infer<typeof adminStoreTransactionSchema>;

export const adminStoreTransactionListParamsSchema = pageRequestSchema.extend({
  userId: z.string().min(1).optional(),
  state: z.enum(['PENDING', 'PURCHASED', 'REFUNDED', 'REVOKED']).optional(),
  productType: z.enum(['SUBSCRIPTION', 'CREDIT_PACK']).optional(),
});
export type AdminStoreTransactionListParams = z.infer<
  typeof adminStoreTransactionListParamsSchema
>;

export const adminStoreTransactionListResponseSchema = z.object({
  items: z.array(adminStoreTransactionSchema).default([]),
  meta: pageMetaSchema,
});
export type AdminStoreTransactionListResponse = z.infer<
  typeof adminStoreTransactionListResponseSchema
>;

/** Kredi ledger hareketi (yönetim görünümü). */
export const adminCreditLedgerEntrySchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  userEmail: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  type: z.enum(['PURCHASE', 'GRANT', 'UNLOCK_SPEND', 'REFUND', 'ADJUSTMENT', 'EXPIRY']),
  delta: z.number().int(),
  purchasedDelta: z.number().int(),
  grantedDelta: z.number().int(),
  balanceAfterPurchased: z.number().int(),
  balanceAfterGranted: z.number().int(),
  referenceType: z.string().min(1),
  referenceId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
export type AdminCreditLedgerEntry = z.infer<
  typeof adminCreditLedgerEntrySchema
>;

export const adminCreditLedgerListParamsSchema = pageRequestSchema.extend({
  userId: z.string().min(1).optional(),
  type: z
    .enum(['PURCHASE', 'GRANT', 'UNLOCK_SPEND', 'REFUND', 'ADJUSTMENT', 'EXPIRY'])
    .optional(),
});
export type AdminCreditLedgerListParams = z.infer<
  typeof adminCreditLedgerListParamsSchema
>;

export const adminCreditLedgerListResponseSchema = z.object({
  items: z.array(adminCreditLedgerEntrySchema).default([]),
  meta: pageMetaSchema,
});
export type AdminCreditLedgerListResponse = z.infer<
  typeof adminCreditLedgerListResponseSchema
>;

// ------------------------- Kullanıcı yönetimi ------------------------------

/** GET /admin/users/:id — profil + cüzdan + abonelik + son hareketler. */
export const adminUserDetailSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(['USER', 'EDITOR', 'ADMIN']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  locale: z.string().min(1),
  emailVerified: z.boolean(),
  createdAt: z.string().min(1),
  wallet: z
    .object({
      purchased: z.number().int().min(0),
      granted: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .nullable()
    .optional(),
  subscription: z
    .object({
      id: z.string().min(1),
      planCode: z.string().min(1),
      planTitle: z.string().min(1),
      platform: z.enum(['IOS', 'ANDROID']),
      status: z.enum(['TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'ON_HOLD', 'CANCELED', 'EXPIRED']),
      autoRenew: z.boolean(),
      currentPeriodEnd: z.string().nullable().optional(),
      expiresAt: z.string().nullable().optional(),
      canceledAt: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  recentLedger: z.array(adminCreditLedgerEntrySchema).default([]),
  stats: z
    .object({
      unlockCount: z.number().int().min(0).default(0),
      favoriteCount: z.number().int().min(0).default(0),
      purchaseCount: z.number().int().min(0).default(0),
      totalSpentKurus: z.number().int().min(0).default(0),
    })
    .default({
      unlockCount: 0,
      favoriteCount: 0,
      purchaseCount: 0,
      totalSpentKurus: 0,
    }),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/** PATCH /admin/users/:id/status — ADMIN + step-up. */
export const adminUserStatusUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export type AdminUserStatusUpdate = z.infer<typeof adminUserStatusUpdateSchema>;

/** PATCH /admin/users/:id/role — ADMIN + step-up. */
export const adminUserRoleUpdateSchema = z.object({
  role: z.enum(['USER', 'EDITOR', 'ADMIN']),
});
export type AdminUserRoleUpdate = z.infer<typeof adminUserRoleUpdateSchema>;

// ------------------------- Bildirim kampanyaları ---------------------------

export const notificationCampaignStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'SENDING',
  'SENT',
  'FAILED',
  'CANCELLED',
]);
export type NotificationCampaignStatus = z.infer<
  typeof notificationCampaignStatusSchema
>;

/** POST /admin/notification-campaigns gövdesi. */
export const adminCampaignInputSchema = z.object({
  type: z.enum(['NEW_EPISODE', 'NEW_CONTENT', 'PROMO', 'SYSTEM']),
  titleTr: z.string().trim().min(1).max(120),
  titleEn: z.string().trim().min(1).max(120),
  bodyTr: z.string().trim().min(1).max(500),
  bodyEn: z.string().trim().min(1).max(500),
  dataJson: z.record(z.string(), z.unknown()).optional(),
  /** Boşsa derhal gönderilir; doluysa planlanır. */
  scheduledFor: z.string().datetime({ offset: true }).nullable().optional(),
});
export type AdminCampaignInput = z.infer<typeof adminCampaignInputSchema>;

export const adminCampaignSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['NEW_EPISODE', 'NEW_CONTENT', 'PROMO', 'SYSTEM']),
  titleTr: z.string().min(1),
  titleEn: z.string().min(1),
  bodyTr: z.string().min(1),
  bodyEn: z.string().min(1),
  status: notificationCampaignStatusSchema,
  scheduledFor: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  recipientCount: z.number().int().min(0).default(0),
  readCount: z.number().int().min(0).default(0),
  failedCount: z.number().int().min(0).default(0),
  createdById: z.string().nullable().optional(),
  createdAt: z.string().min(1),
});
export type AdminCampaign = z.infer<typeof adminCampaignSchema>;

export const adminCampaignListResponseSchema = z.object({
  items: z.array(adminCampaignSchema).default([]),
});
export type AdminCampaignListResponse = z.infer<
  typeof adminCampaignListResponseSchema
>;

// ------------------------- Dashboard ---------------------------------------

/** GET /admin/dashboard?from&to (ISO tarih; varsayılan son 30 gün). */
export const adminDashboardParamsSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
export type AdminDashboardParams = z.infer<typeof adminDashboardParamsSchema>;

export const adminDashboardSeriesPointSchema = z.object({
  day: z.string().min(1),
  signups: z.number().int().min(0),
  revenueKurus: z.number().int().min(0),
  unlocks: z.number().int().min(0),
});
export type AdminDashboardSeriesPoint = z.infer<
  typeof adminDashboardSeriesPointSchema
>;

export const adminDashboardSchema = z.object({
  range: z.object({ from: z.string().min(1), to: z.string().min(1) }),
  users: z.object({
    total: z.number().int().min(0),
    active: z.number().int().min(0),
    suspended: z.number().int().min(0),
    newInRange: z.number().int().min(0),
  }),
  subscriptions: z.object({
    active: z.number().int().min(0),
    trialing: z.number().int().min(0),
    canceled: z.number().int().min(0),
    expired: z.number().int().min(0),
    gracePeriod: z.number().int().min(0),
  }),
  catalog: z.object({
    publishedTitles: z.number().int().min(0),
    draftTitles: z.number().int().min(0),
    processingTitles: z.number().int().min(0),
    archivedTitles: z.number().int().min(0),
    totalEpisodes: z.number().int().min(0),
    publishedEpisodes: z.number().int().min(0),
  }),
  purchases: z.object({
    inRangeCount: z.number().int().min(0),
    inRangeRevenueKurus: z.number().int().min(0),
    totalCount: z.number().int().min(0),
    totalRevenueKurus: z.number().int().min(0),
    refundCount: z.number().int().min(0),
    refundedAmountKurus: z.number().int().min(0),
    subscriptionCount: z.number().int().min(0),
    creditPackCount: z.number().int().min(0),
  }),
  credits: z.object({
    grantedInRange: z.number().int().min(0),
    purchasedInRange: z.number().int().min(0),
    spentInRange: z.number().int().min(0),
    refundAdjustInRange: z.number().int().min(0),
    balancePurchased: z.number().int().min(0),
    balanceGranted: z.number().int().min(0),
  }),
  series: z.array(adminDashboardSeriesPointSchema).default([]),
  recentAudit: z
    .array(
      z.object({
        id: z.string().min(1),
        actorUserId: z.string().nullable().optional(),
        action: z.string().min(1),
        entityType: z.string().min(1),
        entityId: z.string().min(1),
        createdAt: z.string().min(1),
      }),
    )
    .default([]),
  generatedAt: z.string().min(1),
});
export type AdminDashboard = z.infer<typeof adminDashboardSchema>;

// ------------------------- Adım yukarı doğrulama ---------------------------

/** POST /auth/step-up gövdesi — kritik işlem öncesi şifre yeniden doğrulama. */
export const stepUpRequestSchema = z.object({
  password: z.string().min(1, 'Şifre zorunludur'),
});
export type StepUpRequest = z.infer<typeof stepUpRequestSchema>;

/** Step-up yanıtı: kısa ömürlü token (varsayılan 5 dk). */
export const stepUpResponseSchema = z.object({
  stepUpToken: z.string().min(10),
  expiresIn: z.number().int().positive(),
});
export type StepUpResponse = z.infer<typeof stepUpResponseSchema>;
