import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { SearchParams } from '@perdego/contracts';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';

/** Arama. Boş sorguda istek atılmaz (ekran boş/idle durumu gösterir). */
export function useSearch(params: Pick<SearchParams, 'query' | 'page'>) {
  const trimmed = params.query.trim();
  return useQuery({
    queryKey: queryKeys.search({ query: trimmed, page: params.page }),
    queryFn: () =>
      contentApi.searchContent({
        query: trimmed,
        page: params.page,
        pageSize: 20,
      }),
    enabled: trimmed.length > 0,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
