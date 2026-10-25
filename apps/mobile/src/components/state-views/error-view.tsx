/**
 * Hata ve ağ kopması durumu.
 * `kind: 'network'` iken bağlantı odaklı mesaj gösterir (Tasarım Zorunlulukları).
 */
import { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { useTheme } from '@/theme';
import { spacing } from '@/theme/tokens';

export interface ErrorViewProps {
  title: string;
  body?: string;
  /** 'network' → uçak ikonu + bağlantı mesajı. */
  kind?: 'generic' | 'network';
  retryLabel?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export const ErrorView = memo(function ErrorView({
  title,
  body,
  kind = 'generic',
  retryLabel = 'Tekrar Dene',
  onRetry,
  style,
}: ErrorViewProps) {
  const { theme } = useTheme();
  const icon =
    kind === 'network' ? 'cloud-offline-outline' : 'alert-circle-outline';

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
      {onRetry ? (
        <AppButton label={retryLabel} onPress={onRetry} variant="secondary" style={styles.retry} />
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
  retry: {
    marginTop: spacing[2],
    minWidth: 160,
  },
});
