import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

/** Bölüm detayı + sunucu erişim kararı (GET /catalog/episodes/:id). */
export function useEpisodeDetail(episodeId: string) {
  return useQuery({
    queryKey: queryKeys.episodeDetail(episodeId),
    queryFn: () => contentApi.getEpisodeDetail(episodeId),
    staleTime: 5 * 60 * 1000,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
    enabled: episodeId.length > 0,
  });
}
