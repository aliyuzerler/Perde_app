/**
 * Kullanıcı sözleşmeleri (Faz 1: yalnızca herkese açık profil).
 * Kimlik doğrulama, abonelik ve yetkilendirme sözleşmeleri sırasıyla
 * Faz 3 ve Faz 5'te bu modüle eklenecektir.
 */
import { z } from 'zod';

/** Desteklenen arayüz dilleri (bkz. Genel Kural 6). */
export const supportedLocaleSchema = z.enum(['tr', 'en']);
export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;

/** Herkese açık profil görünümü. */
export const publicUserProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(60),
  /** Gizlilik gereği maskelenmiş e-posta (örn. "a***@ornek.com"). */
  maskedEmail: z.string().min(3).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  preferredLocale: supportedLocaleSchema.default('tr'),
  /** Üyeliğin başlangıç tarihi (ISO-8601). */
  joinedAt: z.string().min(1),
});
export type PublicUserProfile = z.infer<typeof publicUserProfileSchema>;
