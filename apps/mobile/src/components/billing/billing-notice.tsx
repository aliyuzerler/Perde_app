/**
 * Ödeme durumu bildirimi (Faz 7) — paywall ve kredi mağazasının paylaştığı
 * dürüst durum paneli. Sahte başarı YOK: yapılandırılmamış ödeme veya
 * mağaza SDK'sının olmadığı cihazda satın alma butonları devre dışıdır ve
 * kullanıcıya neden açıkça söylenir.
 */
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/theme/tokens';

export function BillingNotice({
  variant,
}: {
  variant: 'unconfigured' | 'unsupported-device';
}) {
  const { theme } = useTheme();
  const t = useT();
  const message =
    variant === 'unconfigured'
      ? t('billing.notConfiguredTitle')
      : t('billing.unsupportedDeviceTitle');
  const body =
    variant === 'unconfigured'
      ? t('billing.notConfiguredBody')
      : t('billing.unsupportedDeviceBody');

  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: spacing[3],
        padding: spacing[4],
        borderRadius: 4,
        borderWidth: 1,
        borderColor: theme.colors.warning,
        backgroundColor: theme.colors.surface,
        alignItems: 'flex-start',
      }}
    >
      <Ionicons name="information-circle" size={20} color={theme.colors.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label">{message}</AppText>
        <AppText variant="caption" color="textSubtle">
          {body}
        </AppText>
      </View>
    </View>
  );
}
