/**
 * Kategori sayfası — bir türün tüm yapımları (GET /catalog/categories/:slug/titles,
 * sonsuz kaydırma). Faz 2c: gerçek API, ağ hata/boş durum tasarımı.
 */
import { StyleSheet, View, Pressable, FlatList, type ListRenderItemInfo } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useCategoryContent } from '@/hooks/queries/use-category-content';
import { useNetworkStatus, isDefinitelyOffline } from '@/hooks/use-network';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { PosterCard } from '@/components/ui/poster-card';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { ApiClientError } from '@/services/api-client';
import { queryKeys } from '@/hooks/queries/query-keys';
import { spacing } from '@/theme/tokens';
import type { ContentSummary } from '@perdego/contracts';

export default function CategoryScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const network = useNetworkStatus();
  const queryClient = useQueryClient();

  const query = useCategoryContent(slug);

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const offline = isDefinitelyOffline(network.connectivity);
  const isNotFound =
    query.error instanceof ApiClientError && query.error.code === 'NOT_FOUND';

  const renderItem = ({ item }: ListRenderItemInfo<ContentSummary>) => (
    // NOT: dış kapsayıcı role=button DEĞİL — PosterCard kendi erişilebilir butonu.
    <Pressable
      onPress={() => router.push({ pathname: '/content/[id]', params: { id: item.slug } })}
      style={styles.gridItem}
    >
      <PosterCard
        title={item.title}
        metaText={String(item.releaseYear)}
        aspect="poster"
        imageUrl={item.posterUrl}
        accessType={item.accessType}
        isNew={item.isNew}
      />
    </Pressable>
  );

  return (
    <ScreenContainer>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        </Pressable>
        <AppText variant="heading">
          {query.data?.pages[0]?.category.name ?? slug.replace(/-/g, ' ')}
        </AppText>
      </View>

      {query.isPending ? (
        <LoadingView variant="list" />
      ) : query.isError ? (
        <ErrorView
          kind={isNotFound ? 'generic' : offline ? 'network' : 'generic'}
          title={isNotFound ? t('category.notFoundTitle') : t('error.networkTitle')}
          body={isNotFound ? t('category.notFoundBody') : t('error.networkBody')}
          onRetry={() => {
            network.refresh();
            void query.refetch();
          }}
          style={styles.centered}
        />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <AppText variant="body" color="textMuted" style={styles.emptyText}>
            {t('empty.genericTitle')}
          </AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: ContentSummary) => item.contentId}
          renderItem={renderItem}
          numColumns={3}
          columnWrapperStyle={styles.gridColumn}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <AppText variant="caption" color="textSubtle" style={styles.count}>
              {t('category.contentCount', {
                count: query.data?.pages[0]?.category.contentCount ?? items.length,
              })}
            </AppText>
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <View style={styles.footer}>
                <LoadingView variant="list" style={styles.footerLoader} />
              </View>
            ) : undefined
          }
          onEndReached={() => {
            if (query.hasNextPage && !query.isFetchingNextPage) {
              void query.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.category(slug) });
            network.refresh();
          }}
          refreshing={false}
        />
      )}
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    centered: {
      flex: 1,
      justifyContent: 'center',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
    },
    backButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -spacing[2],
    },
    count: {
      paddingHorizontal: spacing[4],
      marginBottom: spacing[3],
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: spacing[4],
      rowGap: spacing[4],
    },
    gridColumn: {
      justifyContent: 'space-between',
      paddingHorizontal: spacing[4],
      marginBottom: spacing[4],
    },
    gridItem: {
      width: '31.5%',
    },
    footer: {
      paddingVertical: spacing[3],
    },
    footerLoader: {
      minHeight: 120,
    },
    empty: {
      padding: spacing[4],
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    emptyText: {
      textAlign: 'center',
    },
  });
