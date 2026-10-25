/**
 * Planım — Favoriler | Devam | Geçmiş segmentleri (Faz 2c: gerçek uçlar).
 *
 * Oturum açıkken: sunucu kaynaklı veri (GET /watchlist, GET /watch-progress).
 * Misafirde: yerel store'lar (kural: sahte başarı yok — kaynak etiketi net).
 */
import { useState } from 'react';
import { StyleSheet, ScrollView, View, Pressable, FlatList } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { PosterCard } from '@/components/ui/poster-card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { EmptyView } from '@/components/state-views/empty-view';
import { ContinueCard, type ContinueEntry } from '@/components/home/continue-card';
import {
  useFavorites,
  useSessionToken,
} from '@/hooks/queries/use-favorites';
import { useWatchProgress } from '@/hooks/queries/use-watch-progress';
import { ApiClientError } from '@/services/api-client';
import { useWatchlistStore } from '@/store/watchlist-store';
import { usePlaybackStore } from '@/store/playback-store';
import { spacing } from '@/theme/tokens';
import type { ContentSummary, WatchProgressItem } from '@perdego/contracts';

type LibraryTab = 'favorites' | 'continue' | 'history';

function watchItemToEntry(item: WatchProgressItem): ContinueEntry {
  return {
    contentId: item.contentId,
    contentTitle: item.contentTitle,
    episodeId: item.episodeId,
    episodeTitle: item.episodeTitle,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    positionSeconds: item.positionSeconds,
    durationSeconds: item.durationSeconds,
    posterUrl: item.posterUrl ?? null,
  };
}

export default function LibraryScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const [tab, setTab] = useState<LibraryTab>('favorites');

  const sessionToken = useSessionToken();
  const signedIn = sessionToken != null;

  const favoritesQuery = useFavorites(sessionToken);
  const continueQuery = useWatchProgress('continue', sessionToken);
  const historyQuery = useWatchProgress('history', sessionToken);

  // Misafir yedekleri (yerel, gerçek çalışan veriler).
  const localFavorites = useWatchlistStore((state) => state.items);
  const localContinue = usePlaybackStore((state) => state.continueWatching)();
  const localHistory = usePlaybackStore((state) => state.history)();
  const removeHistory = usePlaybackStore((state) => state.remove);

  const renderFavorite = ({ item }: { item: ContentSummary }) => (
    <View style={styles.favoriteRow}>
      <PosterCard
        title={item.title}
        metaText={String(item.releaseYear)}
        aspect="poster"
        imageUrl={item.posterUrl}
        accessType={item.accessType}
        isNew={item.isNew}
        width={104}
        onPress={() =>
          router.push({ pathname: '/content/[id]', params: { id: item.slug } })
        }
      />
    </View>
  );

  // Kaynak seçimi: oturum → sunucu; hata → yerel listeyle devam (dürüst karışım).
  const favorites: ContentSummary[] = signedIn
    ? (favoritesQuery.data?.items ?? [])
    : localFavorites;
  const continueEntries: ContinueEntry[] = signedIn
    ? (continueQuery.data?.pages[0]?.items ?? []).map(watchItemToEntry)
    : localContinue;
  const historyEntries: (ContinueEntry | WatchProgressItem)[] = signedIn
    ? (historyQuery.data?.pages.flatMap((page) => page.items) ?? [])
    : localHistory;

  const loading = {
    favorites: signedIn && favoritesQuery.isPending,
    continue: signedIn && continueQuery.isPending,
    history: signedIn && historyQuery.isPending,
  };
  const error = {
    favorites:
      signedIn &&
      favoritesQuery.isError &&
      !(favoritesQuery.error instanceof ApiClientError && favoritesQuery.error.isNetworkFailure),
    continue: signedIn && continueQuery.isError,
    history: signedIn && historyQuery.isError,
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="display">{t('watchlist.title')}</AppText>
        {!signedIn ? (
          <AppText variant="caption" color="textSubtle">
            {t('library.localSourceNote')}
          </AppText>
        ) : null}
        <SegmentedControl<LibraryTab>
          options={[
            { value: 'favorites', label: t('library.tabFavorites') },
            { value: 'continue', label: t('library.tabContinue') },
            { value: 'history', label: t('library.tabHistory') },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'favorites' ? (
        loading.favorites ? (
          <LoadingView variant="list" />
        ) : error.favorites ? (
          <ErrorView
            title={t('error.genericTitle')}
            body={t('error.genericBody')}
            onRetry={() => void favoritesQuery.refetch()}
            style={styles.centered}
          />
        ) : favorites.length === 0 ? (
          <EmptyView
            title={t('library.emptyFavoritesTitle')}
            body={t('library.emptyFavoritesBody')}
            ctaLabel={t('watchlist.emptyCta')}
            onCtaPress={() => router.push('/')}
          />
        ) : (
          <FlatList
            data={favorites}
            keyExtractor={(item) => item.contentId}
            numColumns={3}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.gridColumn}
            renderItem={renderFavorite}
            onEndReached={() => {
              // Favoriler küçük liste — sayfalama yok (sunucu bütünü döner).
            }}
          />
        )
      ) : null}

      {tab === 'continue' ? (
        loading.continue ? (
          <LoadingView variant="list" />
        ) : error.continue ? (
          <ErrorView
            title={t('error.networkTitle')}
            body={t('error.networkBody')}
            onRetry={() => void continueQuery.refetch()}
            style={styles.centered}
          />
        ) : continueEntries.length === 0 ? (
          <EmptyView
            title={t('library.emptyContinueTitle')}
            body={t('library.emptyContinueBody')}
            ctaLabel={t('watchlist.emptyCta')}
            onCtaPress={() => router.push('/')}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.continueWrap}>
            <View style={styles.continueRow}>
              {continueEntries.map((entry) => (
                <ContinueCard
                  key={entry.episodeId}
                  entry={entry}
                  width={128}
                  onPress={() =>
                    router.push({
                      pathname: '/player/[episodeId]',
                      params: {
                        episodeId: entry.episodeId,
                        contentId: entry.contentId,
                      },
                    })
                  }
                />
              ))}
            </View>
          </ScrollView>
        )
      ) : null}

      {tab === 'history' ? (
        loading.history ? (
          <LoadingView variant="list" />
        ) : error.history ? (
          <ErrorView
            title={t('error.networkTitle')}
            body={t('error.networkBody')}
            onRetry={() => void historyQuery.refetch()}
            style={styles.centered}
          />
        ) : historyEntries.length === 0 ? (
          <EmptyView
            title={t('library.emptyHistoryTitle')}
            body={t('library.emptyHistoryBody')}
            ctaLabel={t('watchlist.emptyCta')}
            onCtaPress={() => router.push('/')}
          />
        ) : (
          <View style={styles.historyList}>
            {historyEntries.map((entry) => (
              // NOT: dış satır role=button DEĞİL — içindeki "Geçmişten çıkar" butonu
              // gerçek <button> üretir; RNW'de iç içe <button> geçersiz HTML (FAZ-2 QA).
              <Pressable
                key={entry.episodeId}
                style={[styles.historyRow, { borderBottomColor: theme.colors.border }]}
                onPress={() =>
                  router.push({
                    pathname: '/player/[episodeId]',
                    params: {
                      episodeId: entry.episodeId,
                      contentId: entry.contentId,
                    },
                  })
                }
              >
                <View style={styles.historyTexts}>
                  <AppText variant="body" numberOfLines={1}>
                    {entry.contentTitle}
                  </AppText>
                  <AppText variant="caption" color="textSubtle">
                    {t('content.seasonLabel', { number: entry.seasonNumber })} •{' '}
                    {t('content.episodeLabel', { number: entry.episodeNumber })}
                  </AppText>
                </View>
                {!signedIn ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('library.remove')}
                    onPress={() => removeHistory(entry.episodeId)}
                    style={styles.removeButton}
                  >
                    <AppText variant="caption" color="textSubtle">
                      {t('library.remove')}
                    </AppText>
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
          </View>
        )
      ) : null}
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
    },
    header: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[2],
      gap: spacing[3],
      paddingBottom: spacing[3],
    },
    grid: {
      paddingHorizontal: spacing[4],
      rowGap: spacing[4],
    },
    gridColumn: {
      justifyContent: 'space-between',
    },
    favoriteRow: {
      width: '31.5%',
    },
    continueWrap: {
      padding: spacing[4],
    },
    continueRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing[3],
    },
    historyList: {
      paddingHorizontal: spacing[4],
      gap: spacing[3],
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingBottom: spacing[2],
    },
    historyTexts: {
      flex: 1,
      gap: 2,
    },
    removeButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing[2],
    },
  });
