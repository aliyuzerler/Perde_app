/**
 * Oturum guard'ı — api-client refresh reddi (onSessionExpired olayı) ile kök
 * layout'un güvenli yönlendirmesi arasındaki tek seferlik köprü.
 *
 * Neden gerekli: refresh reddi sırasında birden çok eşzamanlı istek aynı
 * olayı tetikleyebilir; yönlendirme bir kez yapılmalıdır. Guard ilk olayı
 * alır, kalanını yok sayar; dispose() ile temizlenir.
 */
import { onSessionExpired } from '@/store/auth-store';

export interface SessionGuard {
  dispose: () => void;
}

export function registerSessionGuard(onExpired: () => void): SessionGuard {
  let fired = false;
  const unsubscribe = onSessionExpired(() => {
    if (fired) return;
    fired = true;
    onExpired();
  });
  return {
    dispose: () => {
      unsubscribe();
    },
  };
}
