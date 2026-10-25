/**
 * Planım — Favoriler | Devam | Geçmiş segmentleri.
 * Favoriler: yerel watchlist-store (gerçek). Devam/Geçmiş: playback-store
 * (gerçek yerel izleme ilerlemesi). Sunucu eşitlemesi sonraki fazlarda.
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
import { EmptyView } from '@/components/state-views/empty-view';
import { ContinueCard } from '@/components/home/continue-card';
import { useWatchlistStore } from '@/store/watchlist-store';
import { usePlaybackStore } from '@/store/playback-store';
import { spacing } from '@/theme/tokens';
import type { ContentSummary } from '@perdego/contracts';

type LibraryTab = 'favorites' | 'continue' | 'history';

export default function LibraryScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const [tab, setTab] = useState<LibraryTab>('favorites');

  const favorites = useWatchlistStore((state) => state.items);
  const continueEntries = usePlaybackStore((state) => state.continueWatching)();
  const historyEntries = usePlaybackStore((state) => state.history)();
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
          router.push({ pathname: '/content/[id]', params: { id: item.contentId } })
        }
      />
    </View>
  );

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <AppText variant="display">{t('watchlist.title')}</AppText>
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
        favorites.length === 0 ? (
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
          />
        )
      ) : null}

      {tab === 'continue' ? (
        continueEntries.length === 0 ? (
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
        historyEntries.length === 0 ? (
          <EmptyView
            title={t('library.emptyHistoryTitle')}
            body={t('library.emptyHistoryBody')}
            ctaLabel={t('watchlist.emptyCta')}
            onCtaPress={() => router.push('/')}
          />
        ) : (
          <View style={styles.historyList}>
            {historyEntries.map((entry) => (
              <Pressable
                key={entry.episodeId}
                accessibilityRole="button"
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
