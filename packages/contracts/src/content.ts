/**
 * İçerik alanı (content domain) sözleşmeleri.
 *
 * Not: Tarih alanları ISO-8601 metni olarak taşınır (örn. "2026-10-25T00:00:00Z").
 * Poster görseli 2:3, dikey önizleme 9:16, hero görseli 16:9 en-boy oranına
 * sahiptir; istemciler bu oranları bozmadan göstermekle yükümlüdür.
 */
import { z } from 'zod';
import { pageMetaSchema } from './common';

/** İçerik türü. */
export const contentKindSchema = z.enum(['FILM', 'SERIES', 'SHORT_FILM']);
export type ContentKind = z.infer<typeof contentKindSchema>;

/** Erişim türü. Kilit kararı sunucuda verilir (bkz. Genel Kural 10). */
export const accessTypeSchema = z.enum(['FREE', 'SUBSCRIPTION', 'CREDIT']);
export type AccessType = z.infer<typeof accessTypeSchema>;

/** Oyuncu/kadro üyesi. */
export const castMemberSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1),
  role: z.enum(['ACTOR', 'DIRECTOR', 'WRITER']),
  /** Canlandırdığı karakter (yalnızca oyuncular için). */
  characterName: z.string().min(1).optional(),
});
export type CastMember = z.infer<typeof castMemberSchema>;

/** Tek bölüm. */
export const episodeSchema = z.object({
  id: z.string().min(1),
  seasonNumber: z.number().int().min(1),
  episodeNumber: z.number().int().min(1),
  title: z.string().min(1),
  synopsis: z.string().optional(),
  /** Saniye cinsinden süre. */
  durationSeconds: z.number().int().min(1),
  /** 9:16 dikey önizleme görseli. */
  verticalPreviewUrl: z.string().url().nullable().optional(),
  accessType: accessTypeSchema,
});
export type Episode = z.infer<typeof episodeSchema>;

/** Sezon ve bölümleri. */
export const seasonSchema = z.object({
  id: z.string().min(1),
  seasonNumber: z.number().int().min(1),
  title: z.string().min(1).optional(),
  episodes: z.array(episodeSchema).min(1),
});
export type Season = z.infer<typeof seasonSchema>;

/** İçerik detayı (film, dizi veya kısa film). */
export const contentSchema = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug kebab-case olmalı'),
  kind: contentKindSchema,
  title: z.string().min(1),
  originalTitle: z.string().min(1).optional(),
  synopsis: z.string().min(1),
  tagline: z.string().min(1).optional(),
  releaseYear: z.number().int().min(1890).max(2100),
  /** Yaş sınırı etiketi (örn. "7+", "13+", "16+", "18+"). */
  ageRating: z.string().min(1).optional(),
  /** Saniye cinsinden toplam süre (yalnızca FILM ve SHORT_FILM için). */
  durationSeconds: z.number().int().min(1).optional(),
  /** Tür etiket slug'ları (görüntüleme metni istemcide yerelleştirilir). */
  genres: z.array(z.string().min(1)).default([]),
  cast: z.array(castMemberSchema).default([]),
  /** 2:3 afiş görseli. Mock veride null olabilir; istemci placeholder gösterir. */
  posterUrl: z.string().url().nullable().optional(),
  /** 16:9 hero görseli. */
  heroImageUrl: z.string().url().nullable().optional(),
  /** 9:16 dikey önizleme görseli. */
  verticalPreviewUrl: z.string().url().nullable().optional(),
  accessType: accessTypeSchema,
  /** Yalnızca SERIES için dolu. */
  seasons: z.array(seasonSchema).default([]),
  /** Yeni eklenen içerik vurgusu ("Yeni" rozeti). */
  isNew: z.boolean().default(false),
});
export type Content = z.infer<typeof contentSchema>;

/** Feed ve listelerde kullanılan hafif içerik özeti. */
export const contentSummarySchema = z.object({
  contentId: z.string().min(1),
  slug: z.string().min(1),
  kind: contentKindSchema,
  title: z.string().min(1),
  releaseYear: z.number().int().min(1890).max(2100),
  ageRating: z.string().min(1).optional(),
  genres: z.array(z.string().min(1)).default([]),
  posterUrl: z.string().url().nullable().optional(),
  verticalPreviewUrl: z.string().url().nullable().optional(),
  accessType: accessTypeSchema,
  isNew: z.boolean().default(false),
});
export type ContentSummary = z.infer<typeof contentSummarySchema>;

/** Feed bölüm yerleşimi. */
export const feedSectionLayoutSchema = z.enum(['HERO', 'RAIL', 'GRID']);
export type FeedSectionLayout = z.infer<typeof feedSectionLayoutSchema>;

/** Ana sayfa (Keşfet) bölümü. */
export const feedSectionSchema = z.object({
  id: z.string().min(1),
  /** Bölüm başlığı; sunucu yerelleştirilmiş metin döner. */
  title: z.string().min(1),
  layout: feedSectionLayoutSchema,
  items: z.array(contentSummarySchema).min(1),
});
export type FeedSection = z.infer<typeof feedSectionSchema>;

/** Keşfet akışı yanıtı. */
export const feedResponseSchema = z.object({
  sections: z.array(feedSectionSchema).default([]),
});
export type FeedResponse = z.infer<typeof feedResponseSchema>;

/** Arama isteği sözleşmesi (Faz 2c: tür/kategori filtreleri eklenebilir). */
export const searchParamsSchema = z.object({
  query: z.string().trim().min(1).max(80),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  /** İçerik türü filtresi (opsiyonel). */
  kind: contentKindSchema.optional(),
  /** Kategori slug'ı filtresi (opsiyonel). */
  category: z.string().trim().min(1).max(80).optional(),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;

/** Arama yanıtı: sayfalı içerik özetleri. */
export const searchResponseSchema = z.object({
  items: z.array(contentSummarySchema).default([]),
  meta: pageMetaSchema,
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
