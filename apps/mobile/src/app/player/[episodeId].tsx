/**
 * Dikey video oynatıcı arayüzü (Faz 3 — UI katmanı).
 *
 * DÜRÜST KAPSAM: gerçek video akışı Faz 4'te (expo-video + HLS) devreye
 * alınacaktır. Bu ekran oynatma ARAYÜZÜNÜ ve ilerleme durumunu gerçek biçimde
 * yönetir: zamanlayıcıyla simüle edilen ilerleme playback-store'a YAZILIR ve
 * ana sayfadaki "İzlemeye devam et" ile Planım > Geçmiş gerçekten çalışır.
 * Sahte bir "video oynadı" izlenimi verilmez (demoNotice görünürdür).
 *
 * Kilit davranışı: erişim türü sunucu sözleşmesinden gelir (accessType).
 * SUBSCRIPTION → cüzdan durumu TRIALING/ACTIVE ise açık; CREDIT → bakiye
 * yeterliyse açılır (mock); FREE → her zaman açık.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Pressable, AppState } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { useContentDetail } from '@/hooks/queries/use-content-detail';
import { queryKeys } from '@/hooks/queries/query-keys';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { usePlaybackStore, type PlaybackEntry } from '@/store/playback-store';
import { colors as palette, spacing } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

/** Kredili bölümün mock maliyeti (sunucu Faz 5'te creditCost ile verecek). */
const CREDIT_EPISODE_COST = 80;

export default function PlayerScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const params = useLocalSearchParams<{ episodeId: string; contentId?: string }>();
  const episodeId = typeof params.episodeId === 'string' ? params.episodeId : '';
  const contentIdParam = typeof params.contentId === 'string' ? params.contentId : '';

  const detail = useContentDetail(contentIdParam);
  const wallet = useQuery({
    queryKey: queryKeys.wallet,
    queryFn: () => contentApi.getWallet(),
  });

  const saveProgress = usePlaybackStore((state) => state.saveProgress);
  const savedEntry = usePlaybackStore((state) =>
    state.entries[episodeId]
  );

  const content = detail.data;
  const episode = useMemo(() => {
    if (!content) return undefined;
    for (const season of content.seasons) {
      const found = season.episodes.find((entry) => entry.id === episodeId);
      if (found) return found;
    }
    return undefined;
  }, [content, episodeId]);

  const nextEpisode = useMemo(() => {
    if (!content || !episode) return undefined;
    for (const season of content.seasons) {
      const idx = season.episodes.findIndex((entry) => entry.id === episodeId);
      if (idx >= 0 && idx + 1 < season.episodes.length) {
        return season.episodes[idx + 1];
      }
    }
    return undefined;
  }, [content, episode, episodeId]);

  const subscriptionActive =
    wallet.data?.wallet.subscriptionStatus === 'ACTIVE' ||
    wallet.data?.wallet.subscriptionStatus === 'TRIALING';
  const creditBalance = wallet.data?.wallet.creditBalance ?? 0;
  const locked = episode
    ? episode.accessType === 'SUBSCRIPTION'
      ? !subscriptionActive
      : episode.accessType === 'CREDIT'
        ? creditBalance < CREDIT_EPISODE_COST
        : false
    : true;

  // ---- Oynatma durumu (simülasyon) ----
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(savedEntry?.positionSeconds ?? 0);
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  const resumedShown = savedEntry !== undefined && savedEntry.positionSeconds > 5;
  const pulse = useSharedValue(0.6);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true);
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const persist = useCallback(() => {
    if (!content || !episode) return;
    const entry: PlaybackEntry = {
      contentId: content.id,
      contentTitle: content.title,
      episodeId: episode.id,
      episodeTitle: episode.title,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      positionSeconds: Math.round(positionRef.current),
      durationSeconds: episode.durationSeconds,
      verticalPreviewUrl: episode.verticalPreviewUrl ?? null,
      posterUrl: content.posterUrl ?? null,
      accessType: episode.accessType,
      updatedAt: Date.now(),
    };
    saveProgress(entry);
  }, [content, episode, saveProgress]);

  // Zamanlayıcı: saniyede 1 ilerlet (gerçek akış Faz 4'te oynatıcı konumundan okur).
  useEffect(() => {
    if (!playing || !episode) return;
    const timer = setInterval(() => {
      setPosition((prev) => Math.min(prev + 1, episode.durationSeconds));
    }, 1000);
    return () => clearInterval(timer);
  }, [playing, episode]);

  // Her 5 saniyede ve uygulama arka plana geçtiğinde ilerlemeyi kaydet.
  useEffect(() => {
    if (!playing) return;
    const saveTimer = setInterval(persist, 5000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        setPlaying(false);
        persist();
      }
    });
    return () => {
      clearInterval(saveTimer);
      subscription.remove();
    };
  }, [playing, persist]);

  // Ekran kapanırken son pozisyonu kaydet.
  useEffect(() => {
    return () => {
      persist();
    };
  }, [persist]);

  if (detail.isPending) {
    return (
      <View style={styles.root}>
        <LoadingView variant="detail" />
      </View>
    );
  }

  if (detail.isError || !content || !episode) {
    return (
      <View style={styles.root}>
        <ErrorView
          title={t('content.notFoundTitle')}
          body={t('content.notFoundBody')}
          onRetry={() => router.back()}
          retryLabel={t('common.close')}
          style={styles.centered}
        />
      </View>
    );
  }

  const progressRatio = Math.min(1, position / episode.durationSeconds);

  return (
    <View style={styles.root}>
      {/* Dikey sinematik zemin (9:16) — Faz 4'te gerçek video replaces */}
      <View style={styles.stage}>
        <Animated.View style={[styles.glow, pulseStyle]}>
          <LinearGradient
            colors={[palette.accent, 'rgba(183,28,54,0.1)', palette.bg]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(13,13,15,0.85)', palette.bg]}
          style={styles.bottomScrim}
        />
      </View>

      {/* Üst bar */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => {
            setPlaying(false);
            persist();
            router.back();
          }}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-down" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <AppText variant="heading" numberOfLines={1}>
            {content.title}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            {t('player.seasonEpisodeLabel', {
              season: episode.seasonNumber,
              episode: episode.episodeNumber,
            })}{' '}
            • {episode.title}
          </AppText>
        </View>
      </View>

      {/* Orta kontrol */}
      <View style={styles.center}>
        {!locked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? t('common.cancel') : t('content.watchCta')}
            onPress={() => setPlaying((prev) => !prev)}
            style={styles.playButton}
          >
            <Ionicons
              name={playing ? 'pause' : 'play'}
              size={40}
              color={theme.colors.text}
            />
          </Pressable>
        ) : (
          <Ionicons
            name="lock-closed"
            size={40}
            color={theme.colors.textMuted}
          />
        )}
        {resumedShown ? (
          <AppText variant="caption" color="textSubtle" style={styles.resumeNote}>
            {t('player.resumeNotice')}
          </AppText>
        ) : null}
      </View>

      {/* Alt panel */}
      <View style={styles.bottomPanel}>
        {locked ? (
          <View style={styles.lockedPanel}>
            <AppText variant="heading">{t('player.lockedTitle')}</AppText>
            <AppText variant="body" color="textMuted">
              {episode.accessType === 'SUBSCRIPTION'
                ? t('player.lockedSubscriptionBody')
                : t('player.lockedCreditBody', { count: CREDIT_EPISODE_COST })}
            </AppText>
            <View style={styles.lockActions}>
              {episode.accessType === 'SUBSCRIPTION' ? (
                <AppButton
                  label={t('player.unlockWithSubscription')}
                  onPress={() => router.push('/paywall')}
                />
              ) : (
                <AppButton
                  label={t('player.unlockWithCredits', { count: CREDIT_EPISODE_COST })}
                  onPress={() => router.push('/credits')}
                />
              )}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progressRatio * 100)}%` },
                  ]}
                />
              </View>
            </View>
            <View style={styles.timeRow}>
              <AppText variant="caption" color="textSubtle">
                {formatDuration(position)}
              </AppText>
              <AppText variant="caption" color="textSubtle">
                -{formatDuration(Math.max(0, episode.durationSeconds - position))}
              </AppText>
            </View>
            <View style={styles.actions}>
              {nextEpisode ? (
                <View style={styles.action}>
                  <AppButton
                    label={t('player.nextEpisode')}
                    variant="secondary"
                    onPress={() => {
                      setPlaying(false);
                      persist();
                      router.replace({
                        pathname: '/player/[episodeId]',
                        params: {
                          episodeId: nextEpisode.id,
                          contentId: content.id,
                        },
                      });
                      setPosition(0);
                      setPlaying(true);
                    }}
                  />
                </View>
              ) : null}
            </View>
            <AppText variant="caption" color="textSubtle" style={styles.demoNote}>
              {t('player.demoNotice')}
            </AppText>
          </>
        )}
      </View>
    </View>
  );
}

// Kilit kararı yukarıda accessType + cüzdan durumuyla veriliyor.

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
    },
    stage: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: palette.bg,
    },
    glow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    bottomScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing[3],
      paddingTop: spacing[5],
      gap: spacing[2],
    },
    iconButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleWrap: {
      flex: 1,
      gap: 2,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[3],
    },
    playButton: {
      minHeight: 84,
      minWidth: 84,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: 'rgba(245, 241, 234, 0.3)',
      backgroundColor: 'rgba(13, 13, 15, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    resumeNote: {
      textAlign: 'center',
    },
    bottomPanel: {
      padding: spacing[4],
      paddingBottom: spacing[6],
      gap: spacing[2],
    },
    progressRow: {
      flexDirection: 'row',
    },
    progressTrack: {
      flex: 1,
      height: 4,
      backgroundColor: 'rgba(245, 241, 234, 0.18)',
      borderRadius: 0,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: palette.accent,
      borderRadius: 0,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    actions: {
      flexDirection: 'row',
      gap: spacing[2],
      marginTop: spacing[2],
    },
    action: {
      flex: 1,
    },
    demoNote: {
      textAlign: 'center',
      marginTop: spacing[1],
    },
    lockedPanel: {
      gap: spacing[2],
      backgroundColor: 'rgba(13, 13, 15, 0.72)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 4,
      padding: spacing[4],
    },
    lockActions: {
      flexDirection: 'row',
      gap: spacing[2],
      marginTop: spacing[1],
    },
  });
