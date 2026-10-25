/** TanStack Query anahtarları — tek yerden yönetilir. */
export const queryKeys = {
  home: ['home'] as const,
  titles: (params: { kind?: string; category?: string }) =>
    ['titles', params.kind ?? null, params.category ?? null] as const,
  search: (params: { query: string; kind?: string; category?: string }) =>
    ['search', params.query, params.kind ?? null, params.category ?? null] as const,
  titleDetail: (slug: string) => ['title', slug] as const,
  episodeDetail: (episodeId: string) => ['episode', episodeId] as const,
  categories: ['categories'] as const,
  category: (slug: string) => ['category', slug] as const,
  favorites: ['favorites'] as const,
  watchProgress: (scope: 'continue' | 'history') => ['watchProgress', scope] as const,
  plans: ['plans'] as const,
  creditPacks: ['creditPacks'] as const,
  wallet: ['wallet'] as const,
  walletTransactions: ['walletTransactions'] as const,
  authSessions: ['authSessions'] as const,
  legal: (slug: 'terms' | 'privacy') => ['legal', slug] as const,
};
