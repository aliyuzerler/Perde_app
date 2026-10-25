/**
 * Oynatıcı kontrolleri (FAZ 4) — motor-agnostik arayüz katmanı.
 *
 * İçerik:
 *  - Üst bar: kapat, içerik/bölüm başlığı, tam ekran
 *  - Orta kontrol: oynat/duraklat, baştan başlat
 *  - Alt panel: arama yapılabilir ilerleme çubuğu + süre göstergesi,
 *    sesi aç/kapat, önceki/sonraki bölüm, altyazı seçimi
 *
 * İlerleme çubuğu: basılı sürükleme + dokunma ile arama (PanResponder).
 * Erişilebilirlik: her denetim accessibilityLabel taşır (E2E bu etiketlerle
 * çalışır — AppButton DOM metni tr-TR büyütme dersi).
 */
import { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, PanResponder, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { AppText } from '@/components/ui/app-text';
import { formatDuration } from '@/utils/format';
import { palette, spacing } from '@/theme/tokens';
import type { MediaTextTrack } from '@perdego/contracts';

/** RN 0.88 tip kümesinde absoluteFillObject yok — eşdeğeri yerel sabit. */
const absoluteFill = { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 };

export interface PlayerControlsProps {
  title: string;
  subtitle: string;
  playing: boolean;
  muted: boolean;
  fullscreen: boolean;
  /** Sunucu oturumunun duyurduğu altyazılar (boşsa menü gizlenir). */
  textTracks: readonly MediaTextTrack[];
  selectedSubtitleLanguage: string | null;
  /** Sunucu kalite merdiveni (bilgi amaçlı etiket). */
  qualityLabel: string | null;
  positionSeconds: number;
  durationSeconds: number;
  hasPrevious: boolean;
  hasNext: boolean;
  buffering: boolean;

  onTogglePlay: () => void;
  onRestart: () => void;
  onSeek: (positionSeconds: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectSubtitle: (language: string | null) => void;
  onClose: () => void;
}

function SubtitleMenu({
  textTracks,
  selectedLanguage,
  onSelect,
  styles,
}: {
  textTracks: readonly MediaTextTrack[];
  selectedLanguage: string | null;
  onSelect: (language: string | null) => void;
  styles: ReturnType<typeof getStyles>;
}): React.JSX.Element {
  const t = useT();
  return (
    <View style={styles.subtitleMenu} accessibilityLabel={t('player.subtitleMenu')}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('player.subtitleOff')}
        onPress={() => onSelect(null)}
        style={styles.subtitleItem}
      >
        <AppText variant="caption" color={selectedLanguage === null ? 'text' : 'textMuted'}>
          {t('player.subtitleOff')}
        </AppText>
      </Pressable>
      {textTracks.map((track) => (
        <Pressable
          key={track.language}
          accessibilityRole="button"
          accessibilityLabel={`${t('player.subtitleSelect')}: ${track.label}`}
          onPress={() => onSelect(track.language)}
          style={styles.subtitleItem}
        >
          <AppText variant="caption" color={selectedLanguage === track.language ? 'text' : 'textMuted'}>
            {track.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

export const PlayerControls = memo(function PlayerControls(props: PlayerControlsProps) {
  const {
    title,
    subtitle,
    playing,
    muted,
    fullscreen,
    textTracks,
    selectedSubtitleLanguage,
    qualityLabel,
    positionSeconds,
    durationSeconds,
    hasPrevious,
    hasNext,
    buffering,
    onTogglePlay,
    onRestart,
    onSeek,
    onToggleMute,
    onToggleFullscreen,
    onPrevious,
    onNext,
    onSelectSubtitle,
    onClose,
  } = props;
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  // İz genişliği ref yerine state: ref erişimi render sırasında yasaktır.
  const [trackWidth, setTrackWidth] = useState(0);

  const duration = Math.max(1, durationSeconds);
  const ratio = Math.min(1, Math.max(0, (scrubbing ? scrubPosition : positionSeconds) / duration));

  const onTrackLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const positionFromX = useCallback(
    (x: number): number => {
      const width = Math.max(1, trackWidth);
      return Math.min(1, Math.max(0, x / width)) * duration;
    },
    [trackWidth, duration]
  );

  // PanResponder useMemo ile: render sırasında ref okunmaz, eldivenler
  // yalnızca dokunma olaylarında çalışır (React Compiler uyumlu).
  const panHandlers = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          setScrubbing(true);
          setScrubPosition(positionFromX(event.nativeEvent.locationX));
        },
        onPanResponderMove: (event) => {
          setScrubPosition(positionFromX(event.nativeEvent.locationX));
        },
        onPanResponderRelease: (event) => {
          const target = positionFromX(event.nativeEvent.locationX);
          setScrubbing(false);
          onSeek(Math.round(target));
        },
      }).panHandlers,
    [positionFromX, onSeek]
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Üst bar */}
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-down" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <AppText variant="heading" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" color="textSubtle" numberOfLines={1}>
            {subtitle}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fullscreen ? t('player.exitFullscreen') : t('player.enterFullscreen')}
          onPress={onToggleFullscreen}
          style={styles.iconButton}
        >
          <Ionicons name={fullscreen ? 'contract' : 'expand'} size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Orta kontrol */}
      <View style={styles.center} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.restart')}
          onPress={onRestart}
          style={[styles.iconButton, styles.sideControl]}
        >
          <Ionicons name="play-back" size={26} color={theme.colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? t('player.pause') : t('player.play')}
          onPress={onTogglePlay}
          style={styles.playButton}
        >
          {buffering ? (
            <Ionicons name="sync" size={38} color={theme.colors.text} />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={40} color={theme.colors.text} />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('player.next')}
          onPress={onNext}
          disabled={!hasNext}
          style={[styles.iconButton, styles.sideControl, !hasNext && styles.disabled]}
        >
          <Ionicons name="play-forward" size={26} color={theme.colors.text} />
        </Pressable>
      </View>

      {/* Alt panel */}
      <View style={styles.bottomPanel}>
        {qualityLabel ? (
          <AppText variant="caption" color="textSubtle">
            {qualityLabel}
          </AppText>
        ) : null}

        {/* İlerleme çubuğu (arama yapılabilir) */}
        <View
          style={styles.progressTrack}
          onLayout={onTrackLayout}
          {...panHandlers}
          accessibilityLabel={t('player.seekBar')}
        >
          <View style={styles.progressFillWrapper}>
            <View style={[styles.progressFill, { width: `${Math.round(ratio * 100)}%` }]} />
            <View style={[styles.progressKnob, { left: `${Math.round(ratio * 100)}%` }]} />
          </View>
        </View>

        <View style={styles.timeRow}>
          <AppText variant="caption" color="textSubtle">
            {formatDuration(Math.floor(scrubbing ? scrubPosition : positionSeconds))}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            -{formatDuration(Math.max(0, Math.floor(duration - (scrubbing ? scrubPosition : positionSeconds))))}
          </AppText>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={muted ? t('player.unmute') : t('player.mute')}
            onPress={onToggleMute}
            style={styles.iconButton}
          >
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={theme.colors.text} />
          </Pressable>

          <View style={styles.spacer} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('player.previous')}
            onPress={onPrevious}
            disabled={!hasPrevious}
            style={[styles.iconButton, !hasPrevious && styles.disabled]}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
          </Pressable>

          {/* Altyazı seçimi — yalnızca sunucu altyazı duyuruyorsa görünür */}
          {textTracks.length > 0 ? (
            <View style={styles.subtitleWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('player.subtitleMenu')}
                onPress={() => setSubtitleMenuOpen((open) => !open)}
                style={styles.iconButton}
              >
                <Ionicons
                  name="logo-closed-captioning"
                  size={22}
                  color={selectedSubtitleLanguage ? theme.colors.accent : theme.colors.text}
                />
              </Pressable>
              {subtitleMenuOpen ? (
                <SubtitleMenu
                  textTracks={textTracks}
                  selectedLanguage={selectedSubtitleLanguage}
                  onSelect={(language) => {
                    setSubtitleMenuOpen(false);
                    onSelectSubtitle(language);
                  }}
                  styles={styles}
                />
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('player.next')}
            onPress={onNext}
            disabled={!hasNext}
            style={[styles.iconButton, !hasNext && styles.disabled]}
          >
            <Ionicons name="arrow-forward" size={22} color={theme.colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    root: {
      ...absoluteFill,
      justifyContent: 'space-between',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: spacing[3],
      paddingTop: spacing[5],
      gap: spacing[1],
    },
    iconButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: {
      opacity: 0.35,
    },
    titleWrap: {
      flex: 1,
      gap: 2,
    },
    center: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[5],
    },
    sideControl: {
      opacity: 0.8,
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
    bottomPanel: {
      padding: spacing[4],
      paddingBottom: spacing[6],
      gap: spacing[2],
      backgroundColor: 'rgba(13, 13, 15, 0.55)',
    },
    progressTrack: {
      height: 28,
      justifyContent: 'center',
    },
    progressFillWrapper: {
      height: 4,
      backgroundColor: 'rgba(245, 241, 234, 0.18)',
      borderRadius: 0,
      overflow: 'visible',
    },
    progressFill: {
      height: '100%',
      backgroundColor: palette.accent,
      borderRadius: 0,
    },
    progressKnob: {
      position: 'absolute',
      top: -5,
      width: 14,
      height: 14,
      marginLeft: -7,
      borderRadius: 7,
      backgroundColor: palette.text,
    },
    timeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing[1],
    },
    spacer: {
      flex: 1,
    },
    subtitleWrap: {
      position: 'relative',
    },
    subtitleMenu: {
      position: 'absolute',
      bottom: 52,
      right: 0,
      minWidth: 140,
      backgroundColor: 'rgba(19, 19, 22, 0.96)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 4,
      paddingVertical: spacing[1],
      zIndex: 10,
    },
    subtitleItem: {
      minHeight: 40,
      justifyContent: 'center',
      paddingHorizontal: spacing[3],
    },
  });
