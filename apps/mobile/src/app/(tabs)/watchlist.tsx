/**
 * Planım: yerel izleme listesi (Zustand + kalıcı depolama).
 * Boş durum ve ekleme/çıkarma akışları gerçek çalışır; sahte veri gösterilmez.
 */
import { useCallback } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { ScreenContainer } from '@/components/screen-container';
import { PosterCard } from '@/components/ui/poster-card';
import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { EmptyView } from '@/components/state-views/empty-view';
import { useWatchlistStore } from '@/store/watchlist-store';
import { spacing } from '@/theme/tokens';
import type { ContentSummary } from '@perdego/contracts';

export default function WatchlistScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const items = useWatchlistStore((state) => state.items);
  const remove = useWatchlistStore((state) => state.remove);

  const confirmRemove = useCallback(
    (item: ContentSummary) => {
      Alert.alert(item.title, t('watchlist.remove'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.close'), style: 'destructive', onPress: () => remove(item.contentId) },
      ]);
    },
    [remove, t]
  );

  const renderItem = useCallback(
    ({ item }: { item: ContentSummary }) => (
      <View style={styles.row}>
        <PosterCard
          title={item.title}
          metaText={[String(item.releaseYear), item.genres[0]?.replace(/-/g, ' ')]
            .filter(Boolean)
            .join(' • ')}
          aspect="poster"
          imageUrl={item.posterUrl ?? null}
          accessType={item.accessType}
          isNew={item.isNew}
          width={96}
          onPress={() =>
            router.push({ pathname: '/content/[id]', params: { id: item.contentId } })
          }
        />
        <View style={styles.rowActions}>
          <AppButton
            label={t('watchlist.remove')}
            variant="ghost"
            onPress={() => confirmRemove(item)}
          />
        </View>
      </View>
    ),
    [confirmRemove, styles.row, styles.rowActions, t]
  );

  return (
    <ScreenContainer>
      {items.length === 0 ? (
        <EmptyView
          title={t('watchlist.emptyTitle')}
          body={t('watchlist.emptyBody')}
          ctaLabel={t('watchlist.emptyCta')}
          icon="bookmark-outline"
          onCtaPress={() => router.replace('/(tabs)')}
        />
      ) : (
        <>
          <View style={styles.header}>
            <AppText variant="title">{t('watchlist.title')}</AppText>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.contentId}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
          />
        </>
      )}
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    header: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      marginBottom: spacing[2],
    },
    list: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      paddingBottom: spacing[6],
      gap: spacing[4],
    },
    row: {
      flexDirection: 'row',
      gap: spacing[3],
    },
    rowActions: {
      flex: 1,
      justifyContent: 'center',
    },
    divider: {
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
