/**
 * E-posta doğrulama bildirim ekranı (kayıt/giriş sonrası).
 * Yeniden gönderme butonu; mock modda anahtar mock kutusuna düşer.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { useDescribeApiError } from '@/utils/api-error';

export default function VerifyEmailNoticeScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const styles = getStyles();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    if (!email) return;
    setSending(true);
    setError(null);
    try {
      await contentApi.resendVerification(email);
      setSent(true);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.body}>
        <Ionicons name="mail-outline" size={56} color={theme.colors.accent} />
        <AppText variant="display">{t('auth.verifyNoticeTitle')}</AppText>
        <AppText variant="body" color="textMuted">
          {t('auth.verifyNoticeBody', { email })}
        </AppText>
        <AppText variant="caption" color="textSubtle">
          {t('auth.verifyNoticeHint')}
        </AppText>

        {sent ? (
          <AppText variant="caption" accessibilityLiveRegion="polite">
            {t('auth.resendSent')}
          </AppText>
        ) : null}
        {error ? (
          <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}

        <AppButton
          label={t('auth.resendVerification')}
          onPress={() => void resend()}
          disabled={sending || !email}
          variant="secondary"
        />
        <AppButton
          label={t('auth.forgotGoBack')}
          onPress={() => router.replace('/auth/login')}
        />
      </View>
    </ScreenContainer>
  );
}

const getStyles = () => ({
  body: {
    flex: 1,
    padding: 16,
    paddingTop: 48,
    gap: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
