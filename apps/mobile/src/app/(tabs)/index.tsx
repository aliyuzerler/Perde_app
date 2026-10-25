/**
 * Keşfet: hero + yatay raylar.
 * Veri katmanına yalnızca `useFeed` hook'u ile erişilir (Kural 5).
 */
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useFeed } from '@/hooks/queries/use-feed';
import { ScreenContainer } from '@/components/screen-container';
import { PosterCard } from '@/components/ui/poster-card';
import { SectionHeader } from '@/components/ui/section-header';
import { GradientPlaceholder } from '@/components/ui/gradient-placeholder';
import { LoadingView } from '@/components/state-views/loading-view';
import { EmptyView } from '@/components/state-views/empty-view';
import { ErrorView } from '@/components/state-views/error-view';
import { ApiClientError } from '@/services/api-client';
import { layout, radius, spacing } from '@/theme/tokens';
import type {
  ContentSummary,
  FeedSection,
  FeedSectionLayout,
} from '@perdego/contracts';

function buildCardMeta(item: ContentSummary, genreLabel: (slug: string) => string): string {
  const genre = item.genres[0] ? genreLabel(item.genres[0]) : null;
  return [String(item.releaseYear), genre].filter(Boolean).join(' • ');
}

function cardAspect(item: ContentSummary) {
  return item.kind === 'SHORT_FILM' ? ('vertical' as const) : ('poster' as const);
}

function cardWidth(item: ContentSummary) {
  return item.kind === 'SHORT_FILM' ? layout.railVerticalWidth : layout.railPosterWidth;
}

export default function DiscoverScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const feed = useFeed();

  const openContent = useCallback((contentId: string) => {
    router.push({ pathname: '/content/[id]', params: { id: contentId } });
  }, []);

  const genreLabel = useCallback(
    (slug: string) => slug.replace(/-/g, ' '),
    []
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<FeedSection>) => {
      if (item.layout === ('GRID' satisfies FeedSectionLayout)) {
        return (
          <View>
            <SectionHeader title={item.title} />
            <View style={styles.grid}>
              {item.items.map((card) => (
                <PosterCard
                  key={card.contentId}
                  title={card.title}
                  metaText={buildCardMeta(card, genreLabel)}
                  aspect="poster"
                  imageUrl={card.posterUrl ?? null}
                  accessType={card.accessType}
                  isNew={card.isNew}
                  style={styles.gridItem}
                  onPress={() => openContent(card.contentId)}
                />
              ))}
            </View>
          </View>
        );
      }

      return (
        <View>
          <SectionHeader title={item.title} />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={item.items}
            keyExtractor={(card) => card.contentId}
            contentContainerStyle={styles.railContent}
            renderItem={({ item: card }) => (
              <PosterCard
                title={card.title}
                metaText={buildCardMeta(card, genreLabel)}
                aspect={cardAspect(card)}
                imageUrl={card.posterUrl ?? card.verticalPreviewUrl ?? null}
                accessType={card.accessType}
                isNew={card.isNew}
                width={cardWidth(card)}
                onPress={() => openContent(card.contentId)}
              />
            )}
          />
        </View>
      );
    },
    [genreLabel, openContent, styles.grid, styles.gridItem, styles.railContent]
  );

  const body = useMemo(() => {
    if (feed.isPending) {
      return <LoadingView variant="rails" />;
    }
    if (feed.isError) {
      const isNetwork =
        feed.error instanceof ApiClientError && feed.error.isNetworkFailure;
      return (
        <ErrorView
          kind={isNetwork ? 'network' : 'generic'}
          title={t('discover.errorTitle')}
          body={t('discover.errorBody')}
          onRetry={() => feed.refetch()}
          style={styles.centeredBody}
        />
      );
    }
    const sections = feed.data?.sections ?? [];
    if (sections.length === 0) {
      return (
        <EmptyView
          title={t('empty.genericTitle')}
          icon="film-outline"
          onCtaPress={() => feed.refetch()}
          ctaLabel={t('common.retry')}
          style={styles.centeredBody}
        />
      );
    }
    return null;
  }, [feed, t, styles.centeredBody]);

  const hero = feed.data?.sections.find((section) => section.layout === 'HERO');
  const heroItem = hero?.items[0];
  const railSections = useMemo(
    () => feed.data?.sections.filter((section) => section.layout !== 'HERO') ?? [],
    [feed.data]
  );

  return (
    <ScreenContainer>
      {body ?? (
        <FlatList
          data={railSections}
          keyExtractor={(section) => section.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            heroItem ? (
              <View style={styles.heroWrap}>
                <PosterCard
                  title={heroItem.title}
                  metaText={buildCardMeta(heroItem, genreLabel)}
                  aspect="wide"
                  imageUrl={heroItem.posterUrl ?? heroItem.verticalPreviewUrl ?? null}
                  accessType={heroItem.accessType}
                  isNew={heroItem.isNew}
                  style={styles.heroCard}
                  onPress={() => openContent(heroItem.contentId)}
                />
              </View>
            ) : (
              <View style={styles.heroFallback}>
                <GradientPlaceholder
                  seed="perdego-hero"
                  title={t('common.appName')}
                  style={styles.heroCard}
                />
              </View>
            )
          }
          ListFooterComponent={<View style={styles.footerSpace} />}
        />
      )}
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>  StyleSheet.create({
    heroWrap: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
    },
    heroFallback: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
    },
    heroCard: {
      borderRadius: radius.md,
    },
    railContent: {
      paddingHorizontal: spacing[4],
      gap: spacing[3],
    },
    grid: {
      paddingHorizontal: spacing[4],
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing[3],
    },
    gridItem: {
      width: '47.5%',
    },
    centeredBody: {
      flex: 1,
      justifyContent: 'center',
    },
    footerSpace: {
      height: spacing[6],
    },
  });
