/**
 * Kategori sayfası — bir türün tüm yapımları (poster ızgarası).
 */
import { StyleSheet, ScrollView, View, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { PosterCard } from '@/components/ui/poster-card';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { spacing } from '@/theme/tokens';

export default function CategoryScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : '';

  const query = useQuery({
    queryKey: ['category', slug] as const,
    queryFn: () => contentApi.getCategoryContent(slug),
    enabled: slug.length > 0,
  });

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
          {query.data?.category.name ?? slug.replace(/-/g, ' ')}
        </AppText>
      </View>

      {query.isPending ? (
        <LoadingView variant="list" />
      ) : query.isError ? (
        <ErrorView
          title={t('category.notFoundTitle')}
          body={t('category.notFoundBody')}
          onRetry={() => query.refetch()}
          style={styles.centered}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <AppText variant="caption" color="textSubtle" style={styles.count}>
            {t('category.contentCount', { count: query.data.items.length })}
          </AppText>
          <View style={styles.grid}>
            {query.data.items.map((item) => (
              <Pressable
                key={item.contentId}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/content/[id]',
                    params: { id: item.contentId },
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
                />
              </Pressable>
            ))}
          </View>
          {query.data.items.length === 0 ? (
            <AppText variant="body" color="textMuted" style={styles.empty}>
              {t('empty.genericTitle')}
            </AppText>
          ) : null}
        </ScrollView>
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
    gridItem: {
      width: '31.5%',
    },
    empty: {
      padding: spacing[4],
      textAlign: 'center',
    },
  });
