/**
 * Medya (video akışı) sözleşmeleri — FAZ 4.
 *
 * Tasarım kuralları:
 *  - Oynatma oturumu KISA ÖMÜRLÜDÜR: playbackUrl/sources imzalıdır ve
 *    expiresAt'ta sona erer; kalıcı public video URL'i sözleşmede YOKTUR.
 *  - `sources.hls` (native/ABR) ve `sources.mp4` (web/ilerleyici yedek)
 *    sağlayıcının yeteneğine göre doludur; istemci platforma göre seçer.
 *  - Altyazılar (textTracks) oturum imzalı URL'lerle döner.
 *  - Yükleme anahtarı (ticket) sürelidir (varsayılan 15 dk) ve tek dosyaya
 *    aittir; istemci dosyayı DOĞRUDAN sağlayıcıya yükler (backend gövdesinden
 *    taşımaz).
 */
import { z } from 'zod';

/** Medya sağlayıcı adı (prisma MediaProvider ile aynı küme). */
export const mediaProviderNameSchema = z.enum(['LOCAL', 'BUNNY', 'CLOUDFLARE', 'MUX']);
export type MediaProviderName = z.infer<typeof mediaProviderNameSchema>;

/** Medya işleme durumu. */
export const mediaStateSchema = z.enum(['AWAITING_UPLOAD', 'PROCESSING', 'READY', 'ERROR']);
export type MediaStateName = z.infer<typeof mediaStateSchema>;

/** Altyazı/olana parçası (oturum imzalı URL ile). */
export const mediaTextTrackSchema = z.object({
  language: z.string().min(2).max(8),
  label: z.string().min(1).max(40),
  url: z.string().url(),
  isDefault: z.boolean().default(false),
});
export type MediaTextTrack = z.infer<typeof mediaTextTrackSchema>;

/** Oynatma kaynakları — sağlayıcı yeteneğine göre kısmi. */
export const playbackSourcesSchema = z.object({
  hls: z.string().url().optional(),
  mp4: z.string().url().optional(),
});
export type PlaybackSources = z.infer<typeof playbackSourcesSchema>;

/** POST /media/playback/:episodeId/session yanıtı (FAZ 4 genişletilmiş). */
export const playbackSessionSchema = z.object({
  episodeId: z.string().min(1),
  provider: mediaProviderNameSchema,
  /** HLS manifest (varsa) — geriye dönük uyumluluk için ana alan. */
  playbackUrl: z.string().url(),
  sources: playbackSourcesSchema,
  expiresAt: z.string().min(1),
  positionSeconds: z.number().int().min(0),
  /** Sunucunun duyurduğu kalite merdiveni (örn. 240p/360p/540p). */
  quality: z.array(z.string().min(2).max(10)),
  guest: z.boolean(),
  textTracks: z.array(mediaTextTrackSchema).default([]),
});
export type PlaybackSession = z.infer<typeof playbackSessionSchema>;

/**
 * POST /admin/episodes/:episodeId/media/upload-url yanıtı.
 * uploadUrl SAĞLAYICIYA doğrudan yükleme içindir (local modda API'nin imzalı
 * yükleme ucudur); method=PUT, gövde ham dosya baytlarıdır.
 */
export const mediaUploadTicketSchema = z.object({
  mediaId: z.string().min(1),
  provider: mediaProviderNameSchema,
  uploadUrl: z.string().url(),
  method: z.literal('PUT'),
  /** Yükleme isteğine eklenecek başlıklar (örn. Content-Type). */
  headers: z.record(z.string(), z.string()).default({}),
  maxSizeBytes: z.number().int().positive(),
  expiresAt: z.string().min(1),
});
export type MediaUploadTicket = z.infer<typeof mediaUploadTicketSchema>;

/** POST /admin/episodes/:episodeId/media/upload-url gövdesi. */
export const mediaUploadUrlRequestSchema = z.object({
  originalName: z.string().trim().min(1).max(200).optional(),
  /** Beklenen içerik türü; boşsa dosya sihirli baytlarından anlaşılır. */
  contentType: z
    .string()
    .trim()
    .regex(/^[\w.+-]+\/[\w.+-]+$/, 'geçerli bir MIME türü olmalıdır')
    .max(100)
    .optional(),
});
export type MediaUploadUrlRequest = z.infer<typeof mediaUploadUrlRequestSchema>;

/** GET /admin/media/:mediaId yanıtı (işleme durumu takibi). */
export const mediaStatusSchema = z.object({
  mediaId: z.string().min(1),
  episodeId: z.string().min(1),
  provider: mediaProviderNameSchema,
  state: mediaStateSchema,
  durationSeconds: z.number().int().min(0).nullable().optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  originalName: z.string().nullable().optional(),
  /** Oynatma için hazır mı (READY + yayın davranışı sağlayıcıya göre). */
  playbackReady: z.boolean(),
  textTracks: z
    .array(
      z.object({
        language: z.string().min(2).max(8),
        label: z.string().min(1).max(40),
        isDefault: z.boolean().default(false),
      })
    )
    .default([]),
  updatedAt: z.string().min(1),
});
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

/** GET /admin/episodes/:episodeId/media yanıtı. */
export const mediaListSchema = z.object({
  items: z.array(mediaStatusSchema).default([]),
});
export type MediaList = z.infer<typeof mediaListSchema>;
