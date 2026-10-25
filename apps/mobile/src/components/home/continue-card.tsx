/**
 * İzlemeye devam kartı — dikey poster + ilerleme çubuğu + kalan süre.
 * Kaynak: yerel playback-store (PlaybackEntry) veya sunucu watch-progress
 * (WatchProgressItem → toContinueEntry ile eşlenir; Faz 2c).
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { PosterCard } from '@/components/ui/poster-card';
import { radius, spacing } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';

/** Sunucu ve yerel ilerleme kayıtlarının ortak görünümü (erişim etiketi opsiyonel). */
export interface ContinueEntry {
  contentId: string;
  contentTitle: string;
  episodeId: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  verticalPreviewUrl?: string | null;
  posterUrl?: string | null;
  accessType?: 'FREE' | 'SUBSCRIPTION' | 'CREDIT';
}

export interface ContinueCardProps {
  entry: ContinueEntry;
  width?: number;
  onPress: () => void;
}

export const ContinueCard = memo(function ContinueCard({
  entry,
  width = 156,
  onPress,
}: ContinueCardProps) {
  const { theme } = useTheme();
  const ratio = Math.min(1, entry.positionSeconds / entry.durationSeconds);
  const remaining = Math.max(0, entry.durationSeconds - entry.positionSeconds);

  return (
    <View style={{ width }}>
      <PosterCard
        title={entry.contentTitle}
        metaText={`${formatDuration(remaining)} kaldı`}
        aspect="vertical"
        imageUrl={entry.verticalPreviewUrl ?? entry.posterUrl ?? null}
        accessType={entry.accessType ?? 'FREE'}
        width={width}
        onPress={onPress}
      />
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round(ratio * 100)}%`, backgroundColor: theme.colors.accent },
          ]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(245, 241, 234, 0.14)',
    marginTop: spacing[1],
    borderRadius: radius.none,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.none,
  },
});
