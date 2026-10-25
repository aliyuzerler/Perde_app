/**
 * Keşfet — gerçek katalog: kategori çipleri (GET /catalog/categories) +
 * sayfalı içerik ızgarası (GET /catalog/titles, sonsuz kaydırma).
 * Boş sonuç ve ağ hataları tasarlanmıştır (Faz 2c).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View, Pressable, FlatList, type ListRenderItemInfo } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useCategories } from '@/hooks/queries/use-categories';
import { useTitles } from '@/hooks/queries/use-titles';
import { useNetworkStatus, isDefinitelyOffline } from '@/hooks/use-network';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { PosterCard } from '@/components/ui/poster-card';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { ApiClientError } from '@/services/api-client';
import { spacing } from '@/theme/tokens';
import type { ContentSummary } from '@perdego/contracts';

export default function ExploreScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const categories = useCategories();
  const network = useNetworkStatus();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const titles = useTitles(activeCategory ? { category: activeCategory } : {});

  const chips = useMemo(
    () => (categories.data?.items ?? []).slice(0, 12),
    [categories.data]
  );

  const offline = isDefinitelyOffline(network.connectivity);
  const items = titles.data?.pages.flatMap((page) => page.items) ?? [];

  const renderItem = ({ item }: ListRenderItemInfo<ContentSummary>) => (
    // NOT: dış kapsayıcı role=button DEĞİL — PosterCard zaten kendi
    // erişilebilir butonu; RNW'de iç içe <button> geçersiz HTML (FAZ-2 QA).
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/content/[id]',
          params: { id: item.slug },
        })
      }
      style={styles.gridItem}
    >
      <PosterCard
        title={item.title}
        metaText={String(item.releaseYear)}
        aspect="poster"
        imageUrl={item.posterUrl}
        accessType={item.accessType}
        isNew={item.isNew}
        cornerBadgeLabel={
          item.kind === 'SERIES' ? 'DİZİ' : item.kind === 'FILM' ? 'FİLM' : 'KISA FİLM'
        }
      />
    </Pressable>
  );

  if (titles.isPending) {
    return (
      <ScreenContainer>
        <View style={styles.header}>
          <AppText variant="display">{t('explore.title')}</AppText>
          <AppText variant="body" color="textMuted">
            {t('explore.subtitle')}
          </AppText>
        </View>
        <LoadingView variant="list" />
      </ScreenContainer>
    );
  }

  if (titles.isError) {
    const isNetwork =
      (titles.error instanceof ApiClientError && titles.error.isNetworkFailure) || offline;
    return (
      <ScreenContainer>
        <ErrorView
          kind={isNetwork ? 'network' : 'generic'}
          title={t('discover.errorTitle')}
          body={t('discover.errorBody')}
          onRetry={() => {
            network.refresh();
            void titles.refetch();
          }}
          style={styles.centered}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <FlatList
        data={items}
        keyExtractor={(item: ContentSummary) => item.contentId}
        renderItem={renderItem}
        numColumns={3}
        columnWrapperStyle={styles.gridColumn}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <AppText variant="display">{t('explore.title')}</AppText>
              <AppText variant="body" color="textMuted">
                {t('explore.subtitle')}
              </AppText>
            </View>

            {offline ? <OfflineBanner /> : null}

            <View style={styles.chipRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: activeCategory === null }}
                onPress={() => setActiveCategory(null)}
                style={[
                  styles.chip,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  activeCategory === null && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
                ]}
              >
                <AppText variant="label">{t('explore.allContent')}</AppText>
              </Pressable>
              {chips.map((category) => {
                const active = activeCategory === category.slug;
                return (
                  <Pressable
                    key={category.slug}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setActiveCategory(active ? null : category.slug)}
                    style={[
                      styles.chip,
                      { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                      active && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
                    ]}
                  >
                    <AppText variant="label">{category.name}</AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        ListFooterComponent={
          titles.isFetchingNextPage ? (
            <View style={styles.footer}>
              <LoadingView variant="list" style={styles.footerLoader} />
            </View>
          ) : undefined
        }
        onEndReached={() => {
          if (titles.hasNextPage && !titles.isFetchingNextPage) {
            void titles.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText variant="body" color="textMuted" style={styles.emptyText}>
              {t('empty.genericTitle')}
            </AppText>
          </View>
        }
        contentContainerStyle={styles.list}
      />
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
      gap: 2,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
    },
    chip: {
      minHeight: 36,
      borderRadius: 2,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing[3],
      justifyContent: 'center',
    },
    list: {
      paddingBottom: spacing[6],
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
    },
    emptyText: {
      textAlign: 'center',
    },
  });
