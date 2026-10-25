import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

/** Kategori listesi (keşfet filtre çipleri + ana sayfa şeridi). */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => contentApi.getCategories(),
    staleTime: 5 * 60 * 1000,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
  });
}
