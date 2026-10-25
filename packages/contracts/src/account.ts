/**
 * Hesap ve kimlik doğrulama sözleşmeleri (Faz 3b: gerçek sunucu akışı).
 *
 * Mobil oturum tipi sunucunun AuthSessionResponse'u ile birebir aynıdır:
 * access/refresh token çifti auth.ts'te tanımlıdır ve buradan kullanılır.
 */
import { z } from 'zod';
import { pageMetaSchema } from './common';
import { contentSummarySchema } from './content';
import {
  authSessionResponseSchema,
  emailFieldSchema,
  passwordFieldSchema,
} from './auth';

export const emailSchema = emailFieldSchema;

/** Giriş isteği — sunucu sözleşmesiyle tek kaynak (8+ karakter, harf+rakam). */
export const loginRequestSchema = z.object({
  email: emailFieldSchema,
  password: z.string().min(1, 'Şifre zorunludur'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Kayıt isteği. */
export const registerRequestSchema = z.object({
  displayName: z.string().trim().min(2, 'Ad en az 2 karakter olmalıdır').max(60),
  email: emailFieldSchema,
  password: passwordFieldSchema,
  acceptTerms: z.literal(true, { error: 'Kullanım koşulları kabul edilmelidir' }),
  locale: z.enum(['tr', 'en']).default('tr'),
});
export type RegisterRequest = z.input<typeof registerRequestSchema>;

/**
 * Oturum bilgisi — sunucu yanıtıyla aynı: kullanıcı + token çifti.
 * (Eski mock `sessionToken` alanı Faz 3b ile kaldırıldı; gerçek API'de
 * refresh rotasyonu için refresh token zorunludur.)
 */
export const authSessionSchema = authSessionResponseSchema;
export type AuthSession = z.infer<typeof authSessionSchema>;

/** Parola değiştirme isteği (mobil UI). */
export const changePasswordUiRequestSchema = z.object({
  currentPassword: z.string().min(1, 'Mevcut parola zorunludur'),
  newPassword: passwordFieldSchema,
});
export type ChangePasswordUiRequest = z.infer<typeof changePasswordUiRequestSchema>;

/** Hesap silme talebi (mobil UI) — parola teyidi zorunlu. */
export const deleteAccountUiRequestSchema = z.object({
  password: z.string().min(1, 'Onay için parola zorunludur'),
});
export type DeleteAccountUiRequest = z.infer<typeof deleteAccountUiRequestSchema>;

/** Kategori sözleşmeleri — keşfet/katalog alanı. */
export const categorySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  contentCount: z.number().int().min(0),
});
export type Category = z.infer<typeof categorySchema>;

export const categoryListResponseSchema = z.object({
  items: z.array(categorySchema).default([]),
});
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;

export const categoryDetailResponseSchema = z.object({
  category: categorySchema,
  items: z.array(contentSummarySchema).default([]),
  /** Faz 2c: sayfalama meta (GET /catalog/categories/:slug/titles?page=…). */
  meta: pageMetaSchema.optional(),
});
export type CategoryDetailResponse = z.infer<typeof categoryDetailResponseSchema>;
