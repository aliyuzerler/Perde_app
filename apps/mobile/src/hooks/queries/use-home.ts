import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

/**
 * Ana sayfa: banner'lar + bölüm rayları (GET /home).
 * Mock/gerçek adapter farkından habersizdir; ağ hatasında kısa otomatik
 * yeniden deneme + kalıcı hatada ekran düzeyi Tekrar Dene.
 */
export function useHome() {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => contentApi.getFeed(),
    staleTime: 2 * 60 * 1000,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
  });
}
