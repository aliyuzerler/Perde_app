/** Boş durum: ikon + başlık + açıklama + (opsiyonel) eylem. */
import { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

export interface EmptyViewProps {
  title: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}

export const EmptyView = memo(function EmptyView({
  title,
  body,
  ctaLabel,
  onCtaPress,
  icon = 'film-outline',
  style,
}: EmptyViewProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.container, style]}>
      <Ionicons name={icon} size={40} color={theme.colors.textSubtle} />
      <AppText variant="heading" style={styles.title}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" color="textMuted" style={styles.body}>
          {body}
        </AppText>
      ) : null}
      {ctaLabel && onCtaPress ? (
        <AppButton label={ctaLabel} onPress={onCtaPress} style={styles.cta} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing[6],
    gap: spacing[3],
    minHeight: 220,
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    maxWidth: 280,
  },
  cta: {
    marginTop: spacing[2],
    minWidth: 180,
  },
});
