/**
 * Ortak TanStack Query yeniden deneme politikası (Faz 2c).
 *
 * Kural: ağ hataları (uçak modu / sunucu erişilemez) kısa bir gecikmeyle en
 * fazla 2 kez denenir; istemci hataları (404 NOT_FOUND, 400 doğrulama,
 * 401/403 yetki) yeniden denenmez — bilinen sonucun tekrarı anlamına gelir.
 * Ekranlar ayrıca kalıcı hatada kullanıcıya "Tekrar Dene" düğmesi verir
 * (ErrorView); otomatik retry yalnızca geçici hatalar içindir.
 */
import { ApiClientError } from '@/services/api-client';

const MAX_NETWORK_RETRIES = 2;

export function catalogRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiClientError) {
    if (error.isNetworkFailure) return failureCount < MAX_NETWORK_RETRIES;
    return false;
  }
  // Beklenmeyen hatalar (kodlama hatası) — tek deneme yeterli.
  return false;
}

/** Ağ hatalarında lineer gecikme: 600ms, 1200ms. */
export function catalogRetryDelay(attemptIndex: number): number {
  return Math.min(1000, 600 * Math.max(0, attemptIndex));
}
