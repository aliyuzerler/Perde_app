/**
 * Çevrimdışı uyarı şeridi — ekran üstünde kalıcı bağlantı durumu bildirimi.
 * Sadece kesin çevrimdışı bilgi gösterilir (bilinmeyen durumda yanlış alarm yok).
 */
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { AppText } from '@/components/ui/app-text';
import { radius, spacing } from '@/theme/tokens';

export function OfflineBanner() {
  const { theme } = useTheme();
  const t = useT();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={t('offline.banner')}
      style={[styles.banner, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.textMuted} />
      <AppText variant="caption" color="textMuted" style={styles.text}>
        {t('offline.banner')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
  },
});
