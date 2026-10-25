import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

const PAGE_SIZE = 20;

type SearchKind = 'FILM' | 'SERIES' | 'SHORT_FILM';

/**
 * Arama — sonsuz kaydırma: sayfalar BİRLEŞTİRİLİR (Faz 2c: eski sayfa-değiştirme
 * davranışının yerine geçer; sonuç listesi kaydırdıkça büyür).
 * Boş sorguda istek atılmaz (ekran boş/idle durumu gösterir).
 */
export function useSearch(params: { query: string; kind?: SearchKind; category?: string }) {
  const trimmed = params.query.trim();
  return useInfiniteQuery({
    queryKey: queryKeys.search({ query: trimmed, kind: params.kind, category: params.category }),
    queryFn: ({ pageParam }) =>
      contentApi.searchContent({
        query: trimmed,
        page: pageParam,
        pageSize: PAGE_SIZE,
        kind: params.kind,
        category: params.category,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined,
    enabled: trimmed.length > 0,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
  });
}
