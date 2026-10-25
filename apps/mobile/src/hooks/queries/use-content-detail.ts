import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';

/** İçerik detayı. Boş id ile çağrıda sorgu hiç ateşlenmez (bogus istek yok). */
export function useContentDetail(contentId: string) {
  return useQuery({
    queryKey: queryKeys.contentDetail(contentId),
    queryFn: () => contentApi.getContentDetail(contentId),
    staleTime: 10 * 60 * 1000,
    retry: false,
    enabled: contentId.length > 0,
  });
}
