/**
 * Sunucu hatalarını anlaşılır Türkçe mesajlara çevirir (Teknik Kural 8).
 * Öncelik sırası: alan nedeni (details.reason) → hata kodu → genel mesaj.
 * Ekranlar `useDescribeApiError()` dönen fonksiyon dışında sunucu hatası görmez.
 */
import { useCallback } from 'react';
import { useT } from '@/i18n';
import type { ApiClientError } from '@/services/api-client';

/** Ekranlar bu hook'un döndürdüğü fonksiyonu kullanır. */
export function useDescribeApiError(): (error: unknown) => string {
  const t = useT();
  return useCallback(
    (error: unknown): string => {
      const err = error as ApiClientError | undefined;
      if (!err || typeof err !== 'object' || !('kind' in err)) {
        return t('auth.errorGeneric');
      }

      if (err.isNetworkFailure) {
        return t('auth.errorNetwork');
      }

      switch (err.reason) {
        case 'EMAIL_NOT_VERIFIED':
          return t('auth.errorEmailNotVerified');
        case 'RATE_LIMIT_EXCEEDED':
          return t('auth.errorRateLimited');
        case 'WRONG_PASSWORD':
          return t('auth.errorWrongPassword');
        case 'EMAIL_ALREADY_EXISTS':
          return t('auth.registerConflict');
        default:
          break;
      }

      switch (err.code) {
        case 'UNAUTHORIZED':
          return t('auth.loginFailed');
        case 'CONFLICT':
          return t('auth.registerConflict');
        case 'RATE_LIMITED':
          return t('auth.errorRateLimited');
        default:
          return t('auth.errorGeneric');
      }
    },
    [t]
  );
}

/** Kayıt/giriş şifre politikası (sunucu sözleşmesiyle aynı: 8+, harf+rakam). */
export const PASSWORD_POLICY_RE = /^(?=.*[a-zA-ZçğıöşüÇĞİÖŞÜ])(?=.*\d).+$/;
