/**
 * E-posta doğrulama ekranı — derin bağlantı hedefi:
 * {PUBLIC_BASE_URL}/auth/verify-email?token=...
 * Anahtar tüketilir; sonuç ekranı başarı/hata gösterir.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { useDescribeApiError } from '@/utils/api-error';
import { spacing } from '@/theme/tokens';

export default function VerifyEmailScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = params.token ?? '';

  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        if (!cancelled) setState('fail');
        return;
      }
      try {
        await contentApi.verifyEmail(token);
        if (!cancelled) setState('ok');
      } catch (error) {
        if (!cancelled) {
          setState('fail');
          setMessage(describeError(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, describeError]);

  return (
    <ScreenContainer>
      <View style={styles.body}>
        {state === 'loading' ? (
          <AppText variant="body" color="textMuted">
            ...
          </AppText>
        ) : state === 'ok' ? (
          <>
            <Ionicons name="checkmark-circle" size={64} color="#2e7d32" />
            <AppText variant="title" style={styles.center}>
              {t('auth.verifySuccess')}
            </AppText>
            <AppButton
              label={t('auth.verifyGoLogin')}
              onPress={() => router.replace('/auth/login')}
            />
          </>
        ) : (
          <>
            <Ionicons name="close-circle" size={64} color={theme.colors.accent} />
            <AppText variant="title" style={styles.center}>
              {message ?? t('auth.errorTokenInvalid')}
            </AppText>
            <AppButton
              label={t('auth.forgotGoBack')}
              onPress={() => router.replace('/auth/login')}
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
    padding: spacing[4],
    paddingTop: spacing[6],
    gap: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
});
