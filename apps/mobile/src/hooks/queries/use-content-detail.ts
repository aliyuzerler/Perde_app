import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/services/adapter';
import { queryKeys } from './query-keys';

/** İçerik detayı. */
export function useContentDetail(contentId: string) {
  return useQuery({
    queryKey: queryKeys.contentDetail(contentId),
    queryFn: () => contentApi.getContentDetail(contentId),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
