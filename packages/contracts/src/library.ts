/**
 * İzleme ilerlemesi ve favoriler (watchlist) sözleşmeleri (Faz 2b).
 */
import { z } from 'zod';
import { contentSummarySchema } from './content';

/** PUT /api/v1/watch-progress/:episodeId gövdesi. */
export const watchProgressPutSchema = z.object({
  positionSeconds: z.number().int().min(0),
  completed: z.boolean().optional(),
});
export type WatchProgressPut = z.infer<typeof watchProgressPutSchema>;

/** Tek ilerleme kaydı. */
export const watchProgressItemSchema = z.object({
  episodeId: z.string().min(1),
  contentId: z.string().min(1),
  contentSlug: z.string().min(1),
  contentTitle: z.string().min(1),
  episodeTitle: z.string().min(1),
  seasonNumber: z.number().int().min(1),
  episodeNumber: z.number().int().min(1),
  positionSeconds: z.number().int().min(0),
  durationSeconds: z.number().int().min(1),
  completed: z.boolean(),
  lastWatchedAt: z.string().min(1),
  posterUrl: z.string().url().nullable().optional(),
});
export type WatchProgressItem = z.infer<typeof watchProgressItemSchema>;

/** GET /api/v1/watch-progress yanıtı (devam et rayı). */
export const watchProgressListResponseSchema = z.object({
  items: z.array(watchProgressItemSchema).default([]),
});
export type WatchProgressListResponse = z.infer<
  typeof watchProgressListResponseSchema
>;

/** Favoriler yanıtı. */
export const favoritesListResponseSchema = z.object({
  items: z.array(contentSummarySchema).default([]),
});
export type FavoritesListResponse = z.infer<typeof favoritesListResponseSchema>;

/** Favori ekleme yanıtı (idempotent). */
export const favoriteMutationResponseSchema = z.object({
  contentId: z.string().min(1),
  favorited: z.boolean(),
  alreadyFavorited: z.boolean(),
});
export type FavoriteMutationResponse = z.infer<
  typeof favoriteMutationResponseSchema
>;
