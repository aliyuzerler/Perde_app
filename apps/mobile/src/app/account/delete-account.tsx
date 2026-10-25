/**
 * Hesap silme ekranı — parola teyitli talep + nefalet/geri alma bilgisi.
 * (Teknik Kural 6: abonelik/satın alma geçmişi/yasal saklama açıklaması
 * ekranda düz dil ile gösterilir.)
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AuthField } from '@/components/ui/auth-field';
import { useAuthStore } from '@/store/auth-store';
import { useDescribeApiError } from '@/utils/api-error';
import { radius, spacing } from '@/theme/tokens';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('tr-TR', { dateStyle: 'long' });
}

export default function DeleteAccountScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const styles = getStyles(theme.colors);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ purgeAt: string } | null>(null);

  const submit = async () => {
    if (!password) {
      setError(t('auth.errorGeneric'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await contentApi.requestAccountDeletion(password);
      // Sunucu tüm oturumları kapattı; istemci oturumunu da temizler.
      setDone({ purgeAt: result.purgeAt });
      clearSession();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {done ? (
          <View style={styles.doneWrap}>
            <Ionicons name="calendar-outline" size={56} color={theme.colors.accent} />
            <AppText variant="title" style={styles.center}>
              {t('auth.deleteAccountSuccess', { purgeAt: formatDate(done.purgeAt) })}
            </AppText>
            <AppText variant="body" color="textMuted" style={styles.center}>
              {t('auth.deleteAccountBody')}
            </AppText>
            <AppButton
              label={t('auth.forgotGoBack')}
              onPress={() => router.replace('/auth/login')}
            />
          </View>
        ) : (
          <>
            <AppText variant="display">{t('auth.deleteAccountTitle')}</AppText>
            <View style={styles.infoBox}>
              <AppText variant="body" color="textMuted">
                {t('auth.deleteAccountBody')}
              </AppText>
            </View>
            <AuthField
              label={t('auth.deleteAccountConfirmLabel')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              secureToggle
            />
            {error ? (
              <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
                {error}
              </AppText>
            ) : null}
            <AppButton
              label={t('auth.deleteAccountCta')}
              onPress={() => void submit()}
              disabled={submitting}
            />
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) => ({
  body: {
    padding: spacing[4],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  infoBox: {
    padding: spacing[3],
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  doneWrap: {
    gap: spacing[3],
    alignItems: 'center' as const,
    paddingVertical: spacing[5],
  },
  center: {
    textAlign: 'center' as const,
  },
});
