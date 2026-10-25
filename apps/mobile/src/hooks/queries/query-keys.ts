/** TanStack Query anahtarları — tek yerden yönetilir. */
export const queryKeys = {
  feed: ['feed'] as const,
  search: (params: { query: string; page: number }) =>
    ['search', params.query, params.page] as const,
  contentDetail: (contentId: string) => ['content', contentId] as const,
  categories: ['categories'] as const,
  category: (slug: string) => ['category', slug] as const,
  plans: ['plans'] as const,
  creditPacks: ['creditPacks'] as const,
  wallet: ['wallet'] as const,
  walletTransactions: ['walletTransactions'] as const,
  authSessions: ['authSessions'] as const,
  legal: (slug: 'terms' | 'privacy') => ['legal', slug] as const,
};
