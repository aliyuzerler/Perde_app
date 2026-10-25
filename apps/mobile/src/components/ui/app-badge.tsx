/** Küçük dikdörtgen rozet (Yeni, Üyelere özel, Kredi ile). */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './app-text';
import { useTheme } from '@/theme';

export type BadgeTone = 'accent' | 'neutral' | 'outline';

export interface AppBadgeProps {
  label: string;
  tone?: BadgeTone;
}

export const AppBadge = memo(function AppBadge({
  label,
  tone = 'accent',
}: AppBadgeProps) {
  const { theme } = useTheme();
  const background =
    tone === 'accent'
      ? theme.colors.accent
      : tone === 'neutral'
        ? theme.colors.overlay
        : 'transparent';
  const borderColor = tone === 'outline' ? theme.colors.border : 'transparent';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: background, borderColor },
      ]}
      accessible={false}
    >
      <AppText variant="label" style={styles.label}>
        {label}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  label: {
    letterSpacing: 0.4,
  },
});
