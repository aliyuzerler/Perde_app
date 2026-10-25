/**
 * Geliştirme profili hook'u (YALNIZCA DEV).
 *
 * Faz 3'te gerçek `GET /me` uçları ve auth store geldiğinde bu hook
 * kaldırılacaktır. Ekranlar doğrudan mock veriye erişmez; buradan geçer.
 * Üretimde çağrılması hatadır (Genel Kural 8).
 */
import { mockProfile } from '@/services/mock/mock-data';
import type { PublicUserProfile } from '@perdego/contracts';

export function useDevProfile(): PublicUserProfile | null {
  if (!__DEV__) {
    return null;
  }
  return mockProfile;
}
