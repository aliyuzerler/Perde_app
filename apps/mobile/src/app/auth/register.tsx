/**
 * Kayıt ekranı (Faz 3b: gerçek akış).
 *
 * - Şifre politikası sunucu sözleşmesiyle aynı (8+ karakter, harf + rakam).
 * - Kullanım koşulları + gizlilik metinlerine ekran içi erişim (kural).
 * - Kayıt başarısı oturum açar ve e-posta doğrulama bildirim ekranına gider
 *   (giriş, doğrulama öncesi sunucuda engellidir).
 */
import { useState } from 'react';
import { StyleSheet, View, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/theme';
import { useT } from '@/i18n';
import { contentApi } from '@/services/adapter';
import { ScreenContainer } from '@/components/screen-container';
import { AppText } from '@/components/ui/app-text';
import { AppButton } from '@/components/ui/app-button';
import { AuthField } from '@/components/ui/auth-field';
import { useAuthStore } from '@/store/auth-store';
import { useDescribeApiError, PASSWORD_POLICY_RE } from '@/utils/api-error';
import { spacing } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const { theme } = useTheme();
  const t = useT();
  const describeError = useDescribeApiError();
  const styles = getStyles(theme.colors);
  const setSession = useAuthStore((state) => state.setSession);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<{
    displayName?: string;
    email?: string;
    password?: string;
    terms?: string;
    form?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (displayName.trim().length < 2) nextErrors.displayName = t('auth.shortName');
    if (!EMAIL_RE.test(email.trim())) nextErrors.email = t('auth.invalidEmail');
    if (password.length < 8) nextErrors.password = t('auth.passwordPolicy');
    else if (!PASSWORD_POLICY_RE.test(password)) nextErrors.password = t('auth.passwordPolicy');
    if (!acceptTerms) nextErrors.terms = t('auth.acceptTermsRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const session = await contentApi.register({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        acceptTerms: true,
      });
      setSession(session);
      router.replace({
        pathname: '/auth/verify-email-notice',
        params: { email: session.user.email },
      });
    } catch (error) {
      setErrors({ form: describeError(error) });
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
          <AppText variant="display">{t('auth.registerTitle')}</AppText>

          <AuthField
            label={t('auth.displayNameLabel')}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            error={errors.displayName}
          />
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
            placeholder={t('auth.passwordPolicy')}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptTerms }}
            onPress={() => setAcceptTerms((prev) => !prev)}
            style={styles.termsRow}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                acceptTerms && { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
              ]}
            >
              {acceptTerms ? <AppText variant="label">{ '✓' }</AppText> : null}
            </View>
            <AppText variant="caption" color="textMuted" style={styles.termsText}>
              {t('auth.terms')}
            </AppText>
          </Pressable>
          {errors.terms ? (
            <AppText variant="caption" style={{ color: theme.colors.accent }}>
              {errors.terms}
            </AppText>
          ) : null}

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/legal/terms')}
            style={styles.linkButton}
          >
            <AppText variant="caption" style={{ color: theme.colors.accent }}>
              {t('auth.legalTerms')} →
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/legal/privacy')}
            style={styles.linkButton}
          >
            <AppText variant="caption" style={{ color: theme.colors.accent }}>
              {t('auth.legalPrivacy')} →
            </AppText>
          </Pressable>

          {errors.form ? (
            <AppText variant="caption" style={{ color: theme.colors.accent }} accessibilityLiveRegion="polite">
              {errors.form}
            </AppText>
          ) : null}

          <AppButton
            label={t('auth.registerCta')}
            onPress={() => void submit()}
            disabled={submitting}
          />

          <View style={styles.links}>
            <AppText variant="body" color="textMuted">
              {t('auth.haveAccount')}
            </AppText>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/auth/login')}
              style={styles.linkButton}
            >
              <AppText variant="body" style={{ color: theme.colors.accent }}>
                {t('auth.goLogin')}
              </AppText>
            </Pressable>
          </View>

          <AppText variant="caption" color="textSubtle" style={styles.notice}>
            {t('auth.mockNotice')}
          </AppText>
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
    termsRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing[2],
      paddingVertical: spacing[1],
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 2,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    termsText: {
      flex: 1,
    },
    linkButton: {
      minHeight: 32,
      justifyContent: 'center',
    },
    links: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[2],
      marginTop: spacing[2],
    },
    notice: {
      textAlign: 'center',
    },
  });
