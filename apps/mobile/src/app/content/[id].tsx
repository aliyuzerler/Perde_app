/**
 * İçerik detayı: hero, üstveri, özet, kadro, sezon/bölümler (Faz 2c — gerçek API).
 *
 * Veri: GET /catalog/titles/:slug → accessSeasons; her bölüm SUNUCU tarafı
 * erişim kararı taşır (access.reason) + kredi maliyeti (creditCost).
 *
 * Favoriler: oturum açıkken sunucu (/watchlist), misafirde yerel liste.
 * Dürüst kapsam: oynatma Faz 4'te devreye alınacaktır; bu ekranda oynat
 * düğmesi sahte oynatma başlatmaz, bilgilendirme gösterir.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { useTitleDetail } from '@/hooks/queries/use-title-detail';
import {
  useFavorites,
  useFavoriteMutations,
  useSessionToken,
} from '@/hooks/queries/use-favorites';
import { ScreenContainer } from '@/components/screen-container';
import { PosterCard } from '@/components/ui/poster-card';
import { AppBadge } from '@/components/ui/app-badge';
import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { useWatchlistStore } from '@/store/watchlist-store';
import { usePlaybackStore } from '@/store/playback-store';
import { ApiClientError } from '@/services/api-client';
import { radius, spacing } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';
import { getAccessVisual } from '@/utils/access';
import type { AccessType, CatalogEpisode } from '@perdego/contracts';

function EpisodeRow({
  episode,
  onPress,
}: {
  episode: CatalogEpisode;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const t = useT();
  const styles = rowStyles(theme.colors);
  const access = getAccessVisual(episode.accessType);
  const serverAccess = episode.access;

  return (
    <View style={styles.row}>
      <PosterCard
        title={episode.title}
        aspect="vertical"
        imageUrl={episode.verticalPreviewUrl ?? null}
        accessType={episode.accessType}
        width={72}
        onPress={onPress}
      />
      <View style={styles.texts}>
        <AppText variant="heading" numberOfLines={1}>
          {t('content.episodeLabel', { number: episode.episodeNumber })}
        </AppText>
        <AppText variant="body" color="textMuted" numberOfLines={1}>
          {episode.title}
        </AppText>
        <View style={styles.metaRow}>
          <AppText variant="caption" color="textSubtle">
            {formatDuration(episode.durationSeconds)}
          </AppText>
          {/* Sunucu kararı: kilitli bölüm kilidi + kredi maliyeti etiketi */}
          {serverAccess && !serverAccess.canPlay ? (
            <Ionicons
              name="lock-closed-outline"
              size={14}
              color={theme.colors.textSubtle}
              style={styles.lockIcon}
            />
          ) : null}
          {episode.accessType === 'CREDIT' && episode.creditCost ? (
            <AppBadge
              label={t('access.creditCost', { count: episode.creditCost })}
              tone="outline"
            />
          ) : null}
          <AppBadge label={t(`access.${access.labelKey}` as 'access.FREE')} tone="neutral" />
        </View>
      </View>
    </View>
  );
}

export default function ContentDetailScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const params = useLocalSearchParams<{ id: string }>();
  // Rota parametresi artık SLUG taşıyor (Faz 2c: /catalog/titles/:slug).
  const slug = typeof params.id === 'string' ? params.id : '';
  const detail = useTitleDetail(slug);

  const sessionToken = useSessionToken();
  const favorites = useFavorites(sessionToken);
  const favoriteMutations = useFavoriteMutations();

  const localFavorites = useWatchlistStore((state) => state.items);
  const addToLocalWatchlist = useWatchlistStore((state) => state.add);
  const removeFromLocalWatchlist = useWatchlistStore((state) => state.remove);

  // Kayıtlı izleme ilerlemesi (varsa "İzlemeye Başla" kaldığı yerden açar).
  const playbackEntries = usePlaybackStore((state) => state.entries);
  const savedEntry = Object.values(playbackEntries).find(
    (entry) => entry.contentId === detail.data?.id
  );

  const [activeSeason, setActiveSeason] = useState(1);

  const content = detail.data;

  const serverInList =
    sessionToken != null &&
    (favorites.data?.items ?? []).some((item) => item.contentId === content?.id);
  const localInList = localFavorites.some((entry) => entry.contentId === content?.id);
  const inList = sessionToken != null ? serverInList : localInList;

  const toggleFavorite = useCallback(() => {
    if (!content) return;
    if (sessionToken != null) {
      // Sunucu favorisi (kimlikli) — idempotent ekle/kaldır.
      if (serverInList) favoriteMutations.remove.mutate(content.id);
      else favoriteMutations.add.mutate(content.id);
      return;
    }
    // Misafir: yerel liste.
    if (localInList) {
      removeFromLocalWatchlist(content.id);
    } else {
      addToLocalWatchlist({
        contentId: content.id,
        slug: content.slug,
        kind: content.kind,
        title: content.title,
        releaseYear: content.releaseYear,
        ageRating: content.ageRating,
        genres: content.genres,
        posterUrl: content.posterUrl,
        verticalPreviewUrl: content.verticalPreviewUrl,
        accessType: content.accessType,
        isNew: content.isNew,
      });
    }
  }, [
    addToLocalWatchlist,
    content,
    favoriteMutations,
    localInList,
    removeFromLocalWatchlist,
    serverInList,
    sessionToken,
  ]);

  const metaLine = useMemo(() => {
    if (!content) return '';
    const parts: string[] = [String(content.releaseYear)];
    if (content.kind === 'SERIES') {
      const seasonCount = content.seasons.length;
      parts.push(`${seasonCount} ${'Sezon'}`);
    } else if (content.durationSeconds) {
      parts.push(formatDuration(content.durationSeconds));
    }
    if (content.ageRating) {
      parts.push(content.ageRating);
    }
    return parts.join(' • ');
  }, [content]);

  const body = useMemo(() => {
    if (!slug || detail.isPending) {
      return <LoadingView variant="detail" />;
    }
    if (detail.isError) {
      const error = detail.error;
      const isNotFound =
        error instanceof ApiClientError && error.code === 'NOT_FOUND';
      const isNetwork =
        error instanceof ApiClientError && error.isNetworkFailure;
      return (
        <ErrorView
          kind={isNetwork ? 'network' : 'generic'}
          title={isNotFound ? t('content.notFoundTitle') : t('error.genericTitle')}
          body={isNotFound ? t('content.notFoundBody') : t('error.genericBody')}
          onRetry={isNotFound ? undefined : () => detail.refetch()}
          style={styles.centered}
        />
      );
    }
    return null;
  }, [slug, detail, t, styles.centered]);

  if (body || !content) {
    return (
      <ScreenContainer>
        {body ?? (
          <ErrorView
            title={t('content.notFoundTitle')}
            body={t('content.notFoundBody')}
            onRetry={() => router.back()}
            retryLabel={t('common.close')}
            style={styles.centered}
          />
        )}
      </ScreenContainer>
    );
  }

  // Erişim kararlı sezonlar (sunucu kararı): sezon seçici + bölüm satırları.
  const accessSeasons = content.accessSeasons;
  const currentSeason =
    accessSeasons.find((season) => season.seasonNumber === activeSeason) ??
    accessSeasons[0];

  /** Oynatma hedefi: önce kayıtlı ilerleme, yoksa ilk bölüm; filmler detay açar. */
  const firstEpisode = accessSeasons[0]?.episodes[0];
  const savedEpisodeId = savedEntry?.episodeId;

  const startPlayback = () => {
    // FILM / SHORT_FILM tek "bölüm" olarak modellenir (seed) — aynı oynatıcıya gider.
    if (savedEpisodeId) {
      router.push({
        pathname: '/player/[episodeId]',
        params: { episodeId: savedEpisodeId, contentId: content.id },
      });
      return;
    }
    if (firstEpisode) {
      router.push({
        pathname: '/player/[episodeId]',
        params: { episodeId: firstEpisode.id, contentId: content.id },
      });
    }
  };

  const openEpisode = (episode: CatalogEpisode) => {
    router.push({
      pathname: '/player/[episodeId]',
      params: { episodeId: episode.id, contentId: content.id },
    });
  };

  const accessLabelMap: Record<AccessType, string> = {
    FREE: t('access.FREE'),
    SUBSCRIPTION: t('access.SUBSCRIPTION'),
    CREDIT: t('access.CREDIT'),
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false}>
        <PosterCard
          title={content.title}
          aspect="wide"
          imageUrl={content.heroImageUrl ?? content.posterUrl ?? null}
          accessType={content.accessType}
          isNew={content.isNew}
        />

        <View style={styles.body}>
          <View style={styles.titleRow}>
            <AppText variant="display" style={styles.title}>
              {content.title}
            </AppText>
          </View>
          {content.tagline ? (
            <AppText variant="body" color="textMuted">
              {content.tagline}
            </AppText>
          ) : null}
          <View style={styles.metaRow}>
            <AppText variant="caption" color="textSubtle">
              {metaLine}
            </AppText>
            <AppBadge label={accessLabelMap[content.accessType]} tone="outline" />
          </View>
          <View style={styles.genreRow}>
            {content.genres.map((genre) => (
              <View key={genre} style={styles.genreChip}>
                <AppText variant="caption" color="textMuted">
                  {genre.replace(/-/g, ' ')}
                </AppText>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <View style={styles.actionButton}>
              <AppButton label={t('content.watchCta')} onPress={startPlayback} />
            </View>
            <View style={styles.actionButton}>
              <AppButton
                label={inList ? t('content.inList') : t('content.addToList')}
                variant={inList ? 'secondary' : 'ghost'}
                onPress={toggleFavorite}
              />
            </View>
          </View>

          <AppText variant="body" style={styles.synopsis}>
            {content.synopsis}
          </AppText>

          {content.cast.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="heading">{t('content.castTitle')}</AppText>
              {content.cast.map((member) => (
                <View key={member.id} style={styles.castRow}>
                  <AppText variant="body">{member.fullName}</AppText>
                  <AppText variant="caption" color="textSubtle">
                    {member.role === 'ACTOR'
                      ? member.characterName
                        ? `${t('content.roleActor')} • ${member.characterName}`
                        : t('content.roleActor')
                      : member.role === 'DIRECTOR'
                        ? t('content.roleDirector')
                        : t('content.roleWriter')}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {content.kind === 'SERIES' && accessSeasons.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="heading">{t('content.episodesTitle')}</AppText>
              {accessSeasons.length > 1 ? (
                <View style={styles.seasonRow}>
                  {accessSeasons.map((season) => {
                    const active = season.seasonNumber === activeSeason;
                    return (
                      <Pressable
                        key={season.id}
                        style={[styles.seasonChip, active && styles.seasonChipActive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={t('content.seasonLabel', {
                          number: season.seasonNumber,
                        })}
                        onPress={() => setActiveSeason(season.seasonNumber)}
                      >
                        <AppText
                          variant="label"
                          style={active ? undefined : { color: theme.colors.textMuted }}
                        >
                          {t('content.seasonLabel', { number: season.seasonNumber })}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <View style={styles.episodeList}>
                {currentSeason?.episodes.map((episode) => (
                  <EpisodeRow
                    key={episode.id}
                    episode={episode}
                    onPress={() => openEpisode(episode)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
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
    body: {
      padding: spacing[4],
      gap: spacing[3],
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    title: {
      flex: 1,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      flexWrap: 'wrap',
    },
    genreRow: {
      flexDirection: 'row',
      gap: spacing[2],
      flexWrap: 'wrap',
    },
    genreChip: {
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      paddingHorizontal: spacing[2],
      paddingVertical: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing[3],
      marginTop: spacing[2],
    },
    actionButton: {
      flex: 1,
    },
    synopsis: {
      marginTop: spacing[1],
    },
    section: {
      marginTop: spacing[3],
      gap: spacing[3],
    },
    castRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingRight: spacing[2],
    },
    seasonRow: {
      flexDirection: 'row',
      gap: spacing[2],
      flexWrap: 'wrap',
    },
    seasonChip: {
      minHeight: 44,
      paddingHorizontal: spacing[3],
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    seasonChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    episodeList: {
      gap: spacing[3],
    },
  });

const rowStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing[3],
      alignItems: 'stretch',
    },
    texts: {
      flex: 1,
      justifyContent: 'center',
      gap: 2,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
      flexWrap: 'wrap',
    },
    lockIcon: {
      marginLeft: spacing[1],
    },
  });
