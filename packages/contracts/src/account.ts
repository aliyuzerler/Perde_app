/**
 * Hesap ve kimlik doğrulama sözleşmeleri (Faz 3 UI mock; gerçek uçlar Faz 3
 * sunucu tarafında SECURITY.md'deki argon2id + JWT tasarımıyla devreye girer).
 */
import { z } from 'zod';
import { contentSummarySchema } from './content';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Geçerli bir e-posta adresi girin');

/** Giriş isteği. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Kayıt isteği. */
export const registerRequestSchema = loginRequestSchema.extend({
  displayName: z.string().trim().min(2, 'Ad en az 2 karakter olmalıdır').max(50),
  acceptTerms: z.literal(true, { error: 'Kullanım koşulları kabul edilmelidir' }),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** Oturum bilgisi. Gerçek API'de access/refresh token çifti eklenir. */
export const authSessionSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    email: emailSchema,
    joinedAt: z.string().min(1),
  }),
  /** Mock oturum işareti; gerçek token Faz 3'te gelir. */
  sessionToken: z.string().min(1),
});
export type AuthSession = z.infer<typeof authSessionSchema>;

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
});
export type CategoryDetailResponse = z.infer<typeof categoryDetailResponseSchema>;
