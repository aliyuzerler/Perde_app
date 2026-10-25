import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';

/**
 * İçerik detayı (slug ile — GET /catalog/titles/:slug).
 * Yanıt accessSeasons taşır: her bölüm için SUNUCU tarafı erişim kararı.
 * Boş slug ile çağrıda sorgu hiç ateşlenmez (bogus istek yok).
 * 404 yeniden denenmez (bilinen sonuç), ağ hatası yeniden denenmez (ErrorView).
 */
export function useTitleDetail(slug: string) {
  return useQuery({
    queryKey: queryKeys.titleDetail(slug),
    queryFn: () => contentApi.getTitleDetail(slug),
    staleTime: 10 * 60 * 1000,
    retry: false,
    enabled: slug.length > 0,
  });
}
