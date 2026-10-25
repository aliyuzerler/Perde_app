import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { useAuthStore } from '@/store/auth-store';
import { queryKeys } from './query-keys';
import { catalogRetry, catalogRetryDelay } from './retry-policy';

/**
 * Favoriler (sunucu) — yalnızca oturum açıkken sorgulanır.
 * Oturum yoksa Planım yerel favori listesini gösterir (screen-side fallback).
 */
export function useFavorites(sessionToken: string | null) {
  return useQuery({
    queryKey: queryKeys.favorites,
    queryFn: () => contentApi.getFavorites(),
    staleTime: 30 * 1000,
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
    enabled: sessionToken != null,
  });
}

/** Favoriye ekle/kaldır — sunucu mutasyonları; başarılıysa liste tazelenir. */
export function useFavoriteMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.favorites });

  const add = useMutation({
    mutationFn: (contentId: string) => contentApi.addFavorite(contentId),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (contentId: string) => contentApi.removeFavorite(contentId),
    onSuccess: invalidate,
  });

  return { add, remove };
}

/** Oturum durumu seçicisi (hook'lar arasında tek kaynak). */
export function useSessionToken(): string | null {
  return useAuthStore((state) => state.session?.tokens.accessToken ?? null);
}
