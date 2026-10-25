/**
 * Şifremi unuttum ekranı — e-posta ister; yanıt daima olumlu (sayım engeli
 * sunucu kuralı). Başarı durumu: gönderildi ekranı.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AuthField } from '@/components/ui/auth-field';
import { useDescribeApiError } from '@/utils/api-error';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const styles = getStyles();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t('auth.invalidEmail'));
      return;
    }
    setEmailError(null);
    setFormError(null);
    setSubmitting(true);
    try {
      await contentApi.forgotPassword(email.trim());
      setSent(true);
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.body}>
        {sent ? (
          <>
            <Ionicons name="mail-open-outline" size={56} color={theme.colors.accent} />
            <AppText variant="display">{t('auth.forgotSentTitle')}</AppText>
            <AppText variant="body" color="textMuted" style={styles.center}>
              {t('auth.forgotSentBody')}
            </AppText>
            <AppButton
              label={t('auth.forgotGoBack')}
              onPress={() => router.replace('/auth/login')}
            />
          </>
        ) : (
          <>
            <AppText variant="display">{t('auth.forgotTitle')}</AppText>
            <AppText variant="body" color="textMuted">
              {t('auth.forgotBody')}
            </AppText>
            <AuthField
              label={t('auth.emailLabel')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              error={emailError}
            />
            {formError ? (
              <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
                {formError}
              </AppText>
            ) : null}
            <AppButton
              label={t('auth.forgotCta')}
              onPress={() => void submit()}
              disabled={submitting}
            />
            <AppButton
              label={t('auth.forgotGoBack')}
              onPress={() => router.back()}
              variant="secondary"
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
const getStyles = () => styles;
