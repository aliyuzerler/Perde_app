/**
 * Adapter fabrikası (Faz 3b: oturum kancalı).
 *
 * Seçim kuralı (Genel Kural 8):
 * - `__DEV__ && EXPO_PUBLIC_MOCK_API === '1'`  → mock adapter (geliştirme)
 * - aksi halde                                 → gerçek HTTP adapter
 *
 * Gerçek HTTP adapter oturumu auth-store'dan okur:
 *  - her istekte güncel access token başlığa eklenir,
 *  - 401'de tek uçuşta refresh denenir ve istek tekrarlanır,
 *  - refresh başarısızsa oturum temizlenir + `onSessionExpired` olayı kök
 *    layout'ta güvenli yönlendirmeyi yapar (kural: oturum süresi dolduğunda
 *    kullanıcı herkese açık içerikten yitirilmez, güvenli çıkış yapılır).
 *
 * Üretimde mock yolu kesinlikle seçilemez; mock-adapter ek bir __DEV__ koruması
 * içerir (iki katmanlı savunma).
 */
import type { AuthSessionResponse } from '@perdego/contracts';
import type { ContentApiPort } from './ports';
import { ApiClient } from './api-client';
import { createHttpAdapter } from './http-adapter';
import { createMockAdapter } from './mock/mock-adapter';

export interface AdapterEnvironment {
  isDev: boolean;
  mockApiFlag: string | undefined;
  apiBaseUrl: string | undefined;
}

export function resolveContentApi(env: AdapterEnvironment): ContentApiPort {
  const useMock = env.isDev && env.mockApiFlag === '1';
  if (useMock) {
    return createMockAdapter();
  }
  const baseUrl = (env.apiBaseUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
  const apiBase = `${baseUrl}/api/v1`;

  // Dairesel bağımlılık önleme: store ↔ adapter — store yalnızca burada
  // late-import edilen getter'larla okunur (RN metro HMR güvenli desen).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useAuthStore } = require('../store/auth-store') as typeof import('../store/auth-store');

  const client = new ApiClient({
    baseUrl: apiBase,
    getAccessToken: () => useAuthStore.getState().getAccessToken(),
    refresh: async () => {
      const refreshToken = useAuthStore.getState().getRefreshToken();
      if (!refreshToken) return false;
      try {
        const response = await fetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const payload = (await response.json()) as
          | { ok: true; data: AuthSessionResponse }
          | { ok: false }
          | undefined;
        if (!response.ok || !payload || payload.ok !== true) {
          useAuthStore.getState().clearSession();
          return false;
        }
        useAuthStore.getState().setSession(payload.data);
        return true;
      } catch {
        return false;
      }
    },
    onSessionExpired: () => {
      useAuthStore.getState().clearSession();
    },
  });

  return createHttpAdapter(client);
}

/** Uygulamanın tek content API örneği. */
export const contentApi: ContentApiPort = resolveContentApi({
  isDev: __DEV__,
  mockApiFlag: process.env.EXPO_PUBLIC_MOCK_API,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});
