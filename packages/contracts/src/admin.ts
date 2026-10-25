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
import { contentKindSchema, contentSummarySchema } from './content';

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
