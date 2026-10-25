/** TanStack Query anahtarları — tek yerden yönetilir. */
export const queryKeys = {
  feed: ['feed'] as const,
  search: (params: { query: string; page: number }) =>
    ['search', params.query, params.page] as const,
  contentDetail: (contentId: string) => ['content', contentId] as const,
};
