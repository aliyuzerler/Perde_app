import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { useAuthStore } from '@/store/auth-store';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

/**
 * İzleme listeleri (sunucu) — oturum açıkken.
 *   continue → "devam et" rayı (tamamlanmamışlar)
 *   history  → Planım > Geçmiş (sayfalı)
 * Oturum yoksa ekranlar yerel playback-store verisini gösterir (fallback).
 */
export function useWatchProgress(scope: 'continue' | 'history', sessionToken: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.watchProgress(scope),
    queryFn: ({ pageParam }) =>
      contentApi.getWatchProgress({
        scope,
        page: pageParam,
        pageSize: 20,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta && lastPage.meta.hasNextPage ? lastPage.meta.page + 1 : undefined,
    staleTime: 30 * 1000,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
    enabled: sessionToken != null,
  });
}

/** Sunucuya ilerleme kaydı (oturum açıkken player'dan çağrılır; sessiz uygulanır). */
export function useSaveWatchProgress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { episodeId: string; positionSeconds: number; completed?: boolean }) =>
      contentApi.saveWatchProgress(input.episodeId, {
        positionSeconds: input.positionSeconds,
        completed: input.completed,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['watchProgress'] });
    },
    retry: false,
  });
}

/** Oturum durumu seçicisi. */
export function useWatchSessionToken(): string | null {
  return useAuthStore((state) => state.session?.tokens.accessToken ?? null);
}
