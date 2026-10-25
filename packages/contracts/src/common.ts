/**
 * PerdeGo API genel sözleşmeleri: zarf (envelope), hata kodları ve sayfalama.
 *
 * Tüm REST yanıtları bu zarfı kullanır. İstemciler (mobile, admin) başarılı
 * yanıtta `data`, hatalı yanıtta `error` alanını okur.
 */
import { z } from 'zod';

/** API hata kodları. Sunucu, istemcinin anlayabileceği makine kodu döner. */
export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYMENT_REQUIRED',
  'RATE_LIMITED',
  'INTERNAL',
  'SERVICE_UNAVAILABLE',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  /** Kullanıcıya gösterilebilir, istemci yerel ayarına çevrilebilir mesaj anahtarı. */
  message: z.string().min(1),
  /** İsteğe bağlı makine okunabilir detay (örn. doğrulama alan hataları). */
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Başarılı zarf. */
export interface ApiSuccessEnvelope<TData> {
  ok: true;
  data: TData;
}

/** Hatalı zarf. */
export interface ApiFailureEnvelope {
  ok: false;
  error: ApiError;
}

export type ApiEnvelope<TData> = ApiSuccessEnvelope<TData> | ApiFailureEnvelope;

/** Sayfalama isteği (sorgu parametresi sözleşmesi). */
export const pageRequestSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type PageRequest = z.infer<typeof pageRequestSchema>;

/** Sayfalama üst verisi; her listeli yanıtta `meta` alanında döner. */
export const pageMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasNextPage: z.boolean(),
});

export type PageMeta = z.infer<typeof pageMetaSchema>;
