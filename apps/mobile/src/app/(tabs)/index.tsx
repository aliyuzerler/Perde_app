/**
 * Ana Sayfa — gerçek API'den dinamik yükleme (Faz 2c).
 *
 * Veri katmanı:
 *   - GET /home → banner'lar + bölüm rayları (HERO + RAIL + GRID)
 *   - GET /catalog/categories → kategori şeridi (sabit liste kaldırıldı)
 *   - GET /watch-progress (scope=continue) → sunucu "devam et" (oturum varsa)
 *   - yerel playback-store → oynatıcı ilerlemesi (oturum yoksa kaynak)
 *
 * Sinematik yoğunluk kuralı: en fazla 4 ray + tek hero; kategori şeridi 8
 * öğeyle sınırlıdır — ekrana gereksiz kart yığını yığılmaz.
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useHome } from '@/hooks/queries/use-home';
import { useTitleDetail } from '@/hooks/queries/use-title-detail';
import { useCategories } from '@/hooks/queries/use-categories';
import { useWatchProgress } from '@/hooks/queries/use-watch-progress';
import { useNetworkStatus, isDefinitelyOffline } from '@/hooks/use-network';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { EmptyView } from '@/components/state-views/empty-view';
import { HeroBanner } from '@/components/home/hero-banner';
import { ContentRail } from '@/components/home/content-rail';
import { ContinueCard, type ContinueEntry } from '@/components/home/continue-card';
import { ApiClientError } from '@/services/api-client';
import { usePlaybackStore } from '@/store/playback-store';
import { useAuthStore } from '@/store/auth-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { radius, spacing } from '@/theme/tokens';
import type { ContentSummary, WatchProgressItem } from '@perdego/contracts';

const MAX_RAILS = 4;
const MAX_CATEGORIES = 8;
const MAX_CONTINUE = 6;

/** Sunucu izleme kaydını devam kartı görünümüne çevirir. */
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

export default function HomeScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const home = useHome();
  const categories = useCategories();
  const network = useNetworkStatus();

  const localContinueEntries = usePlaybackStore((state) => state.continueWatching)();
  const session = useAuthStore((state) => state.session);
  // Açılış kapısı (ekran düzeyi): gezgin mount edikken Redirect güvenlidir.
  // Kök layout'taki Redirect expo-router v58 web'de döngüye giriyordu (FAZ-2 QA).
  const hasSeenOnboarding = usePreferencesStore(
    (state) => state.hasSeenOnboarding
  );

  const sections = home.data?.sections ?? [];
  const banners = home.data?.banners ?? [];
  const heroSection = sections.find((section) => section.layout === 'HERO');
  const heroItem = heroSection?.items[0];
  const heroSlug = heroItem?.slug ?? '';
  const heroDetail = useTitleDetail(heroSlug);
  const rails = sections
    .filter((section) => section.layout !== 'HERO')
    .slice(0, MAX_RAILS);

  // "Devam et": oturum açıkken sunucu listesi (enabled=false ise istek yok),
  // sunucu hata/anonim durumda yerel playback-store kayıtları gösterilir.
  const sessionToken = session?.tokens.accessToken ?? null;
  const serverContinue = useWatchProgress('continue', sessionToken);
  const continueEntries: ContinueEntry[] = useMemo(() => {
    if (sessionToken && serverContinue.data?.pages[0]?.items) {
      return serverContinue.data.pages[0].items
        .slice(0, MAX_CONTINUE)
        .map(watchItemToEntry);
    }
    return localContinueEntries.slice(0, MAX_CONTINUE);
  }, [sessionToken, serverContinue.data, localContinueEntries]);

  // Açılış kapısı: ilk başlatmada onboarding, sonrasında ana akış.
  if (!hasSeenOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (home.isPending) {
    return (
      <ScreenContainer>
        <LoadingView variant="rails" />
      </ScreenContainer>
    );
  }

  const offline = isDefinitelyOffline(network.connectivity);
  const networkError =
    home.error instanceof ApiClientError && home.error.isNetworkFailure;

  if (home.isError) {
    return (
      <ScreenContainer>
        <ErrorView
          kind={networkError || offline ? 'network' : 'generic'}
          title={t('discover.errorTitle')}
          body={t('discover.errorBody')}
          onRetry={() => {
            network.refresh();
            void home.refetch();
          }}
          style={styles.centered}
        />
      </ScreenContainer>
    );
  }

  // Boş katalog (Faz 2c): sunucu 200 döndü ama içerik yok — hata değil.
  if (!heroItem && rails.length === 0) {
    return (
      <ScreenContainer>
        <EmptyView
          title={t('empty.catalogTitle')}
          body={t('empty.catalogBody')}
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

        {offline ? <OfflineBanner /> : null}

        {/* Yönetilen banner'lar (admin API'den) — sinematik üst şerit */}
        {banners.length > 0 ? (
          <View style={styles.bannerRow}>
            {banners.slice(0, 2).map((banner) => (
              <Pressable
                key={banner.id}
                accessibilityRole="button"
                accessibilityLabel={banner.title}
                onPress={() => {
                  if (banner.targetContentSlug) {
                    router.push({
                      pathname: '/content/[id]',
                      params: { id: banner.targetContentSlug },
                    });
                  }
                }}
                style={[styles.bannerCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
              >
                <AppText variant="heading" numberOfLines={1}>
                  {banner.title}
                </AppText>
                {banner.subtitle ? (
                  <AppText variant="caption" color="textMuted" numberOfLines={1}>
                    {banner.subtitle}
                  </AppText>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {heroItem ? (
          <HeroBanner
            item={heroItem}
            tagline={heroDetail.data?.tagline}
            episodeCount={
              heroDetail.data && heroDetail.data.kind === 'SERIES'
                ? heroDetail.data.seasons.reduce(
                    (sum: number, season: { episodes: unknown[] }) => sum + season.episodes.length,
                    0
                  )
                : undefined
            }
            seasonCount={heroDetail.data?.seasons.length || undefined}
            onPlay={() =>
              router.push({ pathname: '/content/[id]', params: { id: heroItem.slug } })
            }
            onDetail={() =>
              router.push({ pathname: '/content/[id]', params: { id: heroItem.slug } })
            }
          />
        ) : null}

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
              {continueEntries.map((entry) => (
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
              onItemPress={(item: ContentSummary) =>
                router.push({ pathname: '/content/[id]', params: { id: item.slug } })
              }
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
            {(categories.data?.items ?? []).slice(0, MAX_CATEGORIES).map((category) => (
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
            {categories.isPending
              ? [0, 1, 2].map((index) => (
                  <View
                    key={`cat_skeleton_${index}`}
                    style={[
                      styles.categoryCard,
                      styles.categorySkeleton,
                      { backgroundColor: theme.colors.surfaceElevated, borderColor: 'transparent' },
                    ]}
                  />
                ))
              : null}
          </View>
        </View>

        {sections.length === 0 && banners.length === 0 ? (
          <EmptyView
            title={t('empty.catalogTitle')}
            body={t('empty.catalogBody')}
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
    bannerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing[2],
      paddingHorizontal: spacing[4],
      marginBottom: spacing[3],
    },
    bannerCard: {
      flexGrow: 1,
      flexBasis: '46%',
      minHeight: 64,
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      gap: 2,
      justifyContent: 'center',
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
    categorySkeleton: {
      opacity: 0.6,
    },
  });
