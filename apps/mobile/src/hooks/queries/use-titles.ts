import { useInfiniteQuery } from '@tanstack/react-query';
import type { TitleListParams } from '@perdego/contracts';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

const PAGE_SIZE = 18;

/**
 * Sayfalı katalog listesi (keşfet ızgarası) — sonsuz kaydırma.
 * Filtre (kind/category) değişince sorgu otomatik sıfırlanır.
 */
export function useTitles(filters: Pick<TitleListParams, 'kind' | 'category'>) {
  return useInfiniteQuery({
    queryKey: queryKeys.titles(filters),
    queryFn: ({ pageParam }) =>
      contentApi.listTitles({
        page: pageParam,
        pageSize: PAGE_SIZE,
        sort: 'newest',
        ...filters,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined,
    staleTime: 60 * 1000,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
  });
}
