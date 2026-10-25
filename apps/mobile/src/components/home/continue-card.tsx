/**
 * İzlemeye devam kartı — dikey poster + ilerleme çubuğu + kalan süre.
 * İlerleme bilgisi playback-store'dan gelir (gerçek yerel veri).
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';
import { PosterCard } from '@/components/ui/poster-card';
import { radius, spacing } from '@/theme/tokens';
import { formatDuration } from '@/utils/format';
import type { PlaybackEntry } from '@/store/playback-store';

export interface ContinueCardProps {
  entry: PlaybackEntry;
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
        accessType={entry.accessType}
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
