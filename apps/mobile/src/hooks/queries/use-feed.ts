import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { ApiClientError } from '@/services/api-client';
import { queryKeys } from './query-keys';

/** Keşfet akışı. Mock/gerçek adapter farkından habersizdir. */
export function useFeed() {
  return useQuery({
    queryKey: queryKeys.feed,
    queryFn: () => contentApi.getFeed(),
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && error.isNetworkFailure) {
        return failureCount < 2;
      }
      return false;
    },
  });
}
