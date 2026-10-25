/**
 * İngilizce sözlük — ileride çoklu dil desteği için iskelet (Genel Kural 6).
 * Faz 1'de yalnızca yapı doğrulaması için temel anahtarlar içerir.
 * Çeviri tamamlanana kadar istemci varsayılan olarak tr kullanır.
 */
import type { TranslationDict } from './tr';

export const en: TranslationDict = {
  common: {
    appName: 'PerdeGo',
    retry: 'Try Again',
    cancel: 'Cancel',
    close: 'Close',
    seeAll: 'See All',
    minutes: 'min',
    hoursShort: 'h',
    loading: 'Loading…',
    offline: 'No connection',
  },
  tabs: {
    discover: 'Discover',
    search: 'Search',
    watchlist: 'My List',
    profile: 'Profile',
  },
  discover: {
    title: 'Discover',
    errorTitle: 'Could not load feed',
    errorBody: 'Something went wrong while fetching content. Check your connection and try again.',
  },
  search: {
    title: 'Search',
    placeholder: 'Search films, series or shorts',
    idleTitle: 'What do you want to watch?',
    idleBody: 'Search by title, genre or cast member.',
    noResultsTitle: 'No results',
    noResultsBody: 'We could not find anything for “{{query}}”. Try a different phrase.',
    searching: 'Searching…',
  },
  watchlist: {
    title: 'My List',
    emptyTitle: 'Your list is empty',
    emptyBody: 'Add titles you want to watch from their detail page.',
    emptyCta: 'Start Exploring',
    remove: 'Remove from list',
  },
  profile: {
    title: 'Profile',
    guest: 'Guest',
    memberSince: 'Joined',
    preferencesTitle: 'Preferences',
    autoplayPreviews: 'Autoplay previews',
    autoplayPreviewsHint: 'Plays silent previews when a card is focused.',
    dataSaver: 'Data saver',
    dataSaverHint: 'Prefers lower quality streams.',
    sectionAccount: 'Account',
    devDataNotice: 'Showing development data',
    language: 'Language',
  },
  access: {
    FREE: 'Free',
    SUBSCRIPTION: 'Members only',
    CREDIT: 'With credit',
  },
  content: {
    episodesTitle: 'Episodes',
    seasonLabel: 'Season {{number}}',
    episodeLabel: 'Episode {{number}}',
    castTitle: 'Cast',
    roleActor: 'Cast',
    roleDirector: 'Director',
    roleWriter: 'Writer',
    watchCta: 'Play',
    watchUnavailableTitle: 'Playback not ready yet',
    watchUnavailableBody: 'Video streaming arrives in Phase 4. You can already add titles to your list.',
    lockedNotice: 'This episode requires a subscription',
    addToList: 'Add to My List',
    inList: 'In My List',
    newBadge: 'New',
    notFoundTitle: 'Content not found',
    notFoundBody: 'The title may have been removed or the link is invalid.',
    backToList: 'Back to Discover',
  },
  error: {
    genericTitle: 'Something went wrong',
    genericBody: 'An unexpected error occurred. Please try again.',
    networkTitle: 'No connection',
    networkBody: 'Check your internet connection and try again.',
  },
  empty: {
    genericTitle: 'Nothing here yet',
  },
  notFound: {
    title: 'Page not found',
    body: 'The page may have moved or never existed.',
    backHome: 'Back to Discover',
  },
};
