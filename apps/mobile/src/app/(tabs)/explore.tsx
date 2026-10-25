/**
 * Keşfet — kategori ızgarası ve tüm yapımlar listesi.
 * Veri: useFeed bölümlerinden tekilleştirilmiş katalog + getCategories.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useFeed } from '@/hooks/queries/use-feed';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppBadge } from '@/components/ui/app-badge';
import { PosterCard } from '@/components/ui/poster-card';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { spacing } from '@/theme/tokens';
import type { ContentSummary } from '@perdego/contracts';

export default function ExploreScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const feed = useFeed();
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const section of feed.data?.sections ?? []) {
      for (const item of section.items) {
        for (const genre of item.genres) {
          map.set(genre, (map.get(genre) ?? 0) + 1);
        }
      }
    }
    return [...map.entries()]
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count);
  }, [feed.data]);

  const allItems = useMemo(() => {
    const byId = new Map<string, ContentSummary>();
    for (const section of feed.data?.sections ?? []) {
      for (const item of section.items) {
        if (section.layout !== 'HERO') byId.set(item.contentId, item);
      }
    }
    return [...byId.values()];
  }, [feed.data]);

  const visible = activeGenre
    ? allItems.filter((item) => item.genres.includes(activeGenre))
    : allItems;

  if (feed.isPending) {
    return (
      <ScreenContainer>
        <LoadingView variant="rails" />
      </ScreenContainer>
    );
  }

  if (feed.isError) {
    return (
      <ScreenContainer>
        <ErrorView
          title={t('discover.errorTitle')}
          body={t('discover.errorBody')}
          onRetry={() => feed.refetch()}
          style={styles.centered}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AppText variant="display">{t('explore.title')}</AppText>
          <AppText variant="body" color="textMuted">
            {t('explore.subtitle')}
          </AppText>
        </View>

        <View style={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: activeGenre === null }}
            onPress={() => setActiveGenre(null)}
            style={[
              styles.chip,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
              activeGenre === null && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
            ]}
          >
            <AppText variant="label">{t('explore.allContent')}</AppText>
          </Pressable>
          {categories.map((category) => {
            const active = activeGenre === category.slug;
            return (
              <Pressable
                key={category.slug}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setActiveGenre(category.slug)}
                style={[
                  styles.chip,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                  active && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
                ]}
              >
                <AppText variant="label">
                  {category.slug.replace(/-/g, ' ')}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.grid}>
          {visible.map((item) => (
            // NOT: dış kapsayıcı role=button DEĞİL — PosterCard zaten kendi
            // erişilebilir butonu; RNW'de iç içe <button> geçersiz HTML (FAZ-2 QA).
            <Pressable
              key={item.contentId}
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
              <View style={styles.gridBadge}>
                <AppBadge
                  label={item.kind === 'SERIES' ? 'DİZİ' : item.kind === 'FILM' ? 'FİLM' : 'KISA FİLM'}
                  tone="neutral"
                />
              </View>
            </Pressable>
          ))}
        </View>

        {visible.length === 0 ? (
          <AppText variant="body" color="textMuted" style={styles.empty}>
            {t('empty.genericTitle')}
          </AppText>
        ) : null}
      </ScrollView>
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
    gridBadge: {
      position: 'absolute',
      top: spacing[2],
      right: spacing[2],
    },
    empty: {
      padding: spacing[4],
      textAlign: 'center',
    },
  });
