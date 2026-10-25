/**
 * Faz 3b sözleşme testleri — e-posta doğrulama, parola sıfırlama, oturum
 * listesi, hesap silme ve yasal metin şemaları.
 */
import { describe, expect, it } from 'vitest';
import {
  verifyEmailRequestSchema,
  resendVerificationRequestSchema,
  forgotPasswordRequestSchema,
  resetPasswordRequestSchema,
  changePasswordRequestSchema,
  authSessionListResponseSchema,
  accountDeletionResponseSchema,
  restoreAccountRequestSchema,
  legalDocumentSchema,
} from '../auth';
import { registerRequestSchema } from '../account';

describe('faz 3b kimlik sözleşmeleri', () => {
  it('verify-email anahtarı zorunlu tutar', () => {
    expect(() => verifyEmailRequestSchema.parse({ token: '1234567890' })).not.toThrow();
    expect(() => verifyEmailRequestSchema.parse({ token: '' })).toThrow();
    expect(() => verifyEmailRequestSchema.parse({})).toThrow();
  });

  it('forgot-password e-postayı normalize eder', () => {
    const parsed = forgotPasswordRequestSchema.parse({ email: '  Ayse@Ornek.COM ' });
    expect(parsed.email).toBe('ayse@ornek.com');
  });

  it('reset-password yeni parolayı sunucu politikasına tabi tutar', () => {
    expect(() =>
      resetPasswordRequestSchema.parse({ token: 'a'.repeat(20), newPassword: 'parola1234' })
    ).not.toThrow();
    expect(() =>
      resetPasswordRequestSchema.parse({ token: 'a'.repeat(20), newPassword: 'sadeceharf' })
    ).toThrow();
  });

  it('resend-verification geçersiz e-postayı reddeder', () => {
    expect(() => resendVerificationRequestSchema.parse({ email: 'gecersiz' })).toThrow();
  });

  it('change-password mevcut parolayı zorunlu tutar', () => {
    expect(() =>
      changePasswordRequestSchema.parse({ currentPassword: '', newPassword: 'parola1234' })
    ).toThrow();
  });

  it('oturum listesi current bayrağıyla ayrışır', () => {
    const parsed = authSessionListResponseSchema.parse({
      items: [
        {
          id: 'sess_1',
          userAgent: 'iPhone 15 (App/1.0)',
          createdAt: '2026-10-26T10:00:00Z',
          expiresAt: '2026-11-25T10:00:00Z',
          current: true,
        },
      ],
    });
    expect(parsed.items[0]!.current).toBe(true);
  });

  it('account-deletion purgeAt + email taşır', () => {
    const parsed = accountDeletionResponseSchema.parse({
      purgeAt: '2026-11-25T10:00:00Z',
      email: 'ayse@ornek.com',
    });
    expect(parsed.purgeAt).toContain('2026-11-25');
  });

  it('restore hesabı e-posta + parola ister', () => {
    expect(() =>
      restoreAccountRequestSchema.parse({ email: 'a@b.co', password: 'x' })
    ).not.toThrow();
    expect(() => restoreAccountRequestSchema.parse({ email: 'a@b.co' })).toThrow();
  });

  it('yasal metin yalnızca terms/privacy olabilir', () => {
    const doc = legalDocumentSchema.parse({
      slug: 'privacy',
      title: 'Gizlilik',
      version: '1.0',
      updatedAt: '2026-10-26',
      content: '# Başlık',
    });
    expect(doc.slug).toBe('privacy');
    expect(() =>
      legalDocumentSchema.parse({ slug: 'kvkk', title: 'x', version: '1', updatedAt: 'x', content: 'x' })
    ).toThrow();
  });

  it('kayıt isteği varsayılan locale ile ayrışır; koşul kabulü zorunludur', () => {
    const parsed = registerRequestSchema.parse({
      displayName: 'Ayşe',
      email: 'ayse@ornek.com',
      password: 'parola1234',
      acceptTerms: true,
    });
    expect(parsed.locale).toBe('tr');
    expect(() =>
      registerRequestSchema.parse({
        displayName: 'Ayşe',
        email: 'ayse@ornek.com',
        password: 'parola1234',
      })
    ).toThrow();
  });
});
