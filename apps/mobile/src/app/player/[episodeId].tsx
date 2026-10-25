/**
 * Dikey video oynatıcı (FAZ 4) — GERÇEK video akışı.
 *
 * Mimari:
 *  - Erişim kararı SUNUCUDAN (episode.access — BR-07): kilitli bölümde
 *    oynatma oturumu dahi açılmaz (istemci tahmini yok).
 *  - Oynatma kaynağı oturum yanıtından gelir (imzalı HLS/mp4) — uygulama
 *    koduna video URL'i/anahtarı GÖMÜLMEZ.
 *  - Motor (expo-video) yalnızca VideoStage + video-player-commands içinde
 *    bilinir; kontroller ve durum makinesi motor-agnostiktir.
 *  - İlerleme: 5 sn'de bir sunucuya yazılır (ProgressReporter) + pause/
 *    background/unmount'ta anında; kaldığı yerden devam oturum yanıtıyla.
 *  - Bölüm navigasyonu: key ile tam remount → eski oynatıcı belleği
 *    serbest bırakılır (useVideoPlayer unmount'ta release eder).
 *
 * React Compiler uyumu: player mutasyonları modül komutlarındadır;
 * ref yazımları yalnızca olay geri çağrılarında; countdown türetilmiş
 * değerdir (effect gövdesinde senkron setState yok).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useT } from '@/i18n';
import { useEpisodeDetail } from '@/hooks/queries/use-episode-detail';
import { useTitleDetail } from '@/hooks/queries/use-title-detail';
import { useSaveWatchProgress } from '@/hooks/queries/use-watch-progress';
import { useAuthStore } from '@/store/auth-store';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { LoadingView } from '@/components/state-views/loading-view';
import { ErrorView } from '@/components/state-views/error-view';
import { usePlaybackStore, type PlaybackEntry } from '@/store/playback-store';
import { useNetworkStatus } from '@/hooks/use-network';
import { usePlaybackSession } from '@/hooks/player/use-playback-session';
import { findEpisodeNeighbors } from '@/hooks/player/use-episode-neighbors';
import { VideoStage } from '@/components/player/video-stage';
import { PlayerControls } from '@/components/player/player-controls';
import {
  BufferingOverlay,
  EndOverlay,
  PlaybackErrorOverlay,
} from '@/components/player/player-states';
import {
  derivePhase,
  isSessionExpiring,
  pickPlaybackSource,
  type PlaybackPhase,
} from '@/components/player/playback-machine';
import { ProgressReporter } from '@/components/player/progress-reporter';
import {
  replacePlayerSource,
  restartPlayer,
  seekPlayer,
  setPlayerMuted,
  setPlayerSubtitleTrack,
  setPlayerTimeUpdateInterval,
  startPlayer,
  stopPlayer,
} from '@/components/player/video-player-commands';
import { queryKeys } from '@/hooks/queries/query-keys';
import { palette, spacing } from '@/theme/tokens';

/** Sonraki bölüme otomatik geçiş geri sayımı (sn). */
const AUTO_NEXT_SECONDS = 10;
const RESUME_MIN_SECONDS = 5;
const SESSION_REFRESH_CHECK_MS = 30_000;

export default function PlayerScreen() {
  const params = useLocalSearchParams<{ episodeId: string }>();
  const episodeId = typeof params.episodeId === 'string' ? params.episodeId : '';
  // Bölüm değişiminde tam remount: eski oynatıcı/dinleyiciler bellekten temizlenir.
  return <PlayerScreenContent key={episodeId} episodeId={episodeId} />;
}

function PlayerScreenContent({ episodeId }: { episodeId: string }) {
  const t = useT();
  const styles = getStyles();
  const queryClient = useQueryClient();

  // --- Ref'ler (tümü en üstte) ----------------------------------------------
  /** Otomatik devam bir kez uygulanır — yalnızca olay geri çağrılarında yazılır. */
  const resumeAppliedRef = useRef(false);
  /** timeUpdate'te raporlayıcı beslemesi — olay geri çağrısı erişimi. */
  const positionRef = useRef(0);

  // --- Sunucu verisi ---------------------------------------------------------
  const episodeDetail = useEpisodeDetail(episodeId);
  const serverEpisode = episodeDetail.data;

  // Komşu bölümler: içerik detayındaki accessSeasons'tan (sunucu kararlı).
  const titleDetail = useTitleDetail(serverEpisode?.content.slug ?? '');
  const neighbors = useMemo(
    () => findEpisodeNeighbors(titleDetail.data?.accessSeasons ?? [], episodeId),
    [titleDetail.data, episodeId]
  );

  // Sunucu erişim kararı (BR-07): kilitliyse oturum bile açılmaz.
  const access = serverEpisode?.access ?? null;
  const locked = access ? !access.canPlay : true;

  // --- Oynatma oturumu -------------------------------------------------------
  const sessionQuery = usePlaybackSession(episodeId, !locked);
  const session = sessionQuery.data;
  const source = useMemo(
    () =>
      session
        ? pickPlaybackSource(session.sources, Platform.OS === 'web' ? 'web' : 'native')
        : null,
    [session]
  );

  // --- Oynatıcı (expo-video) -------------------------------------------------
  const [playerStatus, setPlayerStatus] = useState<'idle' | 'loading' | 'readyToPlay' | 'error'>(
    'idle'
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [playToEnd, setPlayToEnd] = useState(false);
  const [position, setPosition] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [subtitleLanguage, setSubtitleLanguage] = useState<string | null>(null);

  const player = useVideoPlayer(source, (p) => {
    setPlayerTimeUpdateInterval(p, 1);
  });

  // --- İlerleme yazımı -------------------------------------------------------
  const content = serverEpisode?.content ?? null;
  const sessionToken = useAuthStore((state) => state.session?.tokens.accessToken ?? null);
  const serverSync = useSaveWatchProgress();
  const saveProgress = usePlaybackStore((state) => state.saveProgress);

  const buildEntry = useCallback(
    (positionSeconds: number): PlaybackEntry | null => {
      if (!serverEpisode || !content) return null;
      return {
        contentId: content.contentId,
        contentTitle: content.title,
        episodeId: serverEpisode.id,
        episodeTitle: serverEpisode.title,
        seasonNumber: serverEpisode.seasonNumber,
        episodeNumber: serverEpisode.episodeNumber,
        positionSeconds,
        durationSeconds: serverEpisode.durationSeconds,
        verticalPreviewUrl: serverEpisode.verticalPreviewUrl ?? null,
        posterUrl: content.posterUrl ?? null,
        accessType: serverEpisode.accessType,
        updatedAt: Date.now(),
      };
    },
    [serverEpisode, content]
  );

  const persistPosition = useCallback(
    (positionSeconds: number) => {
      const entry = buildEntry(positionSeconds);
      if (entry) saveProgress(entry);
      if (sessionToken) {
        void serverSync.mutateAsync({ episodeId, positionSeconds }).catch(() => undefined);
      }
    },
    [buildEntry, saveProgress, serverSync, sessionToken, episodeId]
  );

  // Raporlayıcı render'da bir kez üretilir; en güncel yazım işlevi bağlanır.
  // (Saati örnek kendi içinde alır — render sırasında saf olmayan çağrı yok.)
  const reporter = useMemo(() => new ProgressReporter(), []);
  useEffect(() => {
    reporter.bindFlush(persistPosition);
    return () => {
      // Ekran/kaynak değişimi: bekleyen konumu yaz ve raporlayıcıyı dinlendir.
      void reporter.flushNow();
    };
  }, [reporter, persistPosition]);

  // --- Oynatıcı olayları -----------------------------------------------------
  useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status }) => {
      // Olay geri çağrısı: state/ref yazımı burada uygundur.
      setPlayerStatus(status);
      if (status === 'readyToPlay' && !resumeAppliedRef.current && session) {
        resumeAppliedRef.current = true;
        // Kaldığı yerden devam (5 sn üzeri) + otomatik oynatma (yeni bölümde de).
        if (session.positionSeconds > RESUME_MIN_SECONDS) {
          seekPlayer(player, session.positionSeconds);
        }
        startPlayer(player);
      }
    });
    const playingSub = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
      if (!playing) {
        void reporter.flushNow();
      }
    });
    const endSub = player.addListener('playToEnd', () => {
      setPlayToEnd(true);
      void reporter.flushNow();
    });
    return () => {
      statusSub.remove();
      playingSub.remove();
      endSub.remove();
    };
  }, [player, session, reporter]);

  // timeUpdate: pozisyon + raporlayıcı besleme (ayrı effect — sık çağrılır).
  useEffect(() => {
    const sub = player.addListener('timeUpdate', ({ currentTime }) => {
      const seconds = Math.max(0, currentTime);
      positionRef.current = seconds;
      setPosition(seconds);
      reporter.tick(seconds);
    });
    return () => sub.remove();
  }, [player, reporter]);

  // Medya süresi (metadata) — sunucu metası örnek akıştan farklı olabilir.
  useEffect(() => {
    const sub = player.addListener('sourceLoad', ({ duration }) => {
      if (typeof duration === 'number' && duration > 0) setMediaDuration(duration);
    });
    return () => sub.remove();
  }, [player]);

  const effectiveDuration = mediaDuration > 0 ? mediaDuration : (serverEpisode?.durationSeconds ?? 0);

  // --- Oturum yenileme (TTL bitmeden sessiz geçiş) ---------------------------
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      if (isSessionExpiring(session.expiresAt, Date.now())) {
        void sessionQuery.refetch().then((result) => {
          const fresh = result.data;
          if (fresh) {
            const next = pickPlaybackSource(fresh.sources, Platform.OS === 'web' ? 'web' : 'native');
            replacePlayerSource(player, next);
            seekPlayer(player, positionRef.current);
            if (player.playing) startPlayer(player);
          }
        });
      }
    }, SESSION_REFRESH_CHECK_MS);
    return () => clearInterval(interval);
  }, [session, sessionQuery, player]);

  // --- Arka plan / dönüş ----------------------------------------------------
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        stopPlayer(player);
        void reporter.flushNow();
      } else if (locked) {
        // Paywall/kredi dönüşünde sunucu erişim kararını tazele.
        void queryClient.invalidateQueries({ queryKey: queryKeys.episodeDetail(episodeId) });
      }
    });
    return () => sub.remove();
  }, [player, reporter, locked, episodeId, queryClient]);

  // Ekran kapanırken son pozisyonu yaz (bellek temizliği + kayıp yok).
  useEffect(() => {
    return () => {
      void reporter.flushNow();
      stopPlayer(player);
    };
  }, [player, reporter]);

  // --- Türetilmiş faz --------------------------------------------------------
  const phase: PlaybackPhase = useMemo(
    () =>
      locked
        ? 'locked'
        : derivePhase({
            playerStatus,
            isPlaying,
            playToEnd,
            isOnline: true, // ağ fazı aşağıda çevrimdışı kontrolüyle birleşir
            hasSource: Boolean(source),
          }),
    [locked, playerStatus, isPlaying, playToEnd, source]
  );
  const { connectivity } = useNetworkStatus();
  const isOffline = connectivity === 'offline';
  const effectivePhase: PlaybackPhase = isOffline ? 'stalled' : phase;

  // --- Kontroller ------------------------------------------------------------
  const togglePlay = useCallback(() => {
    if (effectivePhase === 'ended') {
      restartPlayer(player);
      setPlayToEnd(false);
      startPlayer(player);
      return;
    }
    if (player.playing) {
      stopPlayer(player);
      void reporter.flushNow();
    } else {
      startPlayer(player);
    }
  }, [effectivePhase, player, reporter]);

  const restart = useCallback(() => {
    seekPlayer(player, 0);
    setPosition(0);
    setPlayToEnd(false);
    startPlayer(player);
  }, [player]);

  const seek = useCallback(
    (targetSeconds: number) => {
      const clamped = Math.min(Math.max(0, targetSeconds), Math.max(0, effectiveDuration - 0.5));
      seekPlayer(player, clamped);
      setPosition(clamped);
      setPlayToEnd(false);
    },
    [player, effectiveDuration]
  );

  const toggleMute = useCallback(() => {
    const next = !player.muted;
    setPlayerMuted(player, next);
    setMuted(next);
  }, [player]);

  const goToEpisode = useCallback(
    (targetEpisodeId: string) => {
      void reporter.flushNow();
      stopPlayer(player);
      router.replace(`/player/${targetEpisodeId}`);
    },
    [player, reporter]
  );

  // Altyazı seçimi: sunucu listesi ↔ oynatıcı track eşlemesi (native HLS).
  const selectSubtitle = useCallback(
    (language: string | null) => {
      setSubtitleLanguage(language);
      try {
        const tracks = player.availableSubtitleTracks ?? [];
        const match = language
          ? tracks.find((track) => track.language === language) ?? null
          : null;
        setPlayerSubtitleTrack(player, match);
      } catch {
        // Web/simülatörde text track API'si olmayabilir — seçim sessiz uygulanmaz.
      }
    },
    [player]
  );

  // --- Ekran durumları -------------------------------------------------------
  if (episodeDetail.isPending) {
    return (
      <View style={styles.root}>
        <LoadingView variant="detail" />
      </View>
    );
  }

  if (episodeDetail.isError || !serverEpisode || !content) {
    return (
      <View style={styles.root}>
        <ErrorView
          title={t('content.notFoundTitle')}
          body={t('content.notFoundBody')}
          onRetry={() => episodeDetail.refetch()}
          retryLabel={t('common.retry')}
          style={styles.centered}
        />
      </View>
    );
  }

  const subtitle = t('player.seasonEpisodeLabel', {
    season: serverEpisode.seasonNumber,
    episode: serverEpisode.episodeNumber,
  });

  // Kilitli: sunucu kararı + CTA (abonelik/kredi) — oturum açılmaz.
  if (locked) {
    const creditCost = serverEpisode.creditCost ?? null;
    return (
      <View style={styles.root}>
        <LinearGradient
          colors={[palette.accent, 'rgba(183,28,54,0.1)', palette.bg]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.lockedWrap}>
          <View style={styles.lockedPanel}>
            <AppText variant="heading">{t('player.lockedTitle')}</AppText>
            <AppText variant="body" color="textMuted">
              {serverEpisode.accessType === 'SUBSCRIPTION'
                ? t('player.lockedSubscriptionBody')
                : creditCost
                  ? t('player.lockedCreditBody', { count: creditCost })
                  : t('player.lockedBody')}
            </AppText>
            <View style={styles.lockActions}>
              {serverEpisode.accessType === 'SUBSCRIPTION' ? (
                <AppButton label={t('player.unlockWithSubscription')} onPress={() => router.push('/paywall')} />
              ) : (
                <AppButton
                  label={t('player.unlockWithCredits', { count: creditCost ?? 0 })}
                  onPress={() => router.push('/credits')}
                />
              )}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Oturum hatası kilitli karara dönüştüyse (402/403) kilit görünümü.
  const sessionError = sessionQuery.error as { code?: string } | null;
  const showLockedAfterError =
    sessionQuery.isError &&
    (sessionError?.code === 'PAYMENT_REQUIRED' || sessionError?.code === 'FORBIDDEN');

  const subtitleText = session?.textTracks ?? [];

  return (
    <View style={styles.root}>
      <VideoStage player={player} fullscreen={fullscreen} />

      {/* Faz katmanları */}
      {effectivePhase === 'acquiring' || sessionQuery.isPending ? (
        <View style={styles.loadingWrap} pointerEvents="none">
          <ActivityIndicator size="large" color={palette.text} />
          <AppText variant="caption" color="textSubtle">
            {t('player.preparing')}
          </AppText>
        </View>
      ) : null}

      {effectivePhase === 'buffering' ? <BufferingOverlay /> : null}

      {effectivePhase === 'stalled' ? (
        <PlaybackErrorOverlay
          offline
          onRetry={() => {
            if (!source) void sessionQuery.refetch();
            else startPlayer(player);
          }}
        />
      ) : null}

      {effectivePhase === 'error' || (sessionQuery.isError && !showLockedAfterError) ? (
        <PlaybackErrorOverlay offline={false} onRetry={() => sessionQuery.refetch()} />
      ) : null}

      {showLockedAfterError ? (
        <View style={styles.lockedWrap}>
          <View style={styles.lockedPanel}>
            <AppText variant="heading">{t('player.lockedTitle')}</AppText>
            <AppText variant="body" color="textMuted">
              {t('player.lockedServerBody')}
            </AppText>
            <View style={styles.lockActions}>
              <AppButton label={t('common.close')} variant="secondary" onPress={() => router.back()} />
            </View>
          </View>
        </View>
      ) : null}

      {effectivePhase === 'ended' ? (
        <EndOverlay
          hasNext={Boolean(neighbors.next)}
          countdownSeconds={neighbors.next ? AUTO_NEXT_SECONDS : null}
          nextEpisode={neighbors.next}
          onReplay={restart}
          onNext={() => neighbors.next && goToEpisode(neighbors.next.episodeId)}
          onClose={() => {
            void reporter.flushNow();
            router.back();
          }}
        />
      ) : null}

      {/* Kontroller — hata/kilit/kapama katmanlarında gizlenir */}
      {effectivePhase !== 'error' &&
      effectivePhase !== 'stalled' &&
      !showLockedAfterError &&
      effectivePhase !== 'ended' ? (
        <PlayerControls
          title={content.title}
          subtitle={`${subtitle} • ${serverEpisode.title}`}
          playing={isPlaying}
          muted={muted}
          fullscreen={fullscreen}
          textTracks={subtitleText}
          selectedSubtitleLanguage={subtitleLanguage}
          qualityLabel={
            session ? t('player.qualityLabel', { quality: session.quality.join(' · ') }) : null
          }
          positionSeconds={position}
          durationSeconds={effectiveDuration}
          hasPrevious={Boolean(neighbors.previous)}
          hasNext={Boolean(neighbors.next)}
          buffering={effectivePhase === 'buffering' || effectivePhase === 'preparing'}
          onTogglePlay={togglePlay}
          onRestart={restart}
          onSeek={seek}
          onToggleMute={toggleMute}
          onToggleFullscreen={() => setFullscreen((value) => !value)}
          onPrevious={() => neighbors.previous && goToEpisode(neighbors.previous.episodeId)}
          onNext={() => neighbors.next && goToEpisode(neighbors.next.episodeId)}
          onSelectSubtitle={selectSubtitle}
          onClose={() => {
            void reporter.flushNow();
            router.back();
          }}
        />
      ) : null}
    </View>
  );
}

const getStyles = () =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
    },
    loadingWrap: {
      ...{ position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 },
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[2],
    },
    lockedWrap: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: spacing[4],
      paddingBottom: spacing[6],
    },
    lockedPanel: {
      gap: spacing[2],
      backgroundColor: 'rgba(13, 13, 15, 0.72)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(245, 241, 234, 0.08)',
      borderRadius: 4,
      padding: spacing[4],
    },
    lockActions: {
      flexDirection: 'row',
      gap: spacing[2],
      marginTop: spacing[1],
    },
  });
