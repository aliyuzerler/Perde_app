import { useInfiniteQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

const PAGE_SIZE = 18;

/** Bir kategorinin içerikleri — sonsuz kaydırma (GET /catalog/categories/:slug/titles). */
export function useCategoryContent(slug: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.category(slug),
    queryFn: ({ pageParam }) =>
      contentApi.getCategoryContent(slug, pageParam, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta && lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined,
    staleTime: 60 * 1000,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
    enabled: slug.length > 0,
  });
}
