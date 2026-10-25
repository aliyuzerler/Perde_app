/**
 * Parola sıfırlama ekranı — derin bağlantı hedefi:
 * {PUBLIC_BASE_URL}/auth/reset-password?token=...
 * Yeni parola (çift giriş teyidi) → sunucuda tüm oturumlar kapatılır.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AuthField } from '@/components/ui/auth-field';
import { useDescribeApiError, PASSWORD_POLICY_RE } from '@/utils/api-error';

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = params.token ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!token) {
      setError(t('auth.errorTokenInvalid'));
      return;
    }
    if (password.length < 8 || !PASSWORD_POLICY_RE.test(password)) {
      setError(t('auth.passwordPolicy'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await contentApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.body}>
        {done ? (
          <>
            <Ionicons name="lock-closed-outline" size={56} color="#2e7d32" />
            <AppText variant="title" style={styles.center}>
              {t('auth.resetSuccess')}
            </AppText>
            <AppButton
              label={t('auth.forgotGoBack')}
              onPress={() => router.replace('/auth/login')}
            />
          </>
        ) : (
          <>
            <AppText variant="display">{t('auth.resetTitle')}</AppText>
            <AppText variant="caption" color="textSubtle">
              {t('auth.passwordPolicy')}
            </AppText>
            <AuthField
              label={t('auth.newPasswordLabel')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              secureToggle
            />
            <AuthField
              label={t('auth.newPasswordConfirmLabel')}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              secureToggle
            />
            {error ? (
              <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
                {error}
              </AppText>
            ) : null}
            <AppButton
              label={t('auth.resetCta')}
              onPress={() => void submit()}
              disabled={submitting}
            />
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    padding: 16,
    paddingTop: 48,
    gap: 12,
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
