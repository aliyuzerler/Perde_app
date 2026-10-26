/**
 * Oynatma oturumu hook'u (FAZ 4) — imzalı akış kaynakları.
 *
 * Kurallar:
 *  - Yalnızca sunucu erişim kararı OLUMLU iken çağrılır (BR-07): kilitli
 *    bölümde 402/403 hataları sessiz retry'a girmez (anlamlı hata zaten).
 *  - Ağ hatalarında kısa retry (katalog politikası ile aynı).
 *  - Oturum KISA ÖMÜRLÜDÜR: staleTime TTL'in altında; süre bitmeden ekran
 *    refetch ile yeni imzalı URL alır (oyun sırasında player.replace).
 */
import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from '../queries/query-keys';
import { catalogRetry, catalogRetryDelay } from '../queries/retry-policy';

const SESSION_MAX_AGE_MS = 60_000;

export function usePlaybackSession(episodeId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.playbackSession(episodeId),
    queryFn: () => contentApi.createPlaybackSession(episodeId),
    enabled: enabled && episodeId.length > 0,
    staleTime: SESSION_MAX_AGE_MS,
    // Oturum yanıtı bir kez kullanılır; hata durumunda ekran "Tekrar Dene" verir.
    retry: catalogRetry,
    retryDelay: catalogRetryDelay,
  });
}
