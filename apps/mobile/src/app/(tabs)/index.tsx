/**
 * Ana Sayfa — sinematik öne çıkan alan, izlemeye devam, trend/popup raylar,
 * yeni eklenenler ve kategori şeridi. Veri: useFeed (mock adapter) + yerel
 * playback-store (gerçek izleme ilerlemesi).
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useFeed } from '@/hooks/queries/use-feed';
import { useContentDetail } from '@/hooks/queries/use-content-detail';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { EmptyView } from '@/components/state-views/empty-view';
import { HeroBanner } from '@/components/home/hero-banner';
import { ContentRail } from '@/components/home/content-rail';
import { ContinueCard } from '@/components/home/continue-card';
import { usePlaybackStore } from '@/store/playback-store';
import { useAuthStore } from '@/store/auth-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { radius, spacing } from '@/theme/tokens';
import type { ContentSummary } from '@perdego/contracts';

export default function HomeScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const feed = useFeed();

  const continueEntries = usePlaybackStore((state) => state.continueWatching)();
  const session = useAuthStore((state) => state.session);
  // Açılış kapısı (ekran düzeyi): gezgin mount edikken Redirect güvenlidir.
  // Kök layout'taki Redirect expo-router v58 web'de döngüye giriyordu (FAZ-2 QA).
  const hasSeenOnboarding = usePreferencesStore(
    (state) => state.hasSeenOnboarding
  );

  // Kategori şeridi — sabit tür seti (Faz 2b'de sunucudan gelecek).
  const categories = useMemo(
    () => [
      { slug: 'dram', name: 'Dram' },
      { slug: 'gizem', name: 'Gizem' },
      { slug: 'gerilim', name: 'Gerilim' },
      { slug: 'bilim-kurgu', name: 'Bilim Kurgu' },
      { slug: 'komedi', name: 'Komedi' },
    ],
    []
  );

  const openDetail = (item: ContentSummary) =>
    router.push({ pathname: '/content/[id]', params: { id: item.contentId } });

  const sections = feed.data?.sections ?? [];
  const heroSection = sections.find((section) => section.layout === 'HERO');
  const heroItem = heroSection?.items[0];
  const heroDetail = useContentDetail(heroItem ? heroItem.contentId : '');
  const heroContent = heroDetail.data;
  const rails = sections.filter((section) => section.layout !== 'HERO');
  const verticalRail = rails.find(
    (section) => section.id === 'rail_verticals' || section.id === 'rail_shorts'
  );

  // Açılış kapısı: ilk başlatmada onboarding, sonrasında ana akış.
  if (!hasSeenOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (feed.isPending) {
    return (
      <ScreenContainer>
        <LoadingView variant="rails" />
      </ScreenContainer>
    );
  }

  if (feed.isError || !heroItem) {
    return (
      <ScreenContainer>
        <ErrorView
          kind={feed.error instanceof Error && feed.error.message === 'MOCK_NETWORK_FAILURE' ? 'network' : 'generic'}
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
          <View style={styles.brandRow}>
            <View style={styles.brandBar} />
            <AppText variant="heading" style={styles.brandName}>
              {t('common.appName')}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('credits.title')}
            onPress={() => router.push('/credits')}
            style={styles.walletButton}
          >
            <Ionicons name="wallet-outline" size={20} color={theme.colors.text} />
          </Pressable>
        </View>

        <HeroBanner
          item={heroItem}
          tagline={heroContent?.tagline}
          episodeCount={
            heroContent && heroContent.kind === 'SERIES'
              ? heroContent.seasons.reduce((sum, season) => sum + season.episodes.length, 0)
              : undefined
          }
          seasonCount={heroContent?.seasons.length || undefined}
          onPlay={() => router.push({ pathname: '/content/[id]', params: { id: heroItem.contentId } })}
          onDetail={() =>
            router.push({ pathname: '/content/[id]', params: { id: heroItem.contentId } })
          }
        />

        {session ? (
          <AppText variant="caption" color="textSubtle" style={styles.welcome}>
            {t('auth.welcome', { name: session.user.displayName })}
          </AppText>
        ) : null}

        {continueEntries.length > 0 ? (
          <View style={styles.railBlock}>
            <AppText variant="heading" style={styles.railTitle}>
              {t('home.continueWatching')}
            </AppText>
            <View style={styles.continueRow}>
              {continueEntries.slice(0, 6).map((entry) => (
                <ContinueCard
                  key={entry.episodeId}
                  entry={entry}
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
          </View>
        ) : null}

        {rails.map((section) => (
          <View key={section.id} style={styles.railBlock}>
            <ContentRail
              title={section.title}
              items={section.items}
              vertical={section.id === verticalRail?.id}
              itemWidth={section.id === verticalRail?.id ? 156 : 120}
              onItemPress={openDetail}
              metaFor={(item) =>
                item.isNew ? t('content.newBadge') : String(item.releaseYear)
              }
            />
          </View>
        ))}

        <View style={styles.railBlock}>
          <AppText variant="heading" style={styles.railTitle}>
            {t('home.byCategory')}
          </AppText>
          <View style={styles.categoryRow}>
            {categories.map((category) => (
              <Pressable
                key={category.slug}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/category/[slug]',
                    params: { slug: category.slug },
                  })
                }
                style={[
                  styles.categoryCard,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <AppText variant="heading" numberOfLines={1}>
                  {category.name}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {sections.length === 0 && rails.length === 0 ? (
          <EmptyView
            title={t('empty.genericTitle')}
            body={t('discover.errorBody')}
          />
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
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing[2],
      paddingBottom: spacing[3],
      paddingHorizontal: spacing[4],
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
    },
    brandBar: {
      width: 4,
      height: 20,
      backgroundColor: colors.accent,
      borderRadius: radius.none,
    },
    brandName: {
      letterSpacing: 0.5,
    },
    walletButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    welcome: {
      paddingHorizontal: spacing[4],
      marginTop: spacing[3],
    },
    railBlock: {
      marginTop: spacing[4],
    },
    railTitle: {
      paddingHorizontal: spacing[4],
      marginBottom: spacing[3],
    },
    continueRow: {
      flexDirection: 'row',
      paddingHorizontal: spacing[4],
      gap: spacing[3],
      flexWrap: 'wrap',
    },
    categoryRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
    },
    categoryCard: {
      flexGrow: 0,
      flexBasis: '31%',
      minHeight: 64,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing[3],
      justifyContent: 'center',
    },
  });
