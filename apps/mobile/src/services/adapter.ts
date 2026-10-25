/**
 * Adapter fabrikası.
 *
 * Seçim kuralı (Genel Kural 8):
 * - `__DEV__ && EXPO_PUBLIC_MOCK_API === '1'`  → mock adapter (geliştirme)
 * - aksi halde                                 → gerçek HTTP adapter (Faz 2)
 *
 * Üretimde mock yolu kesinlikle seçilemez; mock-adapter ek bir __DEV__ koruması
 * içerir (iki katmanlı savunma).
 */
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
  const baseUrl = env.apiBaseUrl ?? 'http://localhost:3000/api/v1';
  return createHttpAdapter(new ApiClient({ baseUrl }));
}

/** Uygulamanın tek content API örneği. */
export const contentApi: ContentApiPort = resolveContentApi({
  isDev: __DEV__,
  mockApiFlag: process.env.EXPO_PUBLIC_MOCK_API,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});
