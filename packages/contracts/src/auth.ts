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
  /** E-posta doğrulama durumu — doğrulanmamış hesapta giriş 403 döner. */
  emailVerified: z.boolean(),
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

// ---------------------------------------------------------------------------
// Faz 3b: e-posta doğrulama, parola sıfırlama, oturumlar, yasal metinler.
// ---------------------------------------------------------------------------

/** E-posta doğrulama (POST /auth/verify-email). */
export const verifyEmailRequestSchema = z.object({
  token: z.string().min(10, 'Doğrulama anahtarı geçersiz'),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** Doğrulama e-postasını yeniden gönder (POST /auth/resend-verification). */
export const resendVerificationRequestSchema = z.object({
  email: emailFieldSchema,
});
export type ResendVerificationRequest = z.infer<typeof resendVerificationRequestSchema>;

/** Parola sıfırlama talebi (POST /auth/forgot-password) — sayım engeli için
 * yanıt daima olumlu; e-posta hesap varsa gönderilir. */
export const forgotPasswordRequestSchema = z.object({
  email: emailFieldSchema,
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/** Parola sıfırlama (POST /auth/reset-password) — tüm oturumlar iptal edilir. */
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(10, 'Sıfırlama anahtarı geçersiz'),
  newPassword: passwordFieldSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/** Parola değiştirme (POST /auth/change-password) — diğer oturumlar iptal. */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut parola zorunludur'),
  newPassword: passwordFieldSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Aktif oturum listesi kaydı (GET /auth/sessions). */
export const authSessionInfoSchema = z.object({
  id: z.string().min(1),
  userAgent: z.string().nullable(),
  createdAt: z.string().min(1),
  expiresAt: z.string().min(1),
  /** Bu listeleme isteğini taşıyan oturum mu? */
  current: z.boolean(),
});
export type AuthSessionInfo = z.infer<typeof authSessionInfoSchema>;

export const authSessionListResponseSchema = z.object({
  items: z.array(authSessionInfoSchema).default([]),
});
export type AuthSessionListResponse = z.infer<typeof authSessionListResponseSchema>;

/** Hesap silme talebi yanıtı (POST /account/delete-request). */
export const accountDeletionResponseSchema = z.object({
  /** Kişisel verilerin kalıcı silineceği tarih (nefalet süresi sonu). */
  purgeAt: z.string().min(1),
  /** Süre içinde geri almak için gereken e-posta. */
  email: emailFieldSchema,
});
export type AccountDeletionResponse = z.infer<typeof accountDeletionResponseSchema>;

/** Hesap geri alma (POST /account/restore) — nefallet süresi içinde. */
export const restoreAccountRequestSchema = z.object({
  email: emailFieldSchema,
  password: z.string().min(1, 'Parola zorunludur'),
});
export type RestoreAccountRequest = z.infer<typeof restoreAccountRequestSchema>;

/** Yasal metin yanıtı (GET /legal/terms | /legal/privacy). */
export const legalDocumentSchema = z.object({
  slug: z.enum(['terms', 'privacy']),
  title: z.string().min(1),
  version: z.string().min(1),
  updatedAt: z.string().min(1),
  /** Türkçe Markdown gövde. */
  content: z.string().min(1),
});
export type LegalDocument = z.infer<typeof legalDocumentSchema>;
