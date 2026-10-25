/**
 * Giriş ekranı (Faz 3b: gerçek kimlik akışı).
 *
 * - İstemci doğrulaması sunucu sözleşmesiyle aynı kurallar (contracts şeması).
 * - Şifre göster/gizle düğmesi (mobil kural).
 * - Sunucu nedenleri Türkçe mesaja çevrilir: BAD_CREDENTIALS, EMAIL_NOT_VERIFIED
 *   (doğrulama akışına yönlendirme), RATE_LIMITED vb.
 * - Yüklenme durumu düğmede; ağ hatası ayrı mesaj.
 */
import { useState } from 'react';
import { StyleSheet, View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AuthField } from '@/components/ui/auth-field';
import { useAuthStore } from '@/store/auth-store';
import { useDescribeApiError } from '@/utils/api-error';
import { spacing } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const styles = getStyles(theme.colors);
  const setSession = useAuthStore((state) => state.setSession);
  const params = useLocalSearchParams<{ reason?: string }>();
  const sessionExpired = params.reason === 'session-expired';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) nextErrors.email = t('auth.invalidEmail');
    if (password.length === 0) nextErrors.password = t('auth.errorGeneric');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setUnverifiedEmail(null);
    try {
      const session = await contentApi.login({ email: email.trim(), password });
      setSession(session);
      router.replace('/');
    } catch (error) {
      const message = describeError(error);
      const isUnverified =
        (error as { emailNotVerified?: boolean }).emailNotVerified === true;
      setErrors({ form: message });
      if (isUnverified) setUnverifiedEmail(email.trim());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <AppText variant="display">{t('auth.loginTitle')}</AppText>
          {sessionExpired ? (
            <View
              style={styles.sessionNotice}
              accessibilityLiveRegion="polite"
            >
              <AppText variant="label">{t('auth.loginRequiredTitle')}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('auth.loginRequiredBody')}
              </AppText>
            </View>
          ) : (
            <AppText variant="caption" color="textSubtle">
              {t('auth.mockHint')}
            </AppText>
          )}

          <AuthField
            label={t('auth.emailLabel')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            error={errors.email}
          />
          <AuthField
            label={t('auth.passwordLabel')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            secureToggle
            error={errors.password}
          />

          {errors.form ? (
            <View
              style={styles.formError}
              accessibilityLiveRegion="polite"
            >
              <AppText variant="caption" style={{ color: theme.colors.accent }}>
                {errors.form}
              </AppText>
              {unverifiedEmail ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: '/auth/verify-email-notice',
                      params: { email: unverifiedEmail },
                    })
                  }
                  style={styles.linkButton}
                >
                  <AppText variant="label" style={{ color: theme.colors.accent }}>
                    {t('auth.verifyNoticeTitle')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <AppButton
            label={t('auth.loginCta')}
            onPress={() => void submit()}
            disabled={submitting}
          />

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/auth/forgot-password')}
            style={styles.linkButton}
          >
            <AppText variant="body" style={{ color: theme.colors.textMuted }}>
              {t('auth.forgotTitle')}
            </AppText>
          </Pressable>

          <View style={styles.links}>
            <AppText variant="body" color="textMuted">
              {t('auth.noAccount')}
            </AppText>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/auth/register')}
              style={styles.linkButton}
            >
              <AppText variant="body" style={{ color: theme.colors.accent }}>
                {t('auth.goRegister')}
              </AppText>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.guestButton}
          >
            <AppText variant="body" color="textSubtle">
              {t('auth.guestCta')}
            </AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const getStyles = (colors: ReturnType<typeof useTheme>['theme']['colors']) =>
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    body: {
      flex: 1,
      padding: spacing[4],
      paddingTop: spacing[6],
      gap: spacing[3],
      justifyContent: 'center',
    },
    formError: {
      gap: spacing[1],
    },
    sessionNotice: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 4,
      padding: spacing[3],
      gap: spacing[1],
    },
    links: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[2],
      marginTop: spacing[2],
    },
    linkButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing[1],
    },
    guestButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
