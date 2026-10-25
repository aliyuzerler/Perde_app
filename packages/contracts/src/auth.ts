/**
 * Kimlik doğrulama sözleşmeleri (Faz 2b sunucu tarafı).
 *
 * Sunucu doğrulama kuralları API_CONTRACT.md §2 ile birebirdir: şifre en az
 * 8 karakter, en az 1 harf + 1 rakam. account.ts içindeki Faz 3 UI şemaları
 * geriye dönük uyumluluk için korunur; yeni istemciler bu modülü kullanır.
 */
import { z } from 'zod';
import { supportedLocaleSchema } from './user';

export const emailFieldSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email('Geçerli bir e-posta adresi girin');

/** Şifre politikası: min 8, en az 1 harf + 1 rakam (API_CONTRACT §2). */
export const passwordFieldSchema = z
  .string()
  .min(8, 'Şifre en az 8 karakter olmalıdır')
  .max(72, 'Şifre en fazla 72 karakter olabilir')
  .regex(/[a-zA-ZçğıöşüÇĞİÖŞÜ]/, 'Şifre en az bir harf içermelidir')
  .regex(/[0-9]/, 'Şifre en az bir rakam içermelidir');

/** Kayıt isteği. */
export const authRegisterRequestSchema = z.object({
  displayName: z.string().trim().min(2, 'Ad en az 2 karakter olmalıdır').max(60),
  email: emailFieldSchema,
  password: passwordFieldSchema,
  locale: supportedLocaleSchema.default('tr'),
  /** UI sözleşmesiyle uyumluluk: sunucuda zorunlu değil, kabul edilir. */
  acceptTerms: z.literal(true).optional(),
});
export type AuthRegisterRequest = z.infer<typeof authRegisterRequestSchema>;

/** Giriş isteği (girişte üretim politikası uygulanmaz; yalnızca doluluk). */
export const authLoginRequestSchema = z.object({
  email: emailFieldSchema,
  password: z.string().min(1, 'Şifre zorunludur'),
});
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;

/** Token çifti. accessToken 15 dk (RS256 JWT); refreshToken 30 gün opak. */
export const authTokensSchema = z.object({
  accessToken: z.string().min(10),
  refreshToken: z.string().min(10),
  /** Access token ömrü (saniye). */
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

/** Oturum kullanıcısı (giriş/kayıt/refresh yanıtlarında döner). */
export const authUserSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  email: emailFieldSchema,
  locale: supportedLocaleSchema,
  role: z.enum(['USER', 'EDITOR', 'ADMIN']),
  joinedAt: z.string().min(1),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** Kayıt/giriş yanıtı. */
export const authSessionResponseSchema = z.object({
  user: authUserSchema,
  tokens: authTokensSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

/** Refresh isteği: opak refresh token gövdede taşınır. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** Profil güncelleme (PATCH /me). */
export const updateProfileRequestSchema = z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  locale: supportedLocaleSchema.optional(),
  avatarUrl: z.string().url().nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
