/**
 * Oynatıcı durum görünümleri (FAZ 4) — tampon/hata/çevrimdışı/bölüm sonu.
 *
 * Davranışlar (görev maddeleri):
 *  - İnternet kesintisi → stalled görünümü + tekrar deneme
 *  - Oynatma hatası     → error görünümü + tekrar deneme
 *  - Bölüm sonu         → baştan oynat / sonraki bölüm (geri sayımlı) / kapat
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useT } from '@/i18n';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { colors as designColors } from '@/theme/tokens';
import type { EpisodeNeighbor } from '@/hooks/player/use-episode-neighbors';

/** RN 0.88 tip kümesinde absoluteFillObject yok — eşdeğeri yerel sabit. */
const absoluteFill = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

/** Yarı saydam zemin — sahne görünür kalır (tema token'ı ile). */
function Overlay({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={[styles.overlay, { backgroundColor: designColors.overlay }]}>
      <View style={styles.overlayInner}>{children}</View>
    </View>
  );
}

/** Tampon spinner (pulse animasyonu). */
export function BufferingOverlay(): React.JSX.Element {
  const pulse = useSharedValue(0.5);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const t = useT();
  return (
    <View style={styles.buffering} pointerEvents="none">
      <Animated.View style={style}>
        <Ionicons name="sync" size={34} color="#F5F1EA" />
      </Animated.View>
      <AppText variant="caption" color="textSubtle">
        {t('player.buffering')}
      </AppText>
    </View>
  );
}

export interface PlaybackErrorOverlayProps {
  /** true → ağ yok (çevrimdışı); false → oynatma hatası. */
  offline: boolean;
  onRetry: () => void;
}

export function PlaybackErrorOverlay({ offline, onRetry }: PlaybackErrorOverlayProps): React.JSX.Element {
  const t = useT();
  return (
    <Overlay>
      <Ionicons name="cloud-offline" size={34} color="#F5F1EA" />
      <AppText variant="heading">{offline ? t('player.offlineTitle') : t('player.errorTitle')}</AppText>
      <AppText variant="body" color="textMuted">
        {offline ? t('player.offlineBody') : t('player.errorBody')}
      </AppText>
      <AppButton label={t('common.retry')} onPress={onRetry} />
    </Overlay>
  );
}

export interface EndOverlayProps {
  hasNext: boolean;
  /** Geri sayım saniyesi (sonraki bölüme otomatik geçiş; null → kapalı). */
  countdownSeconds: number | null;
  nextEpisode: EpisodeNeighbor | null;
  onReplay: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Bölüm sonu kaplaması. Geri sayım bileşen İÇİNDEDİR: montaj anında başlar
 * (effect gövdesinde senkron setState yok — React Compiler uyumlu),
 * "Vazgeç" ile iptal edilir, süre dolduğunda onNext tetiklenir.
 */
export function EndOverlay({
  hasNext,
  countdownSeconds,
  nextEpisode,
  onReplay,
  onNext,
  onClose,
}: EndOverlayProps): React.JSX.Element {
  const t = useT();
  const countdownEnabled = hasNext && countdownSeconds !== null && countdownSeconds > 0;
  const [autoNext, setAutoNext] = useState(countdownEnabled);
  const [endsAt] = useState(() =>
    countdownEnabled ? Date.now() + countdownSeconds! * 1000 : null
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!autoNext) return;
    const interval = setInterval(() => setNow(Date.now()), 500); // zamanlayıcı: senkron değil
    return () => clearInterval(interval);
  }, [autoNext]);

  const remaining = endsAt !== null && autoNext ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;

  // Süre dolduğunda sonraki bölüme geç (yan etki; setState yok).
  useEffect(() => {
    if (remaining !== null && remaining <= 0) {
      onNext();
    }
  }, [remaining, onNext]);

  return (
    <Overlay>
      <Ionicons name="checkmark-circle" size={34} color="#F5F1EA" />
      <AppText variant="heading">{t('player.endTitle')}</AppText>
      {nextEpisode ? (
        <AppText variant="body" color="textMuted" numberOfLines={1}>
          {t('player.nextEpisodeLabel', {
            season: nextEpisode.seasonNumber,
            episode: nextEpisode.episodeNumber,
            title: nextEpisode.title,
          })}
        </AppText>
      ) : null}
      {hasNext && remaining !== null ? (
        <>
          <AppText variant="caption" color="textSubtle">
            {t('player.nextCountdown', { seconds: remaining })}
          </AppText>
          <View style={styles.actions}>
            <AppButton
              label={t('player.cancelAutoNext')}
              variant="secondary"
              onPress={() => setAutoNext(false)}
            />
            <AppButton label={t('player.playNext')} onPress={onNext} />
          </View>
        </>
      ) : (
        <View style={styles.actions}>
          <AppButton label={t('player.replay')} variant="secondary" onPress={onReplay} />
          {hasNext ? <AppButton label={t('player.playNext')} onPress={onNext} /> : null}
          <AppButton label={t('common.close')} variant="secondary" onPress={onClose} />
        </View>
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  overlayInner: {
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  buffering: {
    ...absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
