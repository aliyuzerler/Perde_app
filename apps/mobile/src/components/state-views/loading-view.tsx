/** Yüklenme durumu: kart iskeletleri (shimmer'sız, sabit opaklık — Faz 1). */
import { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme';
import {
  ASPECT_RATIOS,
  radius,
  spacing,
} from '@/theme/tokens';

export interface LoadingViewProps {
  variant: 'rails' | 'detail' | 'list';
  style?: ViewStyle;
}

const SKELETON_RAIL_COUNT = 3;

export const LoadingView = memo(function LoadingView({
  variant,
  style,
}: LoadingViewProps) {
  const { theme } = useTheme();
  const skeletonColor = { backgroundColor: theme.colors.surfaceElevated };

  if (variant === 'rails') {
    return (
      <View style={[styles.container, style]} accessibilityRole="progressbar" accessibilityLabel="Yükleniyor">
        {[0, 1].map((rowIndex) => (
          <View key={rowIndex} style={styles.railRow}>
            <View style={[styles.headerBar, skeletonColor]} />
            <View style={styles.rail}>
              {Array.from({ length: SKELETON_RAIL_COUNT }, (_, index) => (
                <View
                  key={index}
                  style={[
                    styles.posterSkeleton,
                    skeletonColor,
                    { aspectRatio: ASPECT_RATIOS.poster, width: 120 },
                  ]}
                />
              ))}
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (variant === 'detail') {
    return (
      <View style={[styles.container, style]} accessibilityRole="progressbar" accessibilityLabel="Yükleniyor">
        <View style={[skeletonColor, { aspectRatio: ASPECT_RATIOS.wide, borderRadius: radius.none }]} />
        <View style={[styles.headerBar, skeletonColor, { width: '60%' }]} />
        <View style={[styles.line, skeletonColor, { width: '90%' }]} />
        <View style={[styles.line, skeletonColor, { width: '75%' }]} />
      </View>
    );
  }

  return (
    <View style={[styles.container, style]} accessibilityRole="progressbar" accessibilityLabel="Yükleniyor">
      {[0, 1, 2].map((rowIndex) => (
        <View key={rowIndex} style={styles.listRow}>
          <View
            style={[
              styles.listThumb,
              skeletonColor,
              { aspectRatio: ASPECT_RATIOS.poster },
            ]}
          />
          <View style={styles.listLines}>
            <View style={[styles.line, skeletonColor, { width: '70%' }]} />
            <View style={[styles.line, skeletonColor, { width: '45%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    padding: spacing[4],
    gap: spacing[4],
  },
  railRow: {
    gap: spacing[3],
  },
  headerBar: {
    width: 140,
    height: 18,
    borderRadius: radius.sm,
  },
  rail: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  posterSkeleton: {
    borderRadius: radius.md,
  },
  detailHero: {},
  line: {
    height: 14,
    borderRadius: radius.sm,
  },
  listRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  listThumb: {
    width: 72,
    borderRadius: radius.md,
  },
  listLines: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing[2],
  },
});
