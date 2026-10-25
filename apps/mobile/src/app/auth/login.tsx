/**
 * Giriş ekranı (Faz 3 — mock kimlik doğrulama).
 * Doğrulama sözleşme şemalarıyla aynı kurallara göre istemci tarafında yapılır;
 * gerçek kimlik akışı (argon2id + JWT + SecureStore) Faz 3 sunucu fazında
 * devreye alınacaktır. Mock hesap: deniz@ornek.com / perdego
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
import { spacing } from '@/theme/tokens';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const { theme } = useTheme();
  const t = useT();
  const styles = getStyles(theme.colors);
  const setSession = useAuthStore((state) => state.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const nextErrors: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) nextErrors.email = t('auth.invalidEmail');
    if (password.length < 6) nextErrors.password = t('auth.shortPassword');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const session = await contentApi.login({ email: email.trim(), password });
      setSession(session);
      router.replace('/');
    } catch {
      setErrors({ form: t('auth.loginFailed') });
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
          <AppText variant="caption" color="textSubtle">
            {t('auth.mockHint')}
          </AppText>

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
            error={errors.password}
          />

          {errors.form ? (
            <AppText
              variant="caption"
              style={{ color: theme.colors.accent }}
              accessibilityLiveRegion="polite"
            >
              {errors.form}
            </AppText>
          ) : null}

          <AppButton
            label={t('auth.loginCta')}
            onPress={() => void submit()}
            disabled={submitting}
          />

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
    notice: {
      textAlign: 'center',
    },
  });
