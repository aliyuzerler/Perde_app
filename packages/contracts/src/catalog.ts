/**
 * Katalog listeleme/detay ve ana sayfa sözleşmeleri (Faz 2b).
 *
 * content.ts içindeki temel şemaları GENİŞLETİR (breaking değişiklik yok —
 * API_CONTRACT §11). Sunucu yanıt URL'leri mutlaktır (placeholder'lar API
 * üzerinden servis edilir).
 */
import { z } from 'zod';
import { pageMetaSchema, pageRequestSchema } from './common';
import {
  accessTypeSchema,
  contentKindSchema,
  contentSummarySchema,
  contentSchema,
  episodeSchema,
  feedSectionSchema,
} from './content';

/** Ana sayfa banner'ı (16:9 görsel). */
export const bannerSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageUrl: z.string().url(),
  /** Banner tıklanınca gidilecek içerik slug'ı. */
  targetContentSlug: z.string().min(1).nullable().optional(),
  deepLink: z.string().min(1).nullable().optional(),
});
export type Banner = z.infer<typeof bannerSchema>;

/** GET /api/v1/home yanıtı: banner'lar + bölüm rayları (feedResponse uyumlu). */
export const homeResponseSchema = z.object({
  banners: z.array(bannerSchema).default([]),
  sections: z.array(feedSectionSchema).default([]),
});
export type HomeResponse = z.infer<typeof homeResponseSchema>;

/** GET /api/v1/catalog/titles filtreleri (tümü opsiyonel). */
export const titleListParamsSchema = pageRequestSchema.extend({
  kind: contentKindSchema.optional(),
  accessType: accessTypeSchema.optional(),
  /** Kategori slug'ı ile filtre. */
  category: z.string().min(1).max(80).optional(),
  /** newest (varsayılan) | oldest | title */
  sort: z.enum(['newest', 'oldest', 'title']).default('newest'),
});
export type TitleListParams = z.infer<typeof titleListParamsSchema>;

/** Sayfalı içerik listesi yanıtı. */
export const titleListResponseSchema = z.object({
  items: z.array(contentSummarySchema).default([]),
  meta: pageMetaSchema,
});
export type TitleListResponse = z.infer<typeof titleListResponseSchema>;

/** Bölüm erişim kararı — sunucu tarafı (BR-07; API_CONTRACT §3). */
export const episodeAccessReasonSchema = z.enum([
  'FREE',
  'SUBSCRIPTION_ACTIVE',
  'NEEDS_SUBSCRIPTION',
  'NEEDS_CREDITS',
  'UNLOCKED',
  'SCHEDULED',
  'AGE_RESTRICTED',
]);
export type EpisodeAccessReason = z.infer<typeof episodeAccessReasonSchema>;

export const episodeAccessSchema = z.object({
  canPlay: z.boolean(),
  reason: episodeAccessReasonSchema,
  unlockedAt: z.string().nullable().optional(),
});
export type EpisodeAccess = z.infer<typeof episodeAccessSchema>;

/** Bölüm satırı (detay sayfası): temel episode + erişim kararı + kredi. */
export const catalogEpisodeSchema = episodeSchema.extend({
  creditCost: z.number().int().min(1).nullable().optional(),
  access: episodeAccessSchema.optional(),
});
export type CatalogEpisode = z.infer<typeof catalogEpisodeSchema>;

/** Sezon + bölümleri (catalogEpisode ile). */
export const catalogSeasonSchema = z.object({
  id: z.string().min(1),
  seasonNumber: z.number().int().min(1),
  title: z.string().min(1).optional(),
  episodes: z.array(catalogEpisodeSchema).default([]),
});
export type CatalogSeason = z.infer<typeof catalogSeasonSchema>;

/** GET /api/v1/catalog/titles/:slug yanıtı: contentSchema + erişimli bölümler.
 * contentSchema zaten seasons[] taşır; bu şema erişim kararı içeren
 * sezonları ayrıca verir (additive alan: accessSeasons). */
export const titleDetailResponseSchema = contentSchema.extend({
  accessSeasons: z.array(catalogSeasonSchema).default([]),
});
export type TitleDetailResponse = z.infer<typeof titleDetailResponseSchema>;

/** GET /api/v1/catalog/episodes/:id yanıtı. */
export const episodeDetailResponseSchema = catalogEpisodeSchema.extend({
  content: contentSummarySchema,
});
export type EpisodeDetailResponse = z.infer<typeof episodeDetailResponseSchema>;
